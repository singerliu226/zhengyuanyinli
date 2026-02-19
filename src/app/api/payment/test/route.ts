export const dynamic = "force-dynamic";

/**
 * POST /api/payment/test
 *
 * 测试支付接口：模拟 PayJS 回调，直接给用户充值灵犀。
 * 仅在 NODE_ENV=development 或 ENABLE_TEST_PAYMENT=true 时生效，
 * 生产环境直接返回 403，防止被滥用。
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyResultToken } from "@/lib/jwt";
import logger from "@/lib/logger";

const PACKAGES: Record<string, number> = {
  single: 2,
  standard: 15,
  deep: 50,
};

export async function POST(req: NextRequest) {
  // 安全校验：仅开发环境或显式开启测试支付时可用
  const isTestAllowed =
    process.env.NODE_ENV === "development" ||
    process.env.ENABLE_TEST_PAYMENT === "true";

  if (!isTestAllowed) {
    return NextResponse.json({ success: false, error: "测试支付仅在开发环境可用" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { token, packageId } = body;

    if (!token || !packageId) {
      return NextResponse.json({ success: false, error: "参数缺失" }, { status: 400 });
    }

    const payload = await verifyResultToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: "凭证无效" }, { status: 401 });
    }

    const lingxiToAdd = PACKAGES[packageId];
    if (!lingxiToAdd) {
      return NextResponse.json({ success: false, error: "套餐不存在" }, { status: 400 });
    }

    // 直接充值灵犀
    const updated = await prisma.result.update({
      where: { id: payload.resultId },
      data: { lingxi: { increment: lingxiToAdd } },
      select: { lingxi: true },
    });

    logger.info("测试支付成功", {
      resultId: payload.resultId,
      packageId,
      lingxiAdded: lingxiToAdd,
      newBalance: updated.lingxi,
    });

    return NextResponse.json({
      success: true,
      lingxiAdded: lingxiToAdd,
      newBalance: updated.lingxi,
    });
  } catch (err) {
    logger.error("测试支付异常", { error: (err as Error).message });
    return NextResponse.json({ success: false, error: "服务器异常" }, { status: 500 });
  }
}
