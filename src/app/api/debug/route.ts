export const dynamic = "force-dynamic";

/**
 * GET /api/debug?secret=ADMIN_SECRET
 *
 * 综合诊断接口：测试环境变量、数据库、Qwen 非流式、Qwen 流式
 * 用于在 Zeabur 上精确定位 503 根因
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import OpenAI from "openai";

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
      DATABASE_URL: process.env.DATABASE_URL
        ? `已配置（前30位：${process.env.DATABASE_URL.substring(0, 30)}...）`
        : "❌ 未配置",
      NODE_ENV: process.env.NODE_ENV,
    },
    dbTest: null as unknown,
    qwenNonStream: null as unknown,
    qwenStream: null as unknown,
  };

  // ── 1. 数据库连通性测试 ─────────────────────────────────────────────
  try {
    const count = await prisma.result.count();
    result.dbTest = { ok: true, resultCount: count };
  } catch (err) {
    result.dbTest = { ok: false, error: (err as Error).message };
  }

  // ── 2. Qwen 非流式测试（已知可用，做基准对比）─────────────────────
  try {
    const startMs = Date.now();
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const elapsed = Date.now() - startMs;
    let json: unknown;
    try { json = await res.json(); } catch { json = await res.text(); }
    result.qwenNonStream = { status: res.status, ok: res.ok, elapsed_ms: elapsed, response: json };
  } catch (err) {
    result.qwenNonStream = { ok: false, error: (err as Error).message };
  }

  // ── 3. Qwen 流式测试（与 /api/chat 同路径，排查 stream:true 是否有问题）
  try {
    const client = new OpenAI({ apiKey, baseURL });
    const startMs = Date.now();
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      max_tokens: 5,
    });

    let chunks = 0;
    let content = "";
    for await (const chunk of stream) {
      chunks++;
      content += chunk.choices[0]?.delta?.content ?? "";
    }
    const elapsed = Date.now() - startMs;
    result.qwenStream = { ok: true, chunks, content, elapsed_ms: elapsed };
  } catch (err) {
    const e = err as Error & { status?: number };
    result.qwenStream = { ok: false, error: e.message, status: e.status };
  }

  return NextResponse.json(result, { status: 200 });
}
