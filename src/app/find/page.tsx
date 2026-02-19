"use client";

/**
 * 找回报告页 /find
 *
 * 用于已购买并完成测试的用户，通过手机号重新找回报告和对话入口。
 * 无需激活码，手机号即身份凭证。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ReportItem = {
  token: string;
  personalityType: string;
  cityMatch: string;
  lingxiLeft: number;
  planType: string;
  isExpired: boolean;
  hasPartner: boolean;
  createdAt: string;
};

const PLAN_LABEL: Record<string, string> = {
  personal: "个人版",
  couple: "双人版",
  gift: "礼盒版",
};

export default function FindPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reports, setReports] = useState<ReportItem[] | null>(null);

  async function handleFind() {
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      setError("请输入正确的11位手机号");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/find?phone=${encodeURIComponent(phone.trim())}`);
      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        return;
      }
      setReports(data.reports);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 px-6 py-12">
      <div className="max-w-sm mx-auto">

        {/* 标题 */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🔍</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">找回我的报告</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            输入当时绑定的手机号<br />即可重新进入你的测试报告和 AI 对话
          </p>
        </div>

        {/* 手机号输入 */}
        <div className="bg-white rounded-3xl p-6 shadow-sm mb-4">
          <label className="block text-sm text-gray-500 mb-2">手机号</label>
          <input
            type="tel"
            maxLength={11}
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(""); setReports(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleFind()}
            placeholder="输入激活时绑定的手机号"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-base focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
          />
          {error && <p className="text-rose-500 text-xs mt-2">{error}</p>}
        </div>

        <button
          onClick={handleFind}
          disabled={loading || phone.length < 11}
          className="btn-primary w-full py-3.5 text-sm font-semibold mb-4 disabled:opacity-50"
        >
          {loading ? "查询中..." : "🔍 找回我的报告"}
        </button>

        {/* 报告列表 */}
        {reports && reports.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 text-center mb-1">找到 {reports.length} 条测试记录</p>
            {reports.map((r) => (
              <div
                key={r.token}
                className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-xs bg-rose-50 text-rose-500 px-2 py-0.5 rounded-full mr-2">
                      {PLAN_LABEL[r.planType] ?? r.planType}
                    </span>
                    {r.isExpired && (
                      <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">
                        报告已过期
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(r.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                </div>

                <p className="font-bold text-gray-800 text-base mb-0.5">{r.personalityType}</p>
                <p className="text-gray-500 text-xs mb-3">恋爱城市：{r.cityMatch}</p>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    💓 剩余灵犀：<strong className="text-rose-500">{r.lingxiLeft} 次</strong>
                    {r.hasPartner && <span className="ml-2 text-purple-500">· 双人同频</span>}
                  </span>
                  <button
                    onClick={() => router.push(`/result/${r.token}`)}
                    className="text-xs font-semibold text-white bg-gradient-to-r from-rose-400 to-pink-500 px-4 py-1.5 rounded-full"
                  >
                    进入报告 →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 底部返回 */}
        <div className="text-center mt-8">
          <Link href="/" className="text-xs text-gray-400 underline">← 返回首页</Link>
          <span className="text-gray-200 mx-3">|</span>
          <Link href="/activate" className="text-xs text-gray-400 underline">我有激活码</Link>
        </div>

      </div>
    </main>
  );
}
