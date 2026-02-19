export const dynamic = "force-dynamic";

/**
 * POST /api/activate
 *
 * 卡密激活接口：接收用户输入的激活码和手机号，
 * 执行防滥用校验链后激活卡密，返回 cardKeyId 供后续提交使用。
 *
 * 请求体：{ code: string, phone: string }
 * 响应：{ success: true, cardKeyId: string } | { success: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { activateCardKey } from "@/lib/cardkey";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, phone } = body;

    // 基础参数校验
    if (!code || typeof code !== "string") {
      return NextResponse.json({ success: false, error: "请输入激活码" }, { status: 400 });
    }
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ success: false, error: "请输入手机号" }, { status: 400 });
    }

    // 手机号格式校验（11位数字）
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      return NextResponse.json({ success: false, error: "请输入正确的手机号格式" }, { status: 400 });
    }

    // 获取请求元数据（用于设备指纹）
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    const result = await activateCardKey(code, phone, ip, userAgent);

    if (!result.success) {
      // canRetrieve=true 时前端引导去「找回报告」而非仅报错
      return NextResponse.json(
        { success: false, error: result.error, canRetrieve: result.canRetrieve ?? false },
        { status: 400 }
      );
    }

    // alreadyCompleted=true 时前端直接跳转到已有报告
    return NextResponse.json({
      success: true,
      cardKeyId: result.cardKeyId,
      planType: result.planType,
      resultToken: result.resultToken ?? null,
      alreadyCompleted: result.alreadyCompleted ?? false,
    });
  } catch (err) {
    logger.error("激活接口异常", { error: (err as Error).message });
    return NextResponse.json({ success: false, error: "服务器异常，请稍后重试" }, { status: 500 });
  }
}
