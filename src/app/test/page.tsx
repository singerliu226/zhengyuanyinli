"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QUESTIONS } from "@/data/questions";

type Answers = Record<number, "A" | "B" | "C" | "D">;
type TestDraft = {
  currentIndex: number;
  answers: Answers;
};

/**
 * 测试页 - 29道题目答题流程
 * 设计：一次显示一题，底部进度条，答完自动跳下一题
 * 所有答案本地维护，最后一题提交时统一发送
 */
export default function TestPage() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cardKeyId, setCardKeyId] = useState<string | null>(null);

  const currentQuestion = QUESTIONS[currentIndex];
  const total = QUESTIONS.length;
  const progress = Math.round(((currentIndex + 1) / total) * 100);
  const draftKey = cardKeyId ? `lcm_test_draft_${cardKeyId}` : "";

  useEffect(() => {
    // 从 sessionStorage 获取激活凭证
    const id = sessionStorage.getItem("cardKeyId") ?? localStorage.getItem("lcm_pending_cardKeyId");
    if (!id) {
      router.replace("/activate");
      return;
    }
    sessionStorage.setItem("cardKeyId", id);
    setCardKeyId(id);

    const savedDraft = localStorage.getItem(`lcm_test_draft_${id}`);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft) as TestDraft;
        setAnswers(draft.answers ?? {});
        setCurrentIndex(Math.min(Math.max(draft.currentIndex ?? 0, 0), total - 1));
      } catch {
        localStorage.removeItem(`lcm_test_draft_${id}`);
      }
    }
  }, [router, total]);

  useEffect(() => {
    if (!draftKey || submitting) return;
    localStorage.setItem(draftKey, JSON.stringify({ currentIndex, answers } satisfies TestDraft));
  }, [answers, currentIndex, draftKey, submitting]);

  // 未获取到激活凭证前不渲染题目（防止空白闪屏）
  if (!cardKeyId) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">正在验证激活状态...</div>
      </main>
    );
  }

  function handleSelect(optionId: "A" | "B" | "C" | "D") {
    const newAnswers = { ...answers, [currentQuestion.id]: optionId };
    setAnswers(newAnswers);

    // 自动前进到下一题（延迟200ms给用户视觉反馈）
    setTimeout(() => {
      if (currentIndex < total - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleSubmit(newAnswers);
      }
    }, 200);
  }

  async function handleSubmit(finalAnswers: Answers) {
    if (!cardKeyId) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardKeyId, answers: finalAnswers }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "提交失败，请重试");
        setSubmitting(false);
        return;
      }

      // 清除 sessionStorage，把 token 持久化到 localStorage 供首页浮动按钮读取
      sessionStorage.removeItem("cardKeyId");
      localStorage.removeItem("lcm_pending_cardKeyId");
      localStorage.removeItem(`lcm_test_draft_${cardKeyId}`);
      localStorage.setItem("lcm_token", data.token);
      router.push(`/result/${data.token}`);
    } catch {
      setError("网络异常，请重试");
      setSubmitting(false);
    }
  }

  // 提交中的加载状态
  if (submitting) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex flex-col items-center justify-center px-6">
        <div className="text-center">
          <div className="text-5xl mb-6 animate-pulse">🔮</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">正在分析你的恋爱人格...</h2>
          <p className="text-gray-500 text-sm">基于你的答案，生成恋爱人格、城市气质和追问建议</p>
          <div className="mt-6 h-1.5 w-48 bg-gray-200 rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-gradient-to-r from-rose-400 to-pink-400 rounded-full animate-pulse" style={{ width: "70%" }} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex flex-col">
      {/* 顶部进度区 */}
      <header className="px-6 pt-10 pb-4">
        <div className="max-w-sm mx-auto">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-gray-500">
              第 {currentIndex + 1} 题 / 共 {total} 题
            </span>
            <span className="text-sm font-semibold text-rose-500">
              {progress}%
            </span>
          </div>
          {/* 进度条 */}
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-400 to-pink-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* 维度标签 */}
          <div className="mt-2 text-xs text-gray-400">
            {
              {
                D1: "📊 生活节奏与事业观",
                D2: "👥 社交人格",
                D3: "🎨 审美与环境偏好",
                D4: "💰 价值观与金钱观",
                D5: "💕 情感需求",
                MBTI: "🧬 十六型人格测评",
              }[currentQuestion.dimension]
            }
          </div>
          <p className="mt-1 text-xs text-gray-400">
            凭第一反应作答即可，没有标准答案
          </p>
        </div>
      </header>

      {/* 题目内容 */}
      <div className="flex-1 px-6 py-4">
        <div className="max-w-sm mx-auto">
          {/* 题目文字 */}
          <div className="bg-white rounded-3xl p-6 shadow-sm mb-4">
            <div className="text-xs text-rose-400 font-semibold mb-2">
              {currentQuestion.dimension === "MBTI" ? "最后4题用于生成MBTI参考" : "关系场景题"}
            </div>
            <p className="text-base font-semibold text-gray-800 leading-relaxed">
              {currentQuestion.text}
            </p>
          </div>

          {/* 选项列表 */}
          <div className="space-y-3">
            {currentQuestion.options.map((option) => {
              const isSelected = answers[currentQuestion.id] === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  className={`w-full text-left rounded-2xl p-4 border-2 transition-all duration-150 ${
                    isSelected
                      ? "border-rose-400 bg-rose-50 shadow-sm"
                      : "border-gray-100 bg-white hover:border-rose-200 hover:bg-rose-50/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${
                        isSelected
                          ? "bg-rose-400 text-white"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {option.id}
                    </span>
                    <span className="text-sm text-gray-700 leading-relaxed">
                      {option.text}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-rose-600 text-sm">
              {error}
              <button
                onClick={() => handleSubmit(answers)}
                className="ml-2 underline"
              >
                重试
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 底部导航（允许回看上一题） */}
      {currentIndex > 0 && (
        <footer className="px-6 pb-8">
          <div className="max-w-sm mx-auto">
            <button
              onClick={() => setCurrentIndex(currentIndex - 1)}
              className="w-full py-3 text-gray-400 text-sm border border-gray-200 rounded-2xl bg-white"
            >
              ← 上一题
            </button>
          </div>
        </footer>
      )}
    </main>
  );
}
