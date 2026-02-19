/**
 * JWT Token 工具模块（基于 jose 库）
 *
 * 用于签发和验证 result_token：
 * - 测试提交成功后签发，携带 resultId
 * - 访问报告页和 AI 追问时验证
 * - 有效期7天，过期后报告不可访问（防永久分享）
 */

import { SignJWT, jwtVerify } from "jose";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("jwt");

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-secret-change-in-production"
);

export type ResultTokenPayload = {
  resultId: string;
  personalityType: string;
};

/**
 * 签发 result_token
 * 测试提交后调用，携带 resultId 供后续查询
 */
export async function signResultToken(payload: ResultTokenPayload): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  log.debug("签发 result_token", { resultId: payload.resultId });
  return token;
}

/**
 * 验证并解析 result_token
 * 返回 null 表示 token 无效或已过期
 */
export async function verifyResultToken(
  token: string
): Promise<ResultTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as ResultTokenPayload;
  } catch (err) {
    log.warn("JWT 验证失败", { error: (err as Error).message });
    return null;
  }
}
