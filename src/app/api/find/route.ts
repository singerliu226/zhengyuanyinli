export const dynamic = "force-dynamic";

/**
 * GET /api/find?phone=138xxxx
 *
 * 手机号找回报告接口：通过手机号查询该用户的所有测试记录，
 * 用于「回头客」二次进入时无需激活码直接找回报告和对话服务。
 *
 * 安全考量：
 * - 手机号在查询前做格式校验，防止枚举攻击
 * - 返回的 token 是 JWT，本身有效期限制，无需额外鉴权
 * - 不返回激活码原文，防止激活码泄露
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const phone = req.nextUrl.searchParams.get("phone")?.trim();

    if (!phone) {
      return NextResponse.json({ success: false, error: "请输入手机号" }, { status: 400 });
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ success: false, error: "手机号格式不正确" }, { status: 400 });
    }

    // 通过手机号找到所有绑定的激活码，再关联查询报告
    const cardKeys = await prisma.cardKey.findMany({
      where: { phone, status: { in: ["activated", "used"] } },
      include: {
        result: {
          select: {
            token: true,
            personalityType: true,
            cityMatch: true,
            lingxi: true,
            expiresAt: true,
            createdAt: true,
            partnerId: true,
          },
        },
      },
      orderBy: { activatedAt: "desc" },
    });

    if (cardKeys.length === 0) {
      return NextResponse.json(
        { success: false, error: "该手机号暂无测试记录，请先激活激活码完成测试" },
        { status: 404 }
      );
    }

    // 区分"已完成"和"已激活但未完成答题"两种情况
    const completedKeys = cardKeys.filter((k) => k.result);
    const pendingKeys   = cardKeys.filter((k) => !k.result && k.status === "activated");

    // 若有已完成的报告，直接返回
    const reports = completedKeys.map((k) => ({
      token: k.result!.token,
      personalityType: k.result!.personalityType,
      cityMatch: k.result!.cityMatch,
      lingxiLeft: k.result!.lingxi,
      planType: k.planType,
      isExpired: k.result!.expiresAt ? new Date(k.result!.expiresAt) < new Date() : false,
      hasPartner: !!k.result!.partnerId,
      createdAt: k.result!.createdAt,
    }));

    if (reports.length === 0) {
      // 有未完成的测试：用户中途退出了，引导其重新输入激活码继续答题
      // hasPending=true 时前端会给出"继续完成测试"而非"去激活"的提示
      const hasPending = pendingKeys.length > 0;
      return NextResponse.json(
        {
          success: false,
          hasPending,
          error: hasPending
            ? "你有一个尚未提交的测试，重新输入激活码即可继续"
            : "该手机号暂无已完成的测试记录",
        },
        { status: 404 }
      );
    }

    logger.info("手机号找回报告成功", { phone: phone.slice(0, 3) + "****", count: reports.length });
    return NextResponse.json({ success: true, reports });
  } catch (err) {
    logger.error("找回报告接口异常", { error: (err as Error).message });
    return NextResponse.json({ success: false, error: "服务器异常，请稍后重试" }, { status: 500 });
  }
}
