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
  calculateLingxiCost,
  isNightMode,
  type ChatMessage,
  type UserContext,
} from "@/lib/ai";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, message, history = [], coupleMode = false, deepMode = false } = body;

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

    // 判断消耗档位（deepMode 强制2次；常规模式按关键词自动判断；深夜×1.5）
    const nightMode = isNightMode();
    let lingxiCost = deepMode ? 2 : calculateLingxiCost(message.trim(), nightMode);
    // 常规模式上限1次（防止关键词误判升为2次）
    if (!deepMode) lingxiCost = Math.min(lingxiCost, 1);

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

    if (coupleMode && result.partnerId) {
      // 双人同频模式：加载伴侣档案
      const partnerResult = await prisma.result.findUnique({
        where: { id: result.partnerId },
      });

      if (partnerResult) {
        const partnerScores = partnerResult.scores as UserContext["scores"];
        const partnerContext: UserContext = {
          personalityType: partnerResult.personalityType,
          cityMatch: partnerResult.cityMatch,
          scores: partnerScores,
        };
        aiStream = await streamCoupleChat(selfContext, partnerContext, history as ChatMessage[], message.trim(), nightMode);
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
    logger.error("Chat 接口异常", { error: (err as Error).message });
    return NextResponse.json({ error: "服务器异常，请稍后重试" }, { status: 500 });
  }
}
