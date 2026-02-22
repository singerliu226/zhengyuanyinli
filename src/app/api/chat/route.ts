export const dynamic = "force-dynamic";

/**
 * POST /api/chat
 *
 * AI 情感问答接口（流式输出）v2.1
 * 变更：
 * - emotionCoins → lingxi，coinsCost → lingxiCost
 * - 新增深夜模式检测（北京时间 23:00-06:00）：消耗×1.5
 * - 新增双人同频模式（coupleMode: true）：AI 读取双方档案
 * - 灵犀不足时返回结构化数据，前端渲染充能引导而非简单文字
 *
 * 请求体：{ token, message, history, coupleMode? }
 * 响应头：X-Lingxi-Cost, X-Lingxi-Left, X-Night-Mode
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyResultToken } from "@/lib/jwt";
import {
  streamChat,
  streamCoupleChat,
  streamDiagnosis,
  calculateLingxiCost,
  isNightMode,
  type ChatMessage,
  type UserContext,
} from "@/lib/ai";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  // 最前置检测：环境变量未配置时立即返回，避免后续流程出现误导性错误
  if (!process.env.QWEN_API_KEY) {
    logger.error("QWEN_API_KEY 未配置，拒绝 chat 请求");
    return NextResponse.json(
      { error: "AI 服务未配置，请联系管理员（缺少 QWEN_API_KEY 环境变量）" },
      { status: 503 }
    );
  }

  // 用于 catch 块退还灵犀：仅在预扣成功后设为 true
  let lingxiDeducted = false;
  let deductedResultId = "";
  let deductedCost = 0;

  try {
    const body = await req.json();
    const { token, message, history = [], coupleMode = false, deepMode = false, diagnosisMode = false } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "缺少身份凭证" }, { status: 401 });
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "请输入问题" }, { status: 400 });
    }
    if (message.length > 500) {
      return NextResponse.json({ error: "问题不能超过500字" }, { status: 400 });
    }

    const payload = await verifyResultToken(token);
    if (!payload) {
      return NextResponse.json({ error: "凭证已过期，请重新打开报告页面" }, { status: 401 });
    }

    // 获取用户结果（含灵犀余额 + 伴侣ID）
    const result = await prisma.result.findUnique({
      where: { id: payload.resultId },
    });

    if (!result) {
      return NextResponse.json({ error: "测试结果不存在" }, { status: 404 });
    }

    // 判断消耗档位：诊断模式强制5次；深度模式2次；常规模式按关键词判断上限1次
    const nightMode = isNightMode();
    let lingxiCost: number;
    if (diagnosisMode) {
      lingxiCost = 5;
    } else if (deepMode) {
      lingxiCost = 2;
    } else {
      lingxiCost = Math.min(calculateLingxiCost(message.trim(), nightMode), 1);
    }

    // 灵犀不足：返回结构化信息，前端渲染充能引导
    if (result.lingxi < lingxiCost) {
      return NextResponse.json(
        {
          error: "lingxi_insufficient",
          lingxiLeft: result.lingxi,
          lingxiCost,
          message: `本次对话需 ${lingxiCost} 次灵犀，你还差 ${lingxiCost - result.lingxi} 次`,
        },
        { status: 402 }
      );
    }

    // 预扣灵犀（乐观锁，防并发超扣）
    const updated = await prisma.result.updateMany({
      where: { id: result.id, lingxi: { gte: lingxiCost } },
      data: { lingxi: { decrement: lingxiCost } },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "lingxi_insufficient", lingxiLeft: result.lingxi, lingxiCost }, { status: 402 });
    }

    // 标记预扣成功，后续 AI 调用失败时在 catch 块退还
    lingxiDeducted = true;
    deductedResultId = result.id;
    deductedCost = lingxiCost;

    // 记录用户消息
    await prisma.chat.create({
      data: {
        resultId: result.id,
        role: "user",
        content: message.trim(),
        lingxiCost: 0,
        isCoupleMode: coupleMode,
      },
    });

    logger.info("开始 AI 流式问答", {
      resultId: result.id,
      lingxiCost,
      lingxiLeft: result.lingxi - lingxiCost,
      nightMode,
      coupleMode,
    });

    const scores = result.scores as UserContext["scores"];
    const selfContext: UserContext = {
      personalityType: result.personalityType,
      cityMatch: result.cityMatch,
      scores,
    };

    // 构建流式 AI 响应
    let aiStream: ReadableStream<Uint8Array>;

    // 关系诊断模式：使用专用提示，给出全面的诊断报告
    if (diagnosisMode) {
      const partnerResult = result.partnerId
        ? await prisma.result.findUnique({
            where: { id: result.partnerId },
            select: { personalityType: true, cityMatch: true, scores: true },
          })
        : null;

      const partnerCtx = partnerResult
        ? {
            personalityType: partnerResult.personalityType,
            cityMatch: partnerResult.cityMatch,
            scores: partnerResult.scores as UserContext["scores"],
          }
        : undefined;

      aiStream = await streamDiagnosis(selfContext, message.trim(), partnerCtx, nightMode);
    } else if (coupleMode && result.partnerId) {
      // ── 双人同频模式 ──────────────────────────────────────────────
      // 1. 加载伴侣档案
      const partnerResult = await prisma.result.findUnique({
        where: { id: result.partnerId },
        select: {
          id: true,
          personalityType: true,
          cityMatch: true,
          scores: true,
          lingxi: true,
        },
      });

      if (partnerResult) {
        // 2. 同步扣除伴侣灵犀（若余额充足则扣，不足则仅扣发起方，不阻断对话）
        if (partnerResult.lingxi >= lingxiCost) {
          await prisma.result.updateMany({
            where: { id: partnerResult.id, lingxi: { gte: lingxiCost } },
            data: { lingxi: { decrement: lingxiCost } },
          });
          logger.info("双人模式同步扣除伴侣灵犀", {
            partnerResultId: partnerResult.id,
            lingxiCost,
          });
        } else {
          logger.info("伴侣灵犀不足，跳过同步扣除", {
            partnerResultId: partnerResult.id,
            partnerLingxi: partnerResult.lingxi,
            lingxiCost,
          });
        }

        // 3. 加载伴侣最近 5 条聊天记录，生成摘要供 AI 参考（不透明原文）
        const partnerChats = await prisma.chat.findMany({
          where: { resultId: partnerResult.id },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { role: true, content: true },
        });
        // 倒序还原时间线，过滤 AI 回复只取用户提问，生成简短摘要
        const partnerQuestions = partnerChats
          .reverse()
          .filter((c) => c.role === "user")
          .map((c) => c.content)
          .join("；");
        const partnerChatSummary = partnerQuestions.length > 0
          ? `TA 近期关注的问题：${partnerQuestions}`
          : undefined;

        const partnerScores = partnerResult.scores as UserContext["scores"];
        const partnerContext: UserContext = {
          personalityType: partnerResult.personalityType,
          cityMatch: partnerResult.cityMatch,
          scores: partnerScores,
        };
        aiStream = await streamCoupleChat(
          selfContext, partnerContext, history as ChatMessage[],
          message.trim(), nightMode, partnerChatSummary
        );
      } else {
        aiStream = await streamChat(selfContext, history as ChatMessage[], message.trim(), nightMode);
      }
    } else {
      aiStream = await streamChat(selfContext, history as ChatMessage[], message.trim(), nightMode);
    }

    // TransformStream 在流结束后将 AI 回复存库
    let fullResponse = "";
    const encoder = new TextEncoder();
    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        fullResponse += text;
        controller.enqueue(encoder.encode(text));
      },
      async flush() {
        try {
          await prisma.chat.create({
            data: {
              resultId: result.id,
              role: "assistant",
              content: fullResponse,
              lingxiCost: lingxiCost,
              isCoupleMode: coupleMode,
            },
          });
          logger.debug("AI 回复已存库", { resultId: result.id, length: fullResponse.length });
        } catch (err) {
          logger.error("AI 回复存库失败", { error: (err as Error).message });
        }
      },
    });

    aiStream.pipeTo(transformStream.writable).catch((err) => {
      logger.error("AI 流管道异常", { error: (err as Error).message });
    });

    return new Response(transformStream.readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Lingxi-Cost": String(lingxiCost),
        "X-Lingxi-Left": String(result.lingxi - lingxiCost),
        "X-Night-Mode": String(nightMode),
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    const errMsg = (err as Error).message ?? "";
    logger.error("Chat 接口异常", { error: errMsg });

    // AI 调用失败时退还已预扣的灵犀，避免用户白白扣费
    if (lingxiDeducted && deductedResultId) {
      try {
        await prisma.result.update({
          where: { id: deductedResultId },
          data: { lingxi: { increment: deductedCost } },
        });
        logger.info("AI 调用失败，灵犀已退回", { resultId: deductedResultId, deductedCost });
      } catch (refundErr) {
        logger.error("灵犀退回失败", { resultId: deductedResultId, error: (refundErr as Error).message });
      }
    }

    // 把内层抛出的具体错误透传给前端，而不是统一掩盖为"服务器异常"
    if (errMsg.includes("AI 服务暂时不可用")) {
      return NextResponse.json({ error: errMsg }, { status: 503 });
    }
    return NextResponse.json({ error: "服务器异常，请稍后重试" }, { status: 500 });
  }
}
