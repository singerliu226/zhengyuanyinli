export const dynamic = "force-dynamic";

/**
 * GET /api/deliver?secret={ADMIN_SECRET}&planType=personal
 *
 * 自动发货接口：每次调用实时生成一张新激活码并返回。
 *
 * 适用场景：
 * - 码小秘、发货宝、易发货等平台支持"HTTP 拉取"模式时，配置此 URL 即可实现
 *   客户付款后平台自动调用本接口获取激活码，并通过平台 IM 发送给客户。
 *
 * 鉴权：
 * - Query 参数 secret 必须与环境变量 ADMIN_SECRET 完全一致（Bearer 不适合 GET URL）
 *
 * 参数：
 * - secret    必填，管理员密码
 * - planType  可选，personal（默认）| couple
 *
 * 返回：
 * - { success: true,  code: "XXXX...", planType: "personal" }
 * - { success: false, error: "..." }
 *
 * 安全注意：
 * - 仅建议在部署到 HTTPS 域名后使用，避免 secret 明文传输
 * - 可在发货平台配置 IP 白名单进一步保护
 */

import { NextRequest, NextResponse } from "next/server";
import { generateCardKeyBatch } from "@/lib/cardkey";
import logger from "@/lib/logger";

const ALLOWED_PLAN_TYPES = ["personal", "couple"] as const;
type PlanType = (typeof ALLOWED_PLAN_TYPES)[number];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") ?? "";
  const planType = (searchParams.get("planType") ?? "personal") as PlanType;

  // 鉴权：对比 ADMIN_SECRET
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    logger.warn("自动发货接口：鉴权失败", { ip: req.headers.get("x-forwarded-for") });
    return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
  }

  // planType 校验
  if (!ALLOWED_PLAN_TYPES.includes(planType)) {
    return NextResponse.json(
      { success: false, error: `planType 无效，可选值：${ALLOWED_PLAN_TYPES.join(" | ")}` },
      { status: 400 }
    );
  }

  try {
    // 每次生成1张，批次名称按日期自动命名
    const today = new Date().toISOString().slice(0, 10);
    const batchName = `自动发货-${today}`;

    const codes = await generateCardKeyBatch(1, batchName, planType);

    logger.info("自动发货接口：生成激活码成功", { planType, code: codes[0] });

    return NextResponse.json({
      success: true,
      code: codes[0],
      planType,
    });
  } catch (err) {
    logger.error("自动发货接口异常", { error: (err as Error).message });
    return NextResponse.json(
      { success: false, error: "服务器异常，请稍后重试" },
      { status: 500 }
    );
  }
}
