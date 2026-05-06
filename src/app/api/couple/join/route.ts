export const dynamic = "force-dynamic";

/**
 * POST /api/couple/join
 *
 * 双人邀请接口：伴侣通过 coupleToken 完成测试并与发起人结对
 *
 * 使用批量事务将 virtualCardKey + partnerResult 创建 + primaryResult 双向绑定
 * 全部纳入同一事务。避免交互式事务在部分部署连接方式下不稳定。
 *
 * 请求体：{ coupleToken: string, answers: Record<number, string> }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateScore, type UserAnswers } from "@/lib/scoring";
import { generateReport } from "@/lib/report";
import { signResultToken } from "@/lib/jwt";
import { nanoid } from "nanoid";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { coupleToken, answers } = body;

    if (!coupleToken || typeof coupleToken !== "string") {
      return NextResponse.json({ success: false, error: "无效的邀请链接" }, { status: 400 });
    }
    if (!answers || typeof answers !== "object") {
      return NextResponse.json({ success: false, error: "答案数据无效" }, { status: 400 });
    }

    // 通过 coupleToken 找到发起人 Result
    const primaryResult = await prisma.result.findUnique({
      where: { coupleToken },
      include: { cardKey: true },
    });

    if (!primaryResult) {
      return NextResponse.json({ success: false, error: "邀请链接无效或已过期" }, { status: 404 });
    }

    // 已有伴侣 → 幂等返回（伴侣刷新页面后重进）
    if (primaryResult.partnerId) {
      const existingPartner = await prisma.result.findUnique({
        where: { id: primaryResult.partnerId },
        select: { token: true },
      });
      if (existingPartner) {
        logger.info("伴侣已完成测试，幂等返回现有 token", { coupleToken });
        return NextResponse.json({ success: true, token: existingPartner.token, alreadyJoined: true });
      }
    }

    const answeredCount = Object.keys(answers).length;
    if (answeredCount < 20) {
      return NextResponse.json({ success: false, error: `请至少回答20道题（当前：${answeredCount}题）` }, { status: 400 });
    }

    // 评分在事务外执行（纯 CPU 计算，不需要 DB 锁）
    const scoringResult = calculateScore(answers as UserAnswers);
    const reportData = generateReport(scoringResult);

    const planType = primaryResult.cardKey.planType;
    const initialLingxi = planType === "gift" ? 15 : 8;
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    // 预先生成 ID 和 token，避免先写临时 token 再二次更新。
    const virtualCardKeyId = `ck_partner_${nanoid(16)}`;
    const partnerResultId = `rs_partner_${nanoid(16)}`;
    const finalToken = await signResultToken({
      resultId: partnerResultId,
      personalityType: reportData.personalityName,
    });

    // ── 批量事务：原子完成三步操作 ──────────────────────────────────────
    // 任何一步失败自动回滚全部操作
    await prisma.$transaction([
      prisma.cardKey.create({
        data: {
          id: virtualCardKeyId,
          code: `PARTNER-${nanoid(12).toUpperCase()}`,
          status: "used",
          planType: "partner",
          usedAt: new Date(),
        },
      }),
      prisma.result.create({
        data: {
          id: partnerResultId,
          token: finalToken,
          cardKeyId: virtualCardKeyId,
          personalityType: reportData.personalityName,
          cityMatch: reportData.cityMatch,
          scores: reportData.scores,
          reportContent: reportData as object,
          lingxi: initialLingxi,
          expiresAt,
          partnerId: primaryResult.id,
        },
      }),
      prisma.result.update({
        where: { id: primaryResult.id },
        data: { partnerId: partnerResultId },
      }),
    ]);

    logger.info("双人结对成功", {
      primaryResultId: primaryResult.id,
      partnerResultId,
      primaryType: primaryResult.personalityType,
      partnerType: reportData.personalityName,
    });

    return NextResponse.json({
      success: true,
      token: finalToken,
      partnerPersonalityType: reportData.personalityName,
      partnerCityMatch: reportData.cityMatch,
    });
  } catch (err) {
    logger.error("双人加入接口异常", { error: (err as Error).message, stack: (err as Error).stack });
    return NextResponse.json({ success: false, error: "服务器异常，请稍后重试" }, { status: 500 });
  }
}
