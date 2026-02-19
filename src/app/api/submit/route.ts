/**
 * POST /api/submit
 *
 * 答题提交接口 v2.1
 * 变更：
 * - 读取 cardKey.planType，按版本设置初始灵犀次数（personal=3, couple=8, gift=15）
 * - 写入 expiresAt（72小时后报告有效期）
 * - 双人版生成 coupleToken，供伴侣通过邀请链接参与测试
 *
 * 请求体：{ cardKeyId, answers }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateScore, type UserAnswers } from "@/lib/scoring";
import { generateReport } from "@/lib/report";
import { markCardKeyUsed, getInitialLingxi } from "@/lib/cardkey";
import { signResultToken } from "@/lib/jwt";
import { nanoid } from "nanoid";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cardKeyId, answers } = body;

    if (!cardKeyId || typeof cardKeyId !== "string") {
      return NextResponse.json({ success: false, error: "无效的激活凭证" }, { status: 400 });
    }
    if (!answers || typeof answers !== "object") {
      return NextResponse.json({ success: false, error: "答案数据无效" }, { status: 400 });
    }

    // 校验 cardKey 状态（含 planType）
    const cardKey = await prisma.cardKey.findUnique({
      where: { id: cardKeyId },
      include: { result: true },
    });

    if (!cardKey) {
      return NextResponse.json({ success: false, error: "激活凭证不存在" }, { status: 400 });
    }

    // 已有结果则直接返回（支持刷新后重进）
    if (cardKey.result) {
      logger.info("卡密已有结果，返回现有 token", { cardKeyId });
      return NextResponse.json({
        success: true,
        token: cardKey.result.token,
        planType: cardKey.planType,
        coupleToken: cardKey.result.coupleToken,
      });
    }

    if (cardKey.status !== "activated") {
      return NextResponse.json({ success: false, error: "激活码状态异常，请重新激活" }, { status: 400 });
    }

    const answeredCount = Object.keys(answers).length;
    if (answeredCount < 20) {
      return NextResponse.json({ success: false, error: `请至少回答20道题（当前：${answeredCount}题）` }, { status: 400 });
    }

    // 执行评分
    const scoringResult = calculateScore(answers as UserAnswers);
    const reportData = generateReport(scoringResult);

    // 按版本初始化灵犀次数
    const initialLingxi = getInitialLingxi(cardKey.planType);

    // 双人版生成邀请 coupleToken
    const coupleToken = cardKey.planType === "couple" || cardKey.planType === "gift"
      ? nanoid(12)
      : null;

    // 报告72小时有效期
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    // 先占位签发 token
    const tempToken = await signResultToken({
      resultId: "placeholder",
      personalityType: reportData.personalityName,
    });

    const result = await prisma.result.create({
      data: {
        token: tempToken,
        cardKeyId,
        personalityType: reportData.personalityName,
        cityMatch: reportData.cityMatch,
        scores: reportData.scores,
        reportContent: reportData as object,
        lingxi: initialLingxi,
        expiresAt,
        coupleToken,
      },
    });

    // 用真实 resultId 重新签发
    const finalToken = await signResultToken({
      resultId: result.id,
      personalityType: reportData.personalityName,
    });

    await prisma.result.update({
      where: { id: result.id },
      data: { token: finalToken },
    });

    await markCardKeyUsed(cardKeyId);

    logger.info("测试提交成功", {
      resultId: result.id,
      personalityType: reportData.personalityName,
      cityMatch: reportData.cityMatch,
      planType: cardKey.planType,
      initialLingxi,
      hasCoupleToken: !!coupleToken,
    });

    return NextResponse.json({
      success: true,
      token: finalToken,
      planType: cardKey.planType,
      coupleToken,
    });
  } catch (err) {
    logger.error("提交接口异常", { error: (err as Error).message, stack: (err as Error).stack });
    return NextResponse.json({ success: false, error: "服务器异常，请稍后重试" }, { status: 500 });
  }
}
