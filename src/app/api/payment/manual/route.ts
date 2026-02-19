export const dynamic = "force-dynamic";

/**
 * /api/payment/manual - 手动收款记录接口
 *
 * 用户在页面填写手机号并点击「我已完成支付」时调用。
 * 将支付意向写入 ManualPaymentRecord 表，方便管理员在后台确认并完成充值/发码。
 *
 * POST body:
 *   {
 *     phone:       string,   // 用户填写的手机号
 *     channel:     string,   // wechat | alipay
 *     amount:      string,   // 支付金额，如 "9.9"
 *     packageName: string,   // 套餐名，如 "个人探索版"
 *     packageId:   string,   // 套餐ID，如 "personal"
 *     type:        string,   // initial | recharge
 *     lingxiCount: number?,  // recharge 时应充次数
 *     resultToken: string?,  // recharge 时报告 token
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

/** 中国大陆手机号基础校验（11位，1开头） */
function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone.trim());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      phone,
      channel,
      amount,
      packageName,
      packageId,
      type = "initial",
      lingxiCount,
      resultToken,
    } = body;

    if (!phone || !channel || !amount || !packageName || !packageId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    if (!isValidPhone(phone)) {
      return NextResponse.json({ error: "手机号格式不正确" }, { status: 400 });
    }

    if (!["initial", "recharge"].includes(type)) {
      return NextResponse.json({ error: "无效的记录类型" }, { status: 400 });
    }

    const record = await prisma.manualPaymentRecord.create({
      data: {
        phone: phone.trim(),
        channel,
        amount,
        packageName,
        packageId,
        type,
        lingxiCount: lingxiCount ?? null,
        resultToken: resultToken ?? null,
        status: "pending",
      },
    });

    logger.info("手动收款记录已创建", {
      id: record.id,
      phone: phone.trim().slice(0, 3) + "****",
      packageId,
      type,
      amount,
    });

    return NextResponse.json({ success: true, id: record.id });
  } catch (err) {
    logger.error("创建手动收款记录失败", { error: (err as Error).message });
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
