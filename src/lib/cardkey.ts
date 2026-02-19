/**
 * 卡密（激活码）生成与验证模块
 *
 * 激活码格式：XXXX-XXXX-XXXX-XXXX（16位大写字母+数字，分4组，排除易混淆字符 O/0/I/1）
 * 激活码生命周期：unused → activated（绑定手机号）→ used（测试完成）| banned（封禁）
 *
 * 安全策略：
 * - 同一手机号只能激活一张码
 * - 激活时记录设备指纹（IP + UserAgent 哈希），用于异常检测
 * - 批量生成后存入数据库，状态可追踪
 */

import { customAlphabet } from "nanoid";
import { createHash } from "crypto";
import { createModuleLogger } from "@/lib/logger";
import { prisma } from "@/lib/db";

const log = createModuleLogger("cardkey");

/**
 * 排除易混淆的字符（O/0、I/1/L），提高用户输入体验
 * 使用大写字母 + 数字，共27个字符
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const generateSegment = customAlphabet(ALPHABET, 4);

/**
 * 生成单个激活码
 * 格式：XXXX-XXXX-XXXX-XXXX，共16位有效字符
 */
export function generateCardKeyCode(): string {
  return `${generateSegment()}-${generateSegment()}-${generateSegment()}-${generateSegment()}`;
}

/**
 * 根据版本类型返回初始灵犀次数
 * personal=3, couple=8, gift=15
 */
export function getInitialLingxi(planType: string): number {
  const map: Record<string, number> = {
    personal: 3,
    couple: 8,
    gift: 15,
  };
  return map[planType] ?? 3;
}

/**
 * 批量生成激活码并写入数据库
 * 保证唯一性：通过数据库 unique 约束 + 循环重试机制
 *
 * @param count 生成数量
 * @param batchName 批次备注名（如 "2026-02-19-小红书推广"）
 * @param planType 版本类型：personal | couple | gift
 * @returns 生成的激活码列表
 */
export async function generateCardKeyBatch(
  count: number,
  batchName: string,
  planType: string = "personal"
): Promise<string[]> {
  log.info("开始批量生成激活码", { count, batchName, planType });

  // 先创建批次记录
  const batch = await prisma.cardBatch.create({
    data: { name: batchName, count, planType },
  });

  const codes: string[] = [];
  let attempts = 0;
  const MAX_ATTEMPTS = count * 3; // 防无限循环

  while (codes.length < count && attempts < MAX_ATTEMPTS) {
    attempts++;
    const code = generateCardKeyCode();

    try {
      await prisma.cardKey.create({
        data: { code, batchId: batch.id, planType },
      });
      codes.push(code);
    } catch {
      // 极低概率碰撞，忽略并重试
      log.debug("激活码碰撞，重新生成", { code });
    }
  }

  if (codes.length < count) {
    log.warn("生成数量未达目标", { target: count, actual: codes.length });
  }

  log.info("批量生成完成", { count: codes.length, batchId: batch.id });
  return codes;
}

/**
 * 生成设备指纹字符串（IP + UserAgent 的 MD5 哈希前16位）
 * 用于记录激活时的设备环境，辅助异常检测
 */
export function generateDeviceFingerprint(ip: string, userAgent: string): string {
  return createHash("md5")
    .update(`${ip}|${userAgent}`)
    .digest("hex")
    .substring(0, 16);
}

export type ActivateResult =
  | { success: true; cardKeyId: string; planType: string; resultToken?: string; alreadyCompleted?: boolean }
  | { success: false; error: string; canRetrieve?: boolean };

/**
 * 激活一张卡密
 *
 * 执行完整的防滥用校验链，同时支持回头客二次访问：
 * - 已完成测试（used）+ 手机号匹配 → 返回已有 resultToken，直接跳到报告页
 * - 已激活未完成（activated）+ 手机号匹配 → 允许继续答题
 * - 手机号已绑其他码 → 返回 canRetrieve=true，引导用户去「找回报告」
 *
 * @param code 用户输入的激活码
 * @param phone 用户手机号
 * @param ip 请求 IP（设备指纹）
 * @param userAgent 请求 UA（设备指纹）
 */
