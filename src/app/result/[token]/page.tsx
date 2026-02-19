"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type ReportData = {
  personalityId: string;
  personalityName: string;
  personalityEmoji: string;
  tagline: string;
  cityMatch: string;
  scores: {
    d1: number; d2: number; d3: number; d4: number; d5: number;
    labels: { d1: string; d2: string; d3: string; d4: string; d5: string };
  };
  similarity: number;
  modules: {
    personality: string;
    city: string;
    idealType: string;
    advantages: string[];
    warnings: string[];
    compatibility: { matchPersonalityName: string; content: string };
    chatInvite: string;
  };
};

type ResultInfo = {
  report: ReportData;
  lingxiLeft: number;
  personalityType: string;
  cityMatch: string;
  expiresAt: string | null;
  isExpired: boolean;
  coupleToken: string | null;
  hasPartner: boolean;
  partnerInfo: { personalityType: string; cityMatch: string } | null;
  planType: string;
  resultId: string;
};

/**
 * 报告页 v2.1
 * 变更：
 * - 情感币 → 灵犀次数，显示剩余灵犀 + 72小时有效期倒计时
 * - 双人版：显示「邀请伴侣」按钮 / 已结对则显示匹配度摘要
 * - 过期后显示内容模糊化提示
 */
export default function ResultPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<ResultInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => { fetchReport(); }, [token]);

  useEffect(() => {
    if (!info?.expiresAt) return;
    const timer = setInterval(() => {
      setTimeLeft(calcTimeLeft(info.expiresAt!));
    }, 1000);
    setTimeLeft(calcTimeLeft(info.expiresAt));
    return () => clearInterval(timer);
  }, [info?.expiresAt]);

  function calcTimeLeft(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "已过期";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  async function fetchReport() {
    try {
      const res = await fetch(`/api/result?token=${token}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "报告加载失败"); return; }
      setInfo(data as ResultInfo);
    } catch {
      setError("网络异常，请刷新重试");
    } finally {
      setLoading(false);
    }
  }

  function handleCopyInvite() {
    if (!info?.coupleToken) return;
    const url = `${window.location.origin}/couple/${info.coupleToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  }

  function handleShare() {
    if (!info) return;
    const text = `我的恋爱人格是「${info.report.personalityName}」，最适合在${info.report.cityMatch}谈恋爱！`;
    if (navigator.share) {
      navigator.share({ title: "正缘引力测试结果", text, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("链接已复制，可分享给朋友～");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">🔮</div>
          <p className="text-gray-500">报告生成中...</p>
        </div>
      </main>
    );
  }

  if (error || !info) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 flex items-center justify-center px-6">
        <div className="text-center bg-white rounded-3xl p-8 shadow-sm max-w-sm w-full">
          <div className="text-4xl mb-4">😕</div>
          <p className="text-gray-700 font-semibold mb-2">{error || "报告不存在"}</p>
          <p className="text-gray-400 text-sm mb-6">报告链接有效期72小时</p>
          <Link href="/"><button className="btn-primary w-full py-3 text-sm">返回首页</button></Link>
        </div>
      </main>
    );
  }

  // BUG-FIX: 过期报告显示模糊遮罩 + 引导续费，而不是直接展示完整内容
  if (info.isExpired) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center px-6">
        <div className="max-w-sm w-full">
          {/* 模糊预览：人格卡片简版 */}
          <div className="bg-white rounded-3xl p-6 shadow-md text-center mb-4 relative overflow-hidden">
            <div className="text-5xl mb-2">{info.report.personalityEmoji}</div>
            <h2 className="text-xl font-bold text-gradient mb-1">{info.report.personalityName}</h2>
            <p className="text-gray-400 text-sm mb-4">{info.report.tagline}</p>
            {/* 模糊遮罩，覆盖正文预览 */}
            <div className="space-y-2 blur-sm select-none pointer-events-none">
              <div className="h-4 bg-gray-200 rounded-full w-full" />
              <div className="h-4 bg-gray-200 rounded-full w-4/5 mx-auto" />
              <div className="h-4 bg-gray-200 rounded-full w-3/5 mx-auto" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/60 to-transparent flex items-end justify-center pb-4">
              <p className="text-xs text-gray-500">⏰ 报告已于 72 小时后失效</p>
            </div>
          </div>

          {/* 续费引导 */}
          <div className="bg-white rounded-3xl p-6 shadow-sm text-center">
            <div className="text-3xl mb-3">🔓</div>
            <h3 className="font-bold text-gray-800 mb-2">报告已过期</h3>
            <p className="text-gray-500 text-sm mb-1">
              完整报告仅在测试后 72 小时内查看
            </p>
            <p className="text-gray-400 text-xs mb-5">
              情感状态会随时间变化，建议重新测试获取最新报告
            </p>
            <Link href="/">
              <button className="btn-primary w-full py-3 text-sm mb-3">
                重新测试 · ¥9.9起
              </button>
            </Link>
            <p className="text-xs text-gray-400">
              灵犀次数永久有效，重新测试后可继续使用
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { report } = info;
  const isCouplePlan = info.planType === "couple" || info.planType === "gift";
  const dimensionScores = [
    { label: "生活节奏", value: report.scores.d1, color: "bg-rose-400" },
    { label: "社交人格", value: report.scores.d2, color: "bg-pink-400" },
    { label: "审美偏好", value: report.scores.d3, color: "bg-purple-400" },
    { label: "价值观", value: report.scores.d4, color: "bg-amber-400" },
    { label: "依恋风格", value: report.scores.d5, color: "bg-emerald-400" },
  ];

  const chatHref = info.hasPartner ? `/chat/${token}?coupleMode=true` : `/chat/${token}`;
  const chatLabel = info.hasPartner ? "问缘缘（双人同频）" : `问缘缘（${info.lingxiLeft}次灵犀）`;

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pb-24">

      {/* 灵犀 + 有效期提示条 */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-rose-100 px-6 py-3">
        <div className="max-w-sm mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-rose-400">💓</span>
            <span className="text-sm font-medium text-gray-700">{info.lingxiLeft} 次灵犀</span>
            {info.lingxiLeft === 0 && (
              <Link href={`/recharge/${token}`}>
                <span className="text-xs text-rose-500 underline">立即充能</span>
              </Link>
            )}
          </div>
          {info.expiresAt && (
            <div className="text-xs text-gray-400 flex items-center gap-1">
              <span>⏰</span>
              <span className={timeLeft === "已过期" ? "text-red-400" : ""}>{timeLeft}</span>
            </div>
          )}
        </div>
      </div>

      {/* 顶部人格卡片（可截图分享） */}
      <section className="px-6 pt-8 pb-4">
        <div className="max-w-sm mx-auto bg-white rounded-3xl p-6 shadow-md text-center">
          <div className="text-6xl mb-3">{report.personalityEmoji}</div>
          <div className="text-xs text-gray-400 mb-1">你的恋爱人格</div>
          <h1 className="text-2xl font-bold text-gradient mb-1">{report.personalityName}</h1>
          <p className="text-gray-500 text-sm mb-4">{report.tagline}</p>

          {/* 维度分数条 */}
          <div className="space-y-2.5 mb-5">
            {dimensionScores.map((dim) => (
              <div key={dim.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-12 text-right flex-shrink-0">{dim.label}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${dim.color} rounded-full`} style={{ width: `${dim.value}%` }} />
                </div>
                <span className="text-xs text-gray-400 w-8">{dim.value}</span>
              </div>
            ))}
          </div>

          <button onClick={handleShare} className="w-full py-2.5 text-sm border border-rose-200 text-rose-500 rounded-xl">
            📤 分享我的结果
          </button>
        </div>
      </section>

      {/* 双人版：邀请伴侣 / 伴侣已加入 */}
      {isCouplePlan && (
        <section className="px-6 pb-4">
          <div className="max-w-sm mx-auto">
            {info.hasPartner && info.partnerInfo ? (
              <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-3xl p-5 border border-rose-100">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">💕</span>
                  <span className="font-bold text-gray-800 text-sm">你们已完成双人同频</span>
                </div>
                <div className="flex gap-3 mb-3">
                  <div className="flex-1 bg-white rounded-2xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">你</div>
                    <div className="text-sm font-semibold text-rose-500">{info.personalityType}</div>
                  </div>
                  <div className="flex items-center text-gray-300 text-lg">×</div>
                  <div className="flex-1 bg-white rounded-2xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">TA</div>
                    <div className="text-sm font-semibold text-purple-500">{info.partnerInfo.personalityType}</div>
                  </div>
                </div>
                <Link href={chatHref}>
                  <button className="btn-primary w-full py-3 text-sm">💬 开启双人同频对话</button>
                </Link>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-dashed border-rose-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">💌</span>
                  <span className="font-bold text-gray-800 text-sm">邀请 TA 一起测试</span>
                </div>
                <p className="text-gray-500 text-xs mb-4 leading-relaxed">
                  发给你的伴侣/闺蜜，TA 完成测试后你们就能开启双人同频对话，让 AI 帮你们找到沟通方式。
                </p>
                <button
                  onClick={handleCopyInvite}
                  className="w-full py-3 text-sm font-medium rounded-2xl border-2 border-rose-400 text-rose-500 bg-rose-50"
                >
                  {copySuccess ? "✅ 邀请链接已复制" : "📋 复制邀请链接"}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 报告正文（各模块并列卡片）── */}
      <div className="px-6 max-w-sm mx-auto space-y-4">

        {/* 1. 恋爱人格解读 */}
        <ReportModule title="🧠 你的恋爱人格" content={report.modules.personality} />

        {/* 2. 恋爱城市解读（与其他模块并列，完整展开） */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-gray-800">🏙️ 你的恋爱城市</h3>
            <span className="text-rose-500 font-bold text-base">{report.cityMatch}</span>
          </div>
          <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{report.modules.city}</p>
        </div>

        {/* 3. 理想型画像 */}
        <ReportModule title="💝 你的理想型画像" content={report.modules.idealType} />

        {/* 4. 恋爱优势 */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-4">✨ 你的恋爱优势</h3>
          <div className="space-y-3">
            {report.modules.advantages.map((adv, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-rose-400 font-bold flex-shrink-0">0{i + 1}</span>
                <p className="text-gray-600 text-sm leading-relaxed">{adv}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 5. 警惕模式 */}
        <div className="bg-amber-50 rounded-3xl p-6 shadow-sm border border-amber-100">
          <h3 className="font-bold text-gray-800 mb-4">⚠️ 需要警惕的模式</h3>
          <div className="space-y-3">
            {report.modules.warnings.map((w, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-amber-400 font-bold flex-shrink-0">0{i + 1}</span>
                <p className="text-gray-600 text-sm leading-relaxed">{w}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 6. 最佳匹配人格 */}
        <div className="bg-purple-50 rounded-3xl p-6 shadow-sm border border-purple-100">
          <h3 className="font-bold text-gray-800 mb-1">💑 最佳匹配人格</h3>
          <p className="text-purple-500 font-semibold text-lg mb-3">{report.modules.compatibility.matchPersonalityName}</p>
          <p className="text-gray-600 text-sm leading-relaxed">{report.modules.compatibility.content}</p>
        </div>

        {/* 7. 对话引导区（报告末尾，引导点击缘缘） */}
        <div className="bg-gradient-to-br from-rose-400 to-pink-500 rounded-3xl p-6 text-white shadow-md">
          <p className="font-bold text-base mb-1">还有更多想知道的？</p>
          <p className="text-rose-100 text-xs mb-4 leading-relaxed">
            报告是起点，缘缘可以帮你深度解读。你有 <strong className="text-white">{info.lingxiLeft} 次灵犀</strong>，问出你真正想问的那句话。
          </p>
          <div className="space-y-2 mb-4">
            {[
              "我和现任适合在哪个城市发展？",
              "为什么我总是吸引同一类型的人？",
              "根据我的分数，我需要警惕什么？",
            ].map((q) => (
              <Link key={q} href={chatHref}>
                <div className="bg-white/20 hover:bg-white/30 transition-colors rounded-2xl px-4 py-2.5 text-sm text-white flex items-center justify-between cursor-pointer">
                  <span>💬 {q}</span>
                  <span className="text-rose-200 text-xs ml-2">→</span>
                </div>
              </Link>
            ))}
          </div>
          {info.lingxiLeft === 0 ? (
            <Link href={`/recharge/${token}`}>
              <button className="w-full py-3 text-sm font-semibold bg-white text-rose-500 rounded-2xl">
                ⚡ 先充能灵犀，再来问缘缘
              </button>
            </Link>
          ) : (
            <Link href={chatHref}>
              <button className="w-full py-3 text-sm font-semibold bg-white text-rose-500 rounded-2xl">
                💬 现在就问缘缘
              </button>
            </Link>
          )}
        </div>

      </div>

      {/* ── 浮动"问缘缘"按钮（右下角，始终可见）── */}
      {info.lingxiLeft > 0 ? (
        <Link href={chatHref}>
          <button className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3.5 rounded-full shadow-lg text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #f43f5e, #ec4899)" }}>
            💬 问缘缘
            <span className="bg-white/30 text-white text-xs px-1.5 py-0.5 rounded-full">{info.lingxiLeft}</span>
          </button>
        </Link>
      ) : (
        <Link href={`/recharge/${token}`}>
          <button className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3.5 rounded-full shadow-lg text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #f59e0b, #f97316)" }}>
            ⚡ 充能灵犀
          </button>
        </Link>
      )}

    </main>
  );
}

function ReportModule({ title, content }: { title: string; content: string }) {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm">
      <h3 className="font-bold text-gray-800 mb-3">{title}</h3>
      <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{content}</p>
    </div>
  );
}
