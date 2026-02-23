export const dynamic = "force-dynamic";

/**
 * POST /api/recharge/redeem
 *
 * 充值码兑换接口：用户在报告页/聊天页输入充值码，验证后自动充值灵犀。
 *
 * 请求体：{ token: string, code: string }
 * - token: 用户的 JWT result token（身份凭证）
 * - code:  充值码（如 "LX-ABCD-EFGH"）
 *
 * 响应：
 * - { success: true,  lingxiCount: 15, newBalance: 23, packageName: "灵犀标准包" }
 * - { success: false, error: "充值码不存在" }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyResultToken } from "@/lib/jwt";
import { redeemRechargeCode } from "@/lib/cardkey";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, code } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "缺少身份凭证" }, { status: 401 });
    }

    if (!code || typeof code !== "string" || code.trim().length < 5) {
      return NextResponse.json({ success: false, error: "请输入有效的充值码" }, { status: 400 });
    }

    const payload = await verifyResultToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: "凭证已过期，请重新进入报告页" }, { status: 401 });
    }

    const result = await redeemRechargeCode(code, payload.resultId);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    logger.info("充值码兑换成功", {
      resultId: payload.resultId,
      lingxiCount: result.lingxiCount,
      newBalance: result.newBalance,
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error("充值码兑换异常", { error: (err as Error).message });
    return NextResponse.json({ success: false, error: "服务器异常，请稍后重试" }, { status: 500 });
  }
}
