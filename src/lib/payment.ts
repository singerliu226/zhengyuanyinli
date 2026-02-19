/**
 * 虎皮椒支付（PayJS）封装模块
 *
 * PayJS 是面向个人开发者的聚合支付平台，支持微信/支付宝，申请门槛低。
 * 官网：https://payjs.cn
 *
 * 签名算法：
 * 1. 将所有参数（key=value）按 ASCII 字典序排列
 * 2. 拼接成 querystring 格式（key1=val1&key2=val2...）
 * 3. 在末尾拼接 &key={PAYJS_KEY}
 * 4. 对上述字符串做 MD5（大写）
 */

import { createHash } from "crypto";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("payment");

/** 灵犀充能套餐定义 */
export const LINGXI_PACKAGES = [
  {
    id: "single",
    name: "单次急救",
    lingxi: 1,
    price: 590,        // 单位：分（¥5.90）
    displayPrice: "5.9",
    originalPrice: "9.9",
    desc: "临时起意的一个疑问",
  },
  {
    id: "standard",
    name: "灵犀标准包",
    lingxi: 15,
    price: 1990,       // ¥19.90
    displayPrice: "19.9",
    originalPrice: "29.9",
    desc: "足够深度探索你的关系模式",
    recommended: true,
  },
  {
    id: "deep",
    name: "灵犀深度包",
    lingxi: 50,
    price: 4990,       // ¥49.90
    displayPrice: "49.9",
    originalPrice: "79.9",
    desc: "含1次完整关系诊断（5次灵犀）",
  },
] as const;

export type PackageId = (typeof LINGXI_PACKAGES)[number]["id"];

/** 根据套餐 ID 获取套餐信息 */
export function getPackage(packageId: PackageId) {
  return LINGXI_PACKAGES.find((p) => p.id === packageId);
}

/**
 * 生成 PayJS 签名
 * @param params 请求参数（不含 sign 字段）
 */
export function generatePayjsSign(params: Record<string, string | number>): string {
  const key = process.env.PAYJS_KEY ?? "";

  // 按 ASCII 字典序排列
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys
    .filter((k) => params[k] !== undefined && params[k] !== "")
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  const signStr = `${queryString}&key=${key}`;
  log.debug("PayJS 签名字符串", { signStr: signStr.replace(key, "***") });

  return createHash("md5").update(signStr).digest("hex").toUpperCase();
}

/**
 * 验证 PayJS 回调签名
 * @param params 回调参数（含 sign 字段）
 */
export function verifyPayjsCallback(params: Record<string, string>): boolean {
  const { sign, ...rest } = params;
  if (!sign) return false;

  const expectedSign = generatePayjsSign(rest as Record<string, string | number>);
  const isValid = expectedSign === sign;

  if (!isValid) {
    log.warn("PayJS 回调签名校验失败", { expected: expectedSign, received: sign });
  }

  return isValid;
}

/**
 * 创建 PayJS 收银台订单（适合H5/移动端，支持微信+支付宝）
 * @returns cashier_url（跳转到收银台的 URL）
 */
export async function createPayjsOrder(params: {
  outTradeNo: string;
  totalFee: number;
  body: string;
  attach: string;
  notifyUrl: string;
  callbackUrl: string;
}): Promise<{ success: true; cashierUrl: string; payjsOrderId: string } | { success: false; error: string }> {
  const mchid = process.env.PAYJS_MCHID ?? "";

  if (!mchid || !process.env.PAYJS_KEY) {
    log.error("PayJS 配置缺失", {});
    return { success: false, error: "支付配置异常，请联系客服" };
  }

  const requestParams: Record<string, string | number> = {
    mchid,
    total_fee: params.totalFee,
    out_trade_no: params.outTradeNo,
    body: params.body,
    notify_url: params.notifyUrl,
    callback_url: params.callbackUrl,
    attach: params.attach,
  };

  requestParams.sign = generatePayjsSign(requestParams);

  try {
    // PayJS 收银台接口要求 application/x-www-form-urlencoded 格式，
    // 使用 JSON 会导致签名验证失败或接口报错
    const formBody = new URLSearchParams(
      Object.entries(requestParams).map(([k, v]) => [k, String(v)])
    );

    const response = await fetch("https://payjs.cn/api/cashier", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
    });

    const data = await response.json();

    if (data.return_code !== 1) {
      log.error("PayJS 创建订单失败", { data });
      return { success: false, error: data.return_msg ?? "创建支付订单失败" };
    }

    log.info("PayJS 订单创建成功", { outTradeNo: params.outTradeNo, payjsOrderId: data.payjs_order_id });
    return {
      success: true,
      cashierUrl: data.cashier_url,
      payjsOrderId: data.payjs_order_id,
    };
  } catch (err) {
    log.error("PayJS API 调用异常", { error: (err as Error).message });
    return { success: false, error: "网络异常，请稍后重试" };
  }
}
