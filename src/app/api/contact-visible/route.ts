export const dynamic = "force-dynamic";

/**
 * GET /api/contact-visible?token={jwt}
 *
 * 检查用户是否满足「可见客服联系方式」的条件：
 * - 曾经发送过至少 1 条 AI 对话（Chat.role = "user"），OR
 * - 有至少 1 笔已完成的充值订单（PaymentOrder.status = "paid"）
 *
 * 通过 JWT 鉴权，避免接口被无 token 用户滥用。
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyResultToken } from "@/lib/jwt";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ visible: false });
    }

    const payload = await verifyResultToken(token);
    if (!payload) {
      return NextResponse.json({ visible: false });
    }

    const resultId = payload.resultId;

    // 并行查询：是否有过用户发言 OR 有过已支付订单
    const [chatCount, paidOrderCount] = await Promise.all([
      prisma.chat.count({
        where: { resultId, role: "user" },
      }),
      prisma.paymentOrder.count({
        where: { resultId, status: "paid" },
      }),
    ]);

    const visible = chatCount > 0 || paidOrderCount > 0;

    logger.debug("contact-visible 检查", { resultId, chatCount, paidOrderCount, visible });

    return NextResponse.json({ visible });
  } catch (err) {
    logger.error("contact-visible 接口异常", { error: (err as Error).message });
    return NextResponse.json({ visible: false });
  }
}
