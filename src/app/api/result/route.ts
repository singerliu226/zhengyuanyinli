/**
 * GET /api/result?token=xxx
 *
 * 获取测试结果接口 v2.1
 * 变更：emotionCoins → lingxi，新增 expiresAt/partnerId/coupleToken 返回
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyResultToken } from "@/lib/jwt";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "缺少 token 参数" }, { status: 400 });
    }

    const payload = await verifyResultToken(token);
    if (!payload) {
      return NextResponse.json({ error: "报告链接已过期，请重新联系客服" }, { status: 401 });
    }

    const result = await prisma.result.findUnique({
      where: { id: payload.resultId },
      select: {
        id: true,
        reportContent: true,
        lingxi: true,
        personalityType: true,
        cityMatch: true,
        expiresAt: true,
        coupleToken: true,
        partnerId: true,
        cardKey: { select: { planType: true } },
        createdAt: true,
      },
    });

    if (!result) {
      return NextResponse.json({ error: "报告不存在" }, { status: 404 });
    }

    // 报告是否已过期（过期后仍返回但标记 expired）
    const isExpired = result.expiresAt ? new Date() > result.expiresAt : false;

    // 伴侣已加入则查询伴侣的基本信息
    let partnerInfo = null;
    if (result.partnerId) {
      const partner = await prisma.result.findUnique({
        where: { id: result.partnerId },
        select: { personalityType: true, cityMatch: true, scores: true },
      });
      if (partner) {
        partnerInfo = {
          personalityType: partner.personalityType,
          cityMatch: partner.cityMatch,
          scores: partner.scores,
        };
      }
    }

    logger.debug("报告查询成功", { resultId: payload.resultId, isExpired });

    return NextResponse.json({
      report: result.reportContent,
      lingxiLeft: result.lingxi,
      personalityType: result.personalityType,
      cityMatch: result.cityMatch,
      expiresAt: result.expiresAt,
      isExpired,
      coupleToken: result.coupleToken,
      hasPartner: !!result.partnerId,
      partnerInfo,
      planType: result.cardKey.planType,
      resultId: result.id,
      createdAt: result.createdAt,
    });
  } catch (err) {
    logger.error("结果查询接口异常", { error: (err as Error).message });
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
