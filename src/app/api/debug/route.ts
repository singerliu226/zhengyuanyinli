export const dynamic = "force-dynamic";

/**
 * GET /api/debug?secret=ADMIN_SECRET
 *
 * 诊断接口：在 Zeabur 服务器上直接测试 Qwen API 连通性
 * 用于排查"环境变量已配置但仍 503"的问题
 * 需要 ADMIN_SECRET 鉴权，防止公开暴露
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.QWEN_API_KEY ?? "";
  const baseURL = process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_MODEL ?? "qwen-plus";

  const result: Record<string, unknown> = {
    env: {
      QWEN_API_KEY: apiKey ? `已配置（前8位：${apiKey.substring(0, 8)}...）` : "❌ 未配置",
      QWEN_BASE_URL: baseURL,
      QWEN_MODEL: model,
      JWT_SECRET: process.env.JWT_SECRET ? "已配置" : "❌ 未配置",
      DATABASE_URL: process.env.DATABASE_URL ? `已配置（前30位：${process.env.DATABASE_URL.substring(0, 30)}...）` : "❌ 未配置",
      NODE_ENV: process.env.NODE_ENV,
    },
    qwenTest: null as unknown,
  };

  // 直接向 Qwen 发一条最小请求，测试从 Zeabur 服务器出网连通性
  try {
    const startMs = Date.now();
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      }),
      // 10 秒超时
      signal: AbortSignal.timeout(10_000),
    });

    const elapsed = Date.now() - startMs;
    const text = await response.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }

    result.qwenTest = {
      status: response.status,
      ok: response.ok,
      elapsed_ms: elapsed,
      response: json,
    };
  } catch (err) {
    result.qwenTest = {
      status: "fetch_error",
      error: (err as Error).message,
      // 超时或网络不通的原因会在这里显示
    };
  }

  return NextResponse.json(result, { status: 200 });
}
