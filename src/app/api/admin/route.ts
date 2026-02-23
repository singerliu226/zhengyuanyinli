export const dynamic = "force-dynamic";

/**
 * /api/admin - 后台管理接口 v2.3
 * 变更：新增小红书订单管理相关接口
 *
 * 所有请求需要通过 Authorization: Bearer {ADMIN_SECRET} 认证
 *
 * GET  /api/admin?action=stats                      - 统计数据
 * GET  /api/admin?action=keys&batch=id              - 某批次激活码列表
 * GET  /api/admin?action=results                    - 近50条用户结果
 * GET  /api/admin?action=payments                   - 近50条支付订单
 * GET  /api/admin?action=findByPhone&phone=1xx      - 通过手机号查找用户
 * GET  /api/admin?action=manualPayments&status=pending  - 手动收款记录列表
 * GET  /api/admin?action=xhsOrders&status=all       - 小红书订单列表
 * GET  /api/admin?action=xhsStats                   - 小红书订单统计
 * GET  /api/admin?action=xhsAuthUrl                 - 获取小红书授权 URL
 * GET  /api/admin?action=xhsAuthStatus              - 检查小红书授权状态
 * POST { action: 'generate', count, batchName, planType }  - 批量生成激活码
 * POST { action: 'recharge', resultId, amount }            - 手动充值灵犀
 * POST { action: 'confirmManual', id, op }                 - 确认收款记录
 * POST { action: 'ban', code }                             - 封禁激活码
 * POST { action: 'generateRechargeCodes', count, batchName, packageId }  - 批量生成充值码
 * GET  /api/admin?action=rechargeCodes&status=all     - 充值码列表
 * GET  /api/admin?action=rechargeBatches              - 充值码批次列表
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateCardKeyBatch, generateRechargeCodeBatch, RECHARGE_PACKAGES } from "@/lib/cardkey";
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

    /**
     * 通过手机号查找用户
     * 返回该手机号绑定的所有激活码及其关联的 Result（一个手机号可能激活了多张码）
     * 查询结果按激活时间倒序排列，便于找到最近的记录
     */
    if (action === "findByPhone") {
      const phone = searchParams.get("phone")?.trim();
      if (!phone || phone.length < 7) {
        return NextResponse.json({ error: "请输入有效的手机号" }, { status: 400 });
      }

      const keys = await prisma.cardKey.findMany({
        where: { phone },
        orderBy: { activatedAt: "desc" },
        select: {
          id: true,
          code: true,
          planType: true,
          status: true,
          activatedAt: true,
          result: {
            select: {
              id: true,
              personalityType: true,
              cityMatch: true,
              lingxi: true,
              createdAt: true,
            },
          },
        },
      });

      const users = keys
        .filter((k) => k.result !== null)
        .map((k) => ({
          keyCode: k.code,
          planType: k.planType,
          keyStatus: k.status,
          activatedAt: k.activatedAt,
          resultId: k.result!.id,
          personalityType: k.result!.personalityType,
          cityMatch: k.result!.cityMatch,
          lingxi: k.result!.lingxi,
          resultCreatedAt: k.result!.createdAt,
        }));

      logger.info("后台手机号查找", { phone: phone.slice(0, 3) + "****", found: users.length });

      return NextResponse.json({
        found: users.length > 0,
        count: users.length,
        users,
      });
    }

    /**
     * 手动收款记录列表
     * status 可选：pending（默认）| confirmed | all
     */
    if (action === "manualPayments") {
      const status = searchParams.get("status") ?? "pending";
      const where = status === "all" ? {} : { status };

      const records = await prisma.manualPaymentRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      return NextResponse.json({ records });
    }

    /** 充值码批次列表 */
    if (action === "rechargeBatches") {
      const batches = await prisma.rechargeBatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      return NextResponse.json({ batches, packages: RECHARGE_PACKAGES });
    }

    /** 充值码列表（支持按批次和状态筛选） */
    if (action === "rechargeCodes") {
      const batchId = searchParams.get("batch");
      const status = searchParams.get("status") ?? "all";

      const where: Record<string, unknown> = {};
      if (batchId) where.batchId = batchId;
      if (status !== "all") where.status = status;

      const codes = await prisma.rechargeCode.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          code: true,
          lingxiCount: true,
          packageName: true,
          status: true,
          resultId: true,
          usedAt: true,
          createdAt: true,
        },
      });

      return NextResponse.json({ codes });
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
      /**
       * 手动充值灵犀（by Result ID）
       * 适用于：支付异常兜底，或管理员直接知道 Result ID 的场景
       */
      const { resultId, amount } = body;
      if (!resultId || !amount || amount < 1 || amount > 10000) {
        return NextResponse.json({ error: "参数无效" }, { status: 400 });
      }

      const result = await prisma.result.update({
        where: { id: resultId },
        data: { lingxi: { increment: amount } },
      });

      logger.info("手动充值灵犀（by ResultId）", { resultId, amount, newBalance: result.lingxi });
      return NextResponse.json({
        success: true,
        newBalance: result.lingxi,
        message: `已充值 ${amount} 次灵犀`,
      });
    }

    /**
     * 确认手动收款记录
     * op=recharge：自动按手机号查找账户并充值灵犀（适用于 type=recharge 的记录）
     * op=done：仅标记为已处理（适用于 type=initial，管理员已手动发码）
     */
    if (action === "confirmManual") {
      const { id, op } = body;
      if (!id || !["recharge", "done"].includes(op)) {
        return NextResponse.json({ error: "参数无效" }, { status: 400 });
      }

      const record = await prisma.manualPaymentRecord.findUnique({ where: { id } });
      if (!record) {
        return NextResponse.json({ error: "记录不存在" }, { status: 404 });
      }
      if (record.status === "confirmed") {
        return NextResponse.json({ error: "该记录已处理过" }, { status: 409 });
      }

      if (op === "recharge" && record.lingxiCount) {
        // 按手机号找到最近激活的账户，自动充值
        const key = await prisma.cardKey.findFirst({
          where: { phone: record.phone },
          orderBy: { activatedAt: "desc" },
          include: { result: true },
        });

        if (!key?.result) {
          return NextResponse.json({ error: `手机号 ${record.phone} 未找到对应账户，请先在「充值」Tab 手动操作` }, { status: 404 });
        }

        await prisma.$transaction([
          prisma.result.update({
            where: { id: key.result.id },
            data: { lingxi: { increment: record.lingxiCount } },
          }),
          prisma.manualPaymentRecord.update({
            where: { id },
            data: { status: "confirmed" },
          }),
        ]);

        logger.info("一键确认充值完成", {
          recordId: id,
          phone: record.phone.slice(0, 3) + "****",
          lingxiCount: record.lingxiCount,
          resultId: key.result.id,
        });

        return NextResponse.json({
          success: true,
          message: `已充值 ${record.lingxiCount} 次灵犀`,
          newBalance: key.result.lingxi + record.lingxiCount,
        });
      }

      // op=done：仅标记已处理
      await prisma.manualPaymentRecord.update({
        where: { id },
        data: { status: "confirmed" },
      });

      logger.info("手动收款记录已标记处理", { recordId: id, phone: record.phone.slice(0, 3) + "****" });
      return NextResponse.json({ success: true, message: "已标记为已处理" });
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

    /** 批量生成充值码 */
    if (action === "generateRechargeCodes") {
      const { count, batchName, packageId } = body;

      if (!count || count < 1 || count > 1000) {
        return NextResponse.json({ error: "数量须在1-1000之间" }, { status: 400 });
      }
      if (!batchName || typeof batchName !== "string") {
        return NextResponse.json({ error: "请输入批次名称" }, { status: 400 });
      }
      if (!["single", "standard", "deep"].includes(packageId)) {
        return NextResponse.json({ error: "无效的套餐类型" }, { status: 400 });
      }

      const codes = await generateRechargeCodeBatch(count, batchName.trim(), packageId);
      const pkg = RECHARGE_PACKAGES.find((p) => p.id === packageId);

      logger.info("后台批量生成充值码", { count: codes.length, batchName, packageId });

      return NextResponse.json({
        success: true,
        codes,
        message: `成功生成 ${codes.length} 张 [${pkg?.name ?? packageId}] 充值码（每张 ${pkg?.lingxi} 次灵犀）`,
      });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (err) {
    logger.error("Admin POST 接口异常", { error: (err as Error).message });
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
