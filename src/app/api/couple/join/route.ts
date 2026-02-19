/**
 * POST /api/couple/join
 *
 * 双人邀请接口：伴侣通过 coupleToken 完成测试并与发起人结对
 *
 * BUG-FIX: 使用 Prisma 交互式事务（interactive transaction）将
 * virtualCardKey + partnerResult 创建 + primaryResult 双向绑定全部纳入同一事务，
 * 保证任意步骤失败时完整回滚，不会产生孤立记录或单向绑定。
 *
 * 请求体：{ coupleToken: string, answers: Record<number, string> }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
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

    // 预签临时 token（异步函数无法在事务回调内调用）
    const tempToken = await signResultToken({
      resultId: "placeholder_partner",
      personalityType: reportData.personalityName,
    });

    // ── 交互式事务：原子完成三步操作 ──────────────────────────────────────
    // 任何一步失败自动回滚全部操作
    const partnerResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Step 1: 为伴侣创建虚拟 CardKey（外键约束要求，伴侣无需真实激活码）
      const virtualCardKey = await tx.cardKey.create({
        data: {
          code: `PARTNER-${nanoid(12).toUpperCase()}`,
          status: "used",
          planType: "partner",
          usedAt: new Date(),
        },
      });

      // Step 2: 创建伴侣 Result（partnerId 先指向发起人）
      const partner = await tx.result.create({
        data: {
          token: tempToken,
          cardKeyId: virtualCardKey.id,
          personalityType: reportData.personalityName,
          cityMatch: reportData.cityMatch,
          scores: reportData.scores,
          reportContent: reportData as object,
          lingxi: initialLingxi,
          expiresAt,
          partnerId: primaryResult.id,
        },
      });

      // Step 3: 更新发起人 partnerId（建立双向绑定）
      await tx.result.update({
        where: { id: primaryResult.id },
        data: { partnerId: partner.id },
      });

      return partner;
    });

    // 用真实 resultId 重新签发最终 token（在事务外，避免影响事务超时）
    const finalToken = await signResultToken({
      resultId: partnerResult.id,
      personalityType: reportData.personalityName,
    });

    await prisma.result.update({
      where: { id: partnerResult.id },
      data: { token: finalToken },
    });

    logger.info("双人结对成功", {
      primaryResultId: primaryResult.id,
      partnerResultId: partnerResult.id,
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
    logger.error("双人加入接口异常", { error: (err as Error).message });
    return NextResponse.json({ success: false, error: "服务器异常，请稍后重试" }, { status: 500 });
  }
}
