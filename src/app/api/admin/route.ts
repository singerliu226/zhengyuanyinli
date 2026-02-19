/**
 * /api/admin - 后台管理接口 v2.1
 * 变更：emotionCoins → lingxi，generate 支持 planType 参数
 *
 * 所有请求需要通过 Authorization: Bearer {ADMIN_SECRET} 认证
 *
 * GET  /api/admin?action=stats          - 统计数据
 * GET  /api/admin?action=keys&batch=id  - 某批次激活码列表
 * GET  /api/admin?action=results        - 近50条用户结果
 * GET  /api/admin?action=payments       - 近50条支付订单
 * POST { action: 'generate', count, batchName, planType } - 批量生成激活码
 * POST { action: 'recharge', resultId, amount }           - 手动充值灵犀
 * POST { action: 'ban', code }                            - 封禁激活码
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateCardKeyBatch } from "@/lib/cardkey";
import logger from "@/lib/logger";

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("Authorization");
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  try {
    if (action === "stats") {
      const [total, activated, used, results, chatCount, paidOrders] = await Promise.all([
        prisma.cardKey.count(),
        prisma.cardKey.count({ where: { status: "activated" } }),
        prisma.cardKey.count({ where: { status: "used" } }),
        prisma.result.count(),
        prisma.chat.count({ where: { role: "user" } }),
        prisma.paymentOrder.count({ where: { status: "paid" } }),
      ]);

      const batches = await prisma.cardBatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      return NextResponse.json({ stats: { total, activated, used, results, chatCount, paidOrders }, batches });
    }

    if (action === "keys") {
      const batchId = searchParams.get("batch");
      const keys = await prisma.cardKey.findMany({
        where: batchId ? { batchId } : undefined,
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          code: true,
          status: true,
          planType: true,
          phone: true,
          activatedAt: true,
          usedAt: true,
          createdAt: true,
        },
      });
      return NextResponse.json({ keys });
    }

    if (action === "results") {
      const results = await prisma.result.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          personalityType: true,
          cityMatch: true,
          lingxi: true,
          partnerId: true,
          createdAt: true,
          cardKey: { select: { planType: true } },
          _count: { select: { chatHistory: true } },
        },
      });
      return NextResponse.json({ results });
    }

    if (action === "payments") {
      const payments = await prisma.paymentOrder.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          outTradeNo: true,
          resultId: true,
          amount: true,
          lingxiCount: true,
          packageName: true,
          status: true,
          paidAt: true,
          createdAt: true,
        },
      });
      return NextResponse.json({ payments });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (err) {
    logger.error("Admin GET 接口异常", { error: (err as Error).message });
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "generate") {
      const { count, batchName, planType = "personal" } = body;
      if (!count || count < 1 || count > 1000) {
        return NextResponse.json({ error: "数量须在1-1000之间" }, { status: 400 });
      }
      if (!batchName || typeof batchName !== "string") {
        return NextResponse.json({ error: "请输入批次名称" }, { status: 400 });
      }
      if (!["personal", "couple", "gift"].includes(planType)) {
        return NextResponse.json({ error: "无效的版本类型" }, { status: 400 });
      }

      const codes = await generateCardKeyBatch(count, batchName, planType);
      logger.info("后台批量生成激活码", { count: codes.length, batchName, planType });

      return NextResponse.json({
        success: true,
        codes,
        message: `成功生成 ${codes.length} 张 [${planType}] 激活码`,
      });
    }

    if (action === "recharge") {
      // 手动充值灵犀（支付异常等场景的兜底）
      const { resultId, amount } = body;
      if (!resultId || !amount || amount < 1 || amount > 10000) {
        return NextResponse.json({ error: "参数无效" }, { status: 400 });
      }

      const result = await prisma.result.update({
        where: { id: resultId },
        data: { lingxi: { increment: amount } },
      });

      logger.info("手动充值灵犀", { resultId, amount, newBalance: result.lingxi });
      return NextResponse.json({
        success: true,
        newBalance: result.lingxi,
        message: `已充值 ${amount} 次灵犀`,
      });
    }

    if (action === "ban") {
      const { code } = body;
      if (!code) {
        return NextResponse.json({ error: "请提供激活码" }, { status: 400 });
      }

      await prisma.cardKey.update({
        where: { code: code.trim().toUpperCase() },
        data: { status: "banned" },
      });

      logger.warn("激活码已封禁", { code });
      return NextResponse.json({ success: true, message: "激活码已封禁" });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (err) {
    logger.error("Admin POST 接口异常", { error: (err as Error).message });
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
