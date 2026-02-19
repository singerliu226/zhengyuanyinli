/**
 * POST /api/payment/create
 *
 * 创建灵犀充能支付订单
 * 流程：验证 token → 查询套餐 → 写入 PaymentOrder → 调用 PayJS → 返回收银台 URL
 *
 * 请求体：{ token: string, packageId: 'single'|'standard'|'deep' }
 * 响应：{ success: true, cashierUrl: string } | { success: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyResultToken } from "@/lib/jwt";
import { createPayjsOrder, getPackage, type PackageId } from "@/lib/payment";
import { nanoid } from "nanoid";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, packageId } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "缺少身份凭证" }, { status: 401 });
    }

    const pkg = getPackage(packageId as PackageId);
    if (!pkg) {
      return NextResponse.json({ success: false, error: "无效的套餐" }, { status: 400 });
    }

    const payload = await verifyResultToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: "凭证已过期" }, { status: 401 });
    }

    const result = await prisma.result.findUnique({
      where: { id: payload.resultId },
      select: { id: true },
    });

    if (!result) {
      return NextResponse.json({ success: false, error: "测试结果不存在" }, { status: 404 });
    }

    // 生成商户订单号
    const outTradeNo = `LCY${Date.now()}${nanoid(6).toUpperCase()}`;

    // 写入待支付订单
    await prisma.paymentOrder.create({
      data: {
        outTradeNo,
        resultId: result.id,
        amount: pkg.price,
        lingxiCount: pkg.lingxi,
        packageName: pkg.name,
        status: "pending",
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://example.com";
    const notifyUrl = `${appUrl}/api/payment/callback`;
    const callbackUrl = `${appUrl}/recharge/${token}?status=success&pkg=${pkg.name}`;

    // 调用 PayJS 创建收银台订单
    const payjsResult = await createPayjsOrder({
      outTradeNo,
      totalFee: pkg.price,
      body: `正缘引力·${pkg.name}`,
      attach: `${result.id}:${pkg.lingxi}:${outTradeNo}`,
      notifyUrl,
      callbackUrl,
    });

    if (!payjsResult.success) {
      logger.error("PayJS 创建订单失败", { outTradeNo, error: payjsResult.error });
      return NextResponse.json({ success: false, error: payjsResult.error }, { status: 500 });
    }

    // 更新 PayJS 订单号
    await prisma.paymentOrder.update({
      where: { outTradeNo },
      data: { payjsOrderId: payjsResult.payjsOrderId },
    });

    logger.info("支付订单创建成功", {
      outTradeNo,
      resultId: result.id,
      pkg: pkg.name,
      amount: pkg.price,
    });

    return NextResponse.json({
      success: true,
      cashierUrl: payjsResult.cashierUrl,
      outTradeNo,
    });
  } catch (err) {
    logger.error("创建支付订单异常", { error: (err as Error).message });
    return NextResponse.json({ success: false, error: "服务器异常" }, { status: 500 });
  }
}