export async function activateCardKey(
  code: string,
  phone: string,
  ip: string,
  userAgent: string
): Promise<ActivateResult> {
  const normalizedCode = code.trim().toUpperCase();
  const normalizedPhone = phone.trim();

  log.info("尝试激活卡密", { code: normalizedCode, phone: normalizedPhone.slice(0, 3) + "****" });

  // 校验1：码是否存在
  const cardKey = await prisma.cardKey.findUnique({
    where: { code: normalizedCode },
    include: { result: { select: { token: true } } },
  });

  if (!cardKey) {
    log.warn("激活码不存在", { code: normalizedCode });
    return { success: false, error: "激活码不存在，请检查输入是否正确" };
  }

  // 校验2：是否已被封禁
  if (cardKey.status === "banned") {
    log.warn("尝试使用已封禁激活码", { code: normalizedCode });
    return { success: false, error: "该激活码已被停用，请联系客服" };
  }

  // 校验3：已完成测试（used）→ 验证手机号后直接找回报告
  if (cardKey.status === "used") {
    if (cardKey.phone === normalizedPhone) {
      // 同一手机号：找回已有报告，无需重测
      const resultToken = cardKey.result?.token ?? null;
      log.info("已完成用户找回报告", { code: normalizedCode });
      return {
        success: true,
        cardKeyId: cardKey.id,
        planType: cardKey.planType,
        resultToken: resultToken ?? undefined,
        alreadyCompleted: true,
      };
    } else {
      log.warn("尝试用不同手机号复用激活码", { code: normalizedCode });
      return { success: false, error: "该激活码已被其他手机号使用，每码仅限一人" };
    }
  }

  // 校验4：已激活未完成（activated）→ 同手机号允许继续
  if (cardKey.status === "activated") {
    if (cardKey.phone === normalizedPhone) {
      log.info("同手机号重新进入，允许继续答题", { code: normalizedCode });
      return { success: true, cardKeyId: cardKey.id, planType: cardKey.planType };
    } else {
      log.warn("激活码已被其他手机号激活", { code: normalizedCode });
      return { success: false, error: "该激活码已被其他用户使用，每码仅限一人" };
    }
  }

  // 校验5：手机号是否已绑定其他码（防止一机多测）
  // 若已有报告，引导用「找回报告」而非硬拒绝
  const existingByPhone = await prisma.cardKey.findFirst({
    where: { phone: normalizedPhone, status: { in: ["activated", "used"] } },
  });

  if (existingByPhone) {
    log.warn("手机号已绑定其他激活码", { phone: normalizedPhone.slice(0, 3) + "****" });
    return {
      success: false,
      error: "该手机号已有测试记录",
      canRetrieve: true,  // 前端据此引导用户去「找回报告」
    };
  }

  // 通过所有校验 → 执行激活
  const deviceInfo = generateDeviceFingerprint(ip, userAgent);

  await prisma.cardKey.update({
    where: { id: cardKey.id },
    data: { status: "activated", phone: normalizedPhone, deviceInfo, activatedAt: new Date() },
  });

  log.info("激活码激活成功", { cardKeyId: cardKey.id, planType: cardKey.planType });
  return { success: true, cardKeyId: cardKey.id, planType: cardKey.planType };
}

/**
 * 将卡密状态更新为已使用（测试提交后调用）
 */
export async function markCardKeyUsed(cardKeyId: string): Promise<void> {
  await prisma.cardKey.update({
    where: { id: cardKeyId },
    data: { status: "used", usedAt: new Date() },
  });
  log.info("卡密标记为已使用", { cardKeyId });
}
