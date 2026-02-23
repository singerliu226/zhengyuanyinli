export const dynamic = "force-dynamic";

/**
 * GET /api/deliver?secret={ADMIN_SECRET}&type=activation&planType=personal
 * GET /api/deliver?secret={ADMIN_SECRET}&type=recharge&packageId=standard
 *
 * 自动发货接口：每次调用实时生成一张新激活码或充值码并返回。
 *
 * 适用场景：
 * - 阿奇索、码小秘、发货宝等平台支持"HTTP 拉取"模式时，
 *   配置此 URL 即可实现客户付款后自动获取码并发送给客户。
 *
 * 鉴权：
 * - Query 参数 secret 必须与环境变量 ADMIN_SECRET 完全一致
 *
 * 参数：
 * - secret     必填，管理员密码
 * - type       可选，activation（默认）| recharge
 * - planType   激活码类型时使用：personal（默认）| couple
 * - packageId  充值码类型时使用：single | standard | deep
 *
 * 返回（激活码）：
 * - { success: true, code: "XXXX-XXXX-XXXX-XXXX", type: "activation", planType: "personal" }
 *
 * 返回（充值码）：
 * - { success: true, code: "LX-XXXX-XXXX", type: "recharge", packageId: "standard", lingxi: 15 }
 */

import { NextRequest, NextResponse } from "next/server";
import { generateCardKeyBatch, generateRechargeCodeBatch, getRechargePackage } from "@/lib/cardkey";
import logger from "@/lib/logger";

const ALLOWED_PLAN_TYPES = ["personal", "couple"] as const;
const ALLOWED_PACKAGE_IDS = ["single", "standard", "deep"] as const;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") ?? "";
  const type = searchParams.get("type") ?? "activation";

  // 鉴权
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    logger.warn("自动发货接口：鉴权失败", { ip: req.headers.get("x-forwarded-for") });
    return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    // ── 激活码 ──
    if (type === "activation") {
      const planType = searchParams.get("planType") ?? "personal";

      if (!ALLOWED_PLAN_TYPES.includes(planType as typeof ALLOWED_PLAN_TYPES[number])) {
        return NextResponse.json(
          { success: false, error: `planType 无效，可选值：${ALLOWED_PLAN_TYPES.join(" | ")}` },
          { status: 400 }
        );
      }

      const batchName = `自动发货-激活码-${today}`;
      const codes = await generateCardKeyBatch(1, batchName, planType);

      logger.info("自动发货：生成激活码", { planType, code: codes[0] });

      return NextResponse.json({
        success: true,
        code: codes[0],
        type: "activation",
        planType,
      });
    }

    // ── 充值码 ──
    if (type === "recharge") {
      const packageId = searchParams.get("packageId") ?? "standard";

      if (!ALLOWED_PACKAGE_IDS.includes(packageId as typeof ALLOWED_PACKAGE_IDS[number])) {
        return NextResponse.json(
          { success: false, error: `packageId 无效，可选值：${ALLOWED_PACKAGE_IDS.join(" | ")}` },
          { status: 400 }
        );
      }

      const pkg = getRechargePackage(packageId);
      const batchName = `自动发货-充值码-${today}`;
      const codes = await generateRechargeCodeBatch(1, batchName, packageId);

      logger.info("自动发货：生成充值码", { packageId, code: codes[0], lingxi: pkg?.lingxi });

      return NextResponse.json({
        success: true,
        code: codes[0],
        type: "recharge",
        packageId,
        lingxi: pkg?.lingxi,
      });
    }

    return NextResponse.json(
      { success: false, error: `type 无效，可选值：activation | recharge` },
      { status: 400 }
    );
  } catch (err) {
    logger.error("自动发货接口异常", { error: (err as Error).message });
    return NextResponse.json(
      { success: false, error: "服务器异常，请稍后重试" },
      { status: 500 }
    );
  }
}
