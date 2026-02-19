/**
 * POST /api/payment/callback
 *
 * 虎皮椒支付（PayJS）异步回调接口
 * 流程：验证签名 → 幂等校验 → 更新订单状态 → 充值灵犀 → 返回 SUCCESS
 *
 * PayJS 要求回调返回字符串 "SUCCESS" 表示接收成功，否则会重试最多3次（间隔1/2/5分钟）
 *
 * 回调参数（POST form-encoded）：
 * return_code=1&total_fee=1990&out_trade_no=xxx&payjs_order_id=xxx&attach=resultId:lingxi:outTradeNo&sign=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPayjsCallback } from "@/lib/payment";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    // PayJS 以 form-encoded 格式发送回调
    const text = await req.text();
    const params = Object.fromEntries(new URLSearchParams(text));

    logger.info("收到 PayJS 回调", { outTradeNo: params.out_trade_no, returnCode: params.return_code });

    // 校验签名（防伪造）
    if (!verifyPayjsCallback(params)) {
      logger.warn("PayJS 回调签名校验失败，忽略", { params });
      return new Response("FAIL", { status: 400 });
    }

    // 只处理支付成功的回调
    if (params.return_code !== "1") {
      logger.info("PayJS 回调非成功状态，忽略", { returnCode: params.return_code });
      return new Response("SUCCESS");
    }

    const { out_trade_no: outTradeNo, payjs_order_id: payjsOrderId, attach } = params;

    if (!outTradeNo || !attach) {
      logger.warn("PayJS 回调缺少关键参数", { params });
      return new Response("FAIL", { status: 400 });
    }

    // 解析 attach：resultId:lingxiCount:outTradeNo
    const attachParts = attach.split(":");
    if (attachParts.length < 2) {
      logger.warn("PayJS 回调 attach 格式异常", { attach });
      return new Response("FAIL", { status: 400 });
    }
    const [resultId, lingxiCountStr] = attachParts;
    const lingxiCount = parseInt(lingxiCountStr, 10);

    if (!resultId || isNaN(lingxiCount) || lingxiCount <= 0) {
      logger.warn("PayJS 回调 attach 数据异常", { resultId, lingxiCount });
      return new Response("FAIL", { status: 400 });
    }

    // 幂等校验：已处理过的订单直接返回 SUCCESS（PayJS 会重试）
    const existingOrder = await prisma.paymentOrder.findUnique({
      where: { outTradeNo },
    });

    if (!existingOrder) {
      logger.warn("PayJS 回调订单不存在", { outTradeNo });
      return new Response("SUCCESS"); // 不重试未知订单
    }

    if (existingOrder.status === "paid") {
      logger.info("PayJS 重复回调，已处理，忽略", { outTradeNo });
      return new Response("SUCCESS");
    }

    // 使用事务：更新订单 + 充值灵犀（原子操作，防止部分失败）
    await prisma.$transaction([
      prisma.paymentOrder.update({
        where: { outTradeNo },
        data: {
          status: "paid",
          payjsOrderId: payjsOrderId ?? existingOrder.payjsOrderId,
          paidAt: new Date(),
        },
      }),
      prisma.result.update({
        where: { id: resultId },
        data: { lingxi: { increment: lingxiCount } },
      }),
    ]);

    logger.info("灵犀充值成功", { outTradeNo, resultId, lingxiCount });

    // 必须返回字符串 "SUCCESS"
    return new Response("SUCCESS");
  } catch (err) {
    logger.error("PayJS 回调处理异常", { error: (err as Error).message });
    // 返回非 SUCCESS 让 PayJS 重试
    return new Response("FAIL", { status: 500 });
  }
}
