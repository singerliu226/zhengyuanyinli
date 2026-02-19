"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CustomerService from "@/components/CustomerService";

/**
 * 激活页 v2.1
 *
 * 改动：
 * - 移除多余的「← 返回」按钮（买家从发货链接直接进入，不需要回到首页）
 * - 激活成功后，按版本类型（personal / couple）显示差异化引导说明
 * - 「已了解，开始测试」后才跳转到答题页
 */

const PLAN_INFO: Record<string, { emoji: string; name: string; tips: string[]; buttonText: string }> = {
  personal: {
    emoji: "💫",
    name: "个人探索版",
    tips: [
      "完成 25 道题（约3分钟），立即生成你的恋爱人格报告",
      "报告解锁后，可用 3 次灵犀向 AI「缘缘」追问",
      "报告有效期 72 小时，灵犀次数永久有效",
    ],
    buttonText: "开始我的测试 →",
  },
  couple: {
    emoji: "💕",
    name: "双人同频版",
    tips: [
      "你是发起人，先完成 25 道题生成自己的报告",
      "报告页会生成一个「邀请链接」，发给你的伴侣/闺蜜",
      "对方点击链接、完成测试后，你们就能开启双人同频 AI 对话",
      "你和对方各有 8 次灵犀可使用",
    ],
    buttonText: "先做我自己的测试 →",
  },
  gift: {
    emoji: "🎁",
    name: "礼盒限定版",
    tips: [
      "你是发起人，先完成 25 道题生成自己的报告",
      "报告页会生成邀请链接，分享给收礼人",
      "对方完成测试后可开启双人同频 AI 对话",
      "你和对方各有 15 次灵犀可使用",
    ],
    buttonText: "先做我自己的测试 →",
  },
};

export default function ActivatePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activatedPlan, setActivatedPlan] = useState<string | null>(null);

  /** 自动格式化激活码：每4位加连字符 */
  function handleCodeInput(value: string) {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const formatted = clean.match(/.{1,4}/g)?.join("-") ?? clean;
    setCode(formatted.slice(0, 19)); // XXXX-XXXX-XXXX-XXXX = 19字符
  }

  async function handleActivate() {
    setError("");

    if (code.replace(/-/g, "").length < 16) {
      setError("请输入完整的激活码（16位）");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入正确的手机号");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, phone }),
      });

      const data = await res.json();

      if (!data.success) {
        // 手机号已有记录 → 引导去「找回报告」页面
        if (data.canRetrieve) {
          router.push(`/find?phone=${encodeURIComponent(phone)}`);
          return;
        }
        setError(data.error || "激活失败，请重试");
        return;
      }

      // 已完成过测试的回头客 → 直接跳到已有报告
      if (data.alreadyCompleted && data.resultToken) {
        router.push(`/result/${data.resultToken}`);
        return;
      }

      // 存入 sessionStorage 供答题页使用
      sessionStorage.setItem("cardKeyId", data.cardKeyId);
      sessionStorage.setItem("planType", data.planType ?? "personal");
      sessionStorage.setItem("activatedPhone", phone.slice(0, 3) + "****" + phone.slice(-4));

      // 显示版本引导弹层，而非直接跳转
      setActivatedPlan(data.planType ?? "personal");
    } catch {
      setError("网络异常，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }

  // ── 激活成功后的版本引导弹层 ──────────────────────────────────────
  if (activatedPlan) {
    const plan = PLAN_INFO[activatedPlan] ?? PLAN_INFO.personal;
    return (
      <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center px-6">
        <div className="max-w-sm w-full bg-white rounded-3xl p-8 shadow-md text-center">
          <div className="text-5xl mb-3">{plan.emoji}</div>
          <div className="inline-block bg-rose-50 text-rose-500 text-xs font-medium px-3 py-1 rounded-full mb-3">
            激活成功 · {plan.name}
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-5">开始之前，了解一下流程</h2>

          <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-left space-y-3">
            {plan.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 bg-rose-100 text-rose-500 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-gray-600 leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => router.push("/test")}
            className="btn-primary w-full py-4 text-base"
          >
            {plan.buttonText}
          </button>
          <p className="text-xs text-gray-400 mt-3">
            激活码已绑定此手机号，仅你本人可使用
          </p>
        </div>
      </main>
    );
  }

  // ── 激活码输入页面 ────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex flex-col justify-center">
      <div className="flex-1 flex flex-col justify-center px-6 max-w-sm mx-auto w-full">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔑</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">输入激活码</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            在订单消息中找到激活码<br />
            每个激活码仅限一人使用
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm space-y-4">
          {/* 激活码输入 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              激活码
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => handleCodeInput(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              maxLength={19}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-center text-lg font-mono tracking-widest focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            />
          </div>

          {/* 手机号输入 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              手机号
              <span className="text-gray-400 font-normal ml-1 text-xs">用于绑定，不会泄露</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="请输入手机号"
              maxLength={11}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-center text-lg focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-rose-600 text-sm">
              {error}
            </div>
          )}

          {/* 激活按钮 */}
          <button
            onClick={handleActivate}
            disabled={loading}
            className="btn-primary w-full py-4 text-base"
          >
            {loading ? "验证中..." : "激活并开始测试 →"}
          </button>
        </div>

        <div className="mt-5 space-y-2">
          <p className="text-center text-gray-400 text-xs">
            🔒 激活码绑定手机号后，仅你本人可使用
          </p>
          {/* 找回报告入口：已完成测试的回头客用手机号直接找回 */}
          <button
            onClick={() => router.push("/find")}
            className="w-full text-center text-rose-400 text-xs underline py-1"
          >
            已完成测试？用手机号找回报告 →
          </button>
          <p className="text-center text-gray-400 text-xs">
            还没有激活码？小红书 / 闲鱼搜索「正缘引力」购买
          </p>
        </div>
      </div>

      <CustomerService />
    </main>
  );
}
