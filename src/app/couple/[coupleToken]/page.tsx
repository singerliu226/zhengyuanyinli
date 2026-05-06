"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { QUESTIONS } from "@/data/questions";

type Answers = Record<number, "A" | "B" | "C" | "D">;
type CoupleDraft = {
  currentIndex: number;
  answers: Answers;
};

/**
 * 双人版伴侣测试入口页
 *
 * 流程：
 * 1. 用户通过邀请链接进入（URL：/couple/{coupleToken}）
 * 2. 显示「你的伴侣邀请你一起测试」欢迎页
 * 3. 直接做29道题（无需激活码，因为已包含在发起人的双人版里）
 * 4. 提交后跳转到自己的报告页
 */
export default function CoupleJoinPage() {
  const { coupleToken } = useParams<{ coupleToken: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<"welcome" | "test" | "submitting" | "done">("welcome");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [error, setError] = useState("");
  const [resultToken, setResultToken] = useState("");
  const [partnerType, setPartnerType] = useState("");

  const total = QUESTIONS.length;
  const currentQuestion = QUESTIONS[currentIndex];
  const progress = Math.round(((currentIndex + 1) / total) * 100);
  const draftKey = `lcm_couple_draft_${coupleToken}`;

  useEffect(() => {
    const savedDraft = localStorage.getItem(draftKey);
    if (!savedDraft) return;
    try {
      const draft = JSON.parse(savedDraft) as CoupleDraft;
      setAnswers(draft.answers ?? {});
      setCurrentIndex(Math.min(Math.max(draft.currentIndex ?? 0, 0), total - 1));
      if (Object.keys(draft.answers ?? {}).length > 0) {
        setPhase("test");
      }
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, [draftKey, total]);

  useEffect(() => {
    if (phase !== "test") return;
    localStorage.setItem(draftKey, JSON.stringify({ currentIndex, answers } satisfies CoupleDraft));
  }, [answers, currentIndex, draftKey, phase]);

  function handleSelect(optionId: "A" | "B" | "C" | "D") {
    const newAnswers = { ...answers, [currentQuestion.id]: optionId };
    setAnswers(newAnswers);

    setTimeout(() => {
      if (currentIndex < total - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleSubmit(newAnswers);
      }
    }, 200);
  }

  async function handleSubmit(finalAnswers: Answers) {
    setPhase("submitting");
    setError("");

    try {
      const res = await fetch("/api/couple/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupleToken, answers: finalAnswers }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error ?? "提交失败，请重试");
        setPhase("test");
        return;
      }

      setResultToken(data.token);
      setPartnerType(data.partnerPersonalityType ?? "");
      localStorage.removeItem(draftKey);
      setPhase("done");
    } catch {
      setError("网络异常，请检查网络后重试");
      setPhase("test");
    }
  }

  // 欢迎页
  if (phase === "welcome") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex flex-col items-center justify-center px-6">
        <div className="max-w-sm w-full bg-white rounded-3xl p-8 shadow-md text-center">
          <div className="text-5xl mb-4">🌸</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">有人想和你一起探索</h1>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            TA 完成了「正缘引力」测试，想邀请你也来做一份——<br />
            两份报告在手，AI 缘缘能帮你们读懂彼此。
          </p>
          <div className="bg-rose-50 rounded-2xl p-4 mb-6 text-left space-y-2">
            <p className="text-xs text-gray-600">📝 29道题 + MBTI，约3分钟完成</p>
            <p className="text-xs text-gray-600">📊 获得你的专属恋爱人格报告</p>
            <p className="text-xs text-gray-600">💕 双人同频 AI 对话，理解彼此更深一层</p>
          </div>
          <button
            onClick={() => setPhase("test")}
            className="btn-primary w-full py-4 text-base"
          >
            开始测试 →
          </button>
          <p className="text-xs text-gray-400 mt-3">此链接仅限一次使用 · 结果仅你可见</p>
        </div>
      </main>
    );
  }

  // 提交中
  if (phase === "submitting") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">🔮</div>
          <p className="text-gray-600 font-medium">正在生成你的报告...</p>
          <p className="text-gray-400 text-sm mt-2">并与你的伴侣结对中</p>
        </div>
      </main>
    );
  }

  // 完成
  if (phase === "done") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center px-6">
        <div className="max-w-sm w-full bg-white rounded-3xl p-8 shadow-md text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">结对成功！</h2>
          {partnerType && (
            <p className="text-gray-500 text-sm mb-2">
              你的人格：<strong className="text-rose-500">{partnerType}</strong>
            </p>
          )}
          <p className="text-gray-400 text-sm mb-6 leading-relaxed">
            现在你们可以开启双人同频 AI 对话了，让缘缘帮你们找到彼此的沟通方式。
          </p>
          <button
            onClick={() => router.push(`/result/${resultToken}`)}
            className="btn-primary w-full py-4 text-base"
          >
            查看我的报告 →
          </button>
        </div>
      </main>
    );
  }

  // 答题页面
  if (!currentQuestion) return null;

  const selectedOption = answers[currentQuestion.id];

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex flex-col">
      {/* 进度条 */}
      <div className="h-1 bg-rose-100">
        <div
          className="h-full bg-gradient-to-r from-rose-400 to-pink-400 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 题目头部 */}
      <div className="px-6 pt-8 pb-4">
        <div className="max-w-sm mx-auto flex items-center justify-between mb-6">
          <span className="text-xs text-gray-400">双人版 · 伴侣测试</span>
          <span className="text-sm text-gray-500 font-medium">
            {currentIndex + 1}/{total}
          </span>
        </div>

        <div className="max-w-sm mx-auto">
          <div className="text-xs text-rose-400 font-medium mb-2 uppercase tracking-wider">
            {currentQuestion.dimension}
          </div>
          <h2 className="text-lg font-bold text-gray-800 leading-snug">
            {currentQuestion.text}
          </h2>
        </div>
      </div>

      {/* 选项 */}
      <div className="flex-1 px-6 pb-6">
        <div className="max-w-sm mx-auto space-y-3">
          {currentQuestion.options.map((option) => (
            <button
              key={option.id}
              onClick={() => handleSelect(option.id as "A" | "B" | "C" | "D")}
              className={`w-full text-left rounded-2xl p-4 border-2 transition-all ${
                selectedOption === option.id
                  ? "border-rose-400 bg-rose-50 shadow-md"
                  : "border-gray-100 bg-white shadow-sm hover:border-rose-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  selectedOption === option.id
                    ? "bg-rose-400 text-white"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {option.id}
                </span>
                <p className="text-sm text-gray-700 leading-relaxed">{option.text}</p>
              </div>
            </button>
          ))}

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
