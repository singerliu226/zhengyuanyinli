"use client";

import { useCallback, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

/**
 * 单人版公开分享页 /share/[token]
 *
 * 设计原则：
 * - 完全公开，无需登录或激活码
 * - 只展示分享者的「简版」人格名片（无完整报告、无灵犀操作）
 * - 语言中立，不预设对方与分享者的关系
 * - 给访客一个清晰的「我也想测」入口
 *
 * 复用现有 /api/result 接口，只使用其中的基础字段
 */

type ShareInfo = {
  personalityName: string;
  personalityEmoji: string;
  tagline: string;
  cityMatch: string;
  mbtiType?: string;
  scores: { d1: number; d2: number; d3: number; d4: number; d5: number };
};

const DIMENSION_LABELS = ["生活节奏", "社交人格", "审美偏好", "价值观", "依恋风格"];
const DIMENSION_COLORS = ["bg-rose-400", "bg-pink-400", "bg-purple-400", "bg-amber-400", "bg-emerald-400"];

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchShareInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/result?token=${token}`);
      if (!res.ok) { setNotFound(true); return; }
      const data = await res.json();
      const r = data.report;
      setInfo({
        personalityName: r.personalityName,
        personalityEmoji: r.personalityEmoji,
        tagline: r.tagline,
        cityMatch: r.cityMatch,
        mbtiType: r.mbtiType,
        scores: r.scores,
      });
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchShareInfo();
  }, [fetchShareInfo]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">🔮</div>
          <p className="text-gray-500 text-sm">加载中…</p>
        </div>
      </main>
    );
  }

  if (notFound || !info) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 flex items-center justify-center px-6">
        <div className="text-center bg-white rounded-3xl p-8 shadow-sm max-w-sm w-full">
          <div className="text-4xl mb-4">😕</div>
          <p className="text-gray-700 font-semibold mb-2">分享链接已失效</p>
          <p className="text-gray-400 text-sm mb-6">报告链接有效期 72 小时</p>
          <Link href="/">
            <button className="btn-primary w-full py-3 text-sm">去测测我的正缘人格 →</button>
          </Link>
        </div>
      </main>
    );
  }

  const scoreValues = [info.scores.d1, info.scores.d2, info.scores.d3, info.scores.d4, info.scores.d5];

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pb-12">

      {/* 顶部说明条 */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-rose-100 px-6 py-3 text-center">
        <p className="text-xs text-gray-400">
          <span className="font-medium text-rose-400">正缘引力</span> · 恋爱人格测试结果分享
        </p>
      </div>

      {/* 简版人格名片 */}
      <section className="px-6 pt-8 pb-4">
        <div className="max-w-sm mx-auto bg-white rounded-3xl p-6 shadow-md text-center">

          {/* 引导语 —— 中性措辞，不预设关系 */}
          <p className="text-xs text-gray-400 mb-4">
            有人分享了 TA 的恋爱人格给你 👇
          </p>

          <div className="text-6xl mb-3">{info.personalityEmoji}</div>
          <div className="text-xs text-gray-400 mb-1">TA 的恋爱人格</div>
          <h1 className="text-2xl font-bold text-gradient mb-1">{info.personalityName}</h1>
          <p className="text-gray-500 text-sm mb-2">{info.tagline}</p>

          {/* MBTI */}
          {info.mbtiType && info.mbtiType !== "未知" && (
            <div className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-500 text-xs font-medium px-3 py-1 rounded-full mb-3">
              <span>🧬</span>
              <span>十六型人格：{info.mbtiType}</span>
            </div>
          )}

          {/* 城市标签 */}
          <div className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-500 text-xs font-medium px-3 py-1 rounded-full mb-5">
            <span>🏙️</span>
            <span>最适合谈恋爱的城市：{info.cityMatch}</span>
          </div>

          {/* 5维度分数条 */}
          <div className="space-y-2.5">
            {scoreValues.map((val, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-12 text-right flex-shrink-0">{DIMENSION_LABELS[i]}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${DIMENSION_COLORS[i]} rounded-full`} style={{ width: `${val}%` }} />
                </div>
                <span className="text-xs text-gray-400 w-8">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 分隔线 + 引导测试 */}
      <section className="px-6 pb-6">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-rose-100" />
            <span className="text-xs text-gray-400 flex-shrink-0">你们的恋爱人格是什么组合？</span>
            <div className="flex-1 h-px bg-rose-100" />
          </div>

          {/* 功能亮点 */}
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 space-y-2">
            {[
              { icon: "🧬", text: "29题 + MBTI 联合测出你的恋爱密码" },
              { icon: "🏙️", text: "匹配最适合你谈恋爱的人格类型和城市" },
              { icon: "💬", text: "AI 缘缘帮你解读报告、解答感情烦恼" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2 text-xs text-gray-500">
                <span>{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Link href="/">
            <button className="btn-primary w-full py-4 text-base font-semibold">
              测测我的正缘人格 →
            </button>
          </Link>
          <p className="text-center text-gray-400 text-xs mt-3">
            小红书搜索「正缘引力」购买激活码 · ¥3.9 起
          </p>
        </div>
      </section>

    </main>
  );
}
