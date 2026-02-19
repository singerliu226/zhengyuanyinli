"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * 落地页 v2.2
 * 文案改版：
 * - 主标题突出「恋爱中介」和「读懂彼此」定位，城市匹配退为钩子
 * - 隐藏礼盒限定版（保留数据结构，前端不展示）
 * - 隐藏深夜模式相关提示
 * - 双人亮点区用痛点入场，强调 AI 作为中立关系顾问的价值
 */

/** 礼盒版暂时隐藏，保留数据结构方便后续上线 */
const PLANS = [
  {
    id: "personal",
    emoji: "💫",
    name: "个人探索版",
    price: "9.9",
    original: "29.9",
    lingxi: 3,
    features: ["25题恋爱人格测试", "完整报告（城市+人格）", "3次灵犀追问"],
    scene: "一个人，先读懂自己",
    badge: null,
  },
  {
    id: "couple",
    emoji: "💕",
    name: "双人同频版",
    price: "24.9",
    original: "49.9",
    lingxi: 8,
    features: ["两份独立测试报告", "双人匹配度深度分析", "各8次灵犀追问", "✨ AI关系顾问模式"],
    scene: "两个人，读懂彼此",
    badge: "主推",
  },
] as const;

export default function HomePage() {
  const [selectedPlan, setSelectedPlan] = useState<string>("couple");
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">

      {/* ── 已购买快捷入口条（置顶，买家从这里直接进入） ── */}
      <div className="bg-white border-b border-rose-100 px-4 py-3 flex items-center justify-between gap-2">
        <div className="text-xs text-gray-500 flex-shrink-0">
          <span className="mr-1">🎫</span>
          已购买？
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/find")}
            className="text-xs font-medium text-rose-400 border border-rose-200 px-3 py-1.5 rounded-full transition-colors hover:bg-rose-50"
          >
            找回报告
          </button>
          <button
            onClick={() => router.push("/activate")}
            className="text-xs font-semibold text-white bg-rose-400 hover:bg-rose-500 px-4 py-1.5 rounded-full transition-colors"
          >
            立即激活 →
          </button>
        </div>
      </div>

      {/* 顶部标题区 */}
      <section className="pt-12 pb-6 px-6 text-center">
        {/* 活跃人数气泡 */}
        <div className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-500 text-xs font-medium px-4 py-1.5 rounded-full mb-6">
          <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-pulse" />
          首周特惠 · 已有 3,847 人解锁报告
        </div>

        {/* 品牌名 */}
        <h1 className="text-4xl font-bold mb-3 text-gradient leading-tight">
          正缘引力
        </h1>

        {/* 副标题 */}
        <h2 className="text-xl font-semibold text-gray-700 mb-3 leading-snug">
          发现你的正缘
        </h2>

        {/* 描述 */}
        <p className="text-gray-500 text-sm max-w-xs mx-auto leading-loose">
          先测试了解你自己，才能遇见正缘
          <br />
          <span className="text-rose-400 font-medium">双人版：帮你读懂 TA，让 TA 理解你</span>
        </p>
      </section>

      {/* 定价卡片（仅展示个人版 + 双人版） */}
      <section className="px-4 py-2">
        <div className="max-w-sm mx-auto space-y-3">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full text-left rounded-3xl p-5 transition-all duration-200 border-2 ${
                  isSelected
                    ? "bg-white border-rose-400 shadow-lg shadow-rose-100"
                    : "bg-white/60 border-transparent shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{plan.emoji}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800 text-sm">{plan.name}</span>
                        {plan.badge && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-rose-400 text-white">
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{plan.scene}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold text-rose-500">
                      ¥{plan.price}
                    </div>
                    <div className="text-xs text-gray-300 line-through">¥{plan.original}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {plan.features.map((f) => (
                    <span
                      key={f}
                      className={`text-xs px-2.5 py-1 rounded-full ${
                        f.startsWith("✨")
                          ? "bg-rose-50 text-rose-500 font-medium"
                          : "bg-gray-50 text-gray-500"
                      }`}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 双人同频核心亮点 —— 以痛点入场，而不是功能介绍 */}
      <section className="px-6 py-6">
        <div className="max-w-sm mx-auto bg-gradient-to-br from-rose-50 to-pink-50 rounded-3xl p-5 border border-rose-100">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">💌</span>
            <h3 className="font-bold text-gray-800 text-sm">你们不是不爱，是频道不对</h3>
          </div>

          {/* 场景化痛点 */}
          <div className="space-y-2 mb-4">
            {[
              "你需要稳定感，TA 渴望新鲜感",
              "你用沉默思考，TA 以为你在生气",
              "你喜欢快决策，TA 需要慢下来",
            ].map((scene) => (
              <div key={scene} className="flex items-center gap-2 text-xs text-gray-500">
                <span className="text-rose-300">·</span>
                <span>{scene}</span>
              </div>
            ))}
          </div>

          {/* 解法 */}
          <div className="bg-white/80 rounded-2xl px-4 py-3">
            <p className="text-xs text-gray-600 leading-relaxed">
              这些分歧，背后都是人格差异。<br />
              缘缘会同时读完你们<strong>两份报告</strong>，作为中立的
              <strong>关系顾问</strong>，告诉你们：
              <br />
              <span className="text-rose-500">为什么会这样 · 怎么找到彼此的平衡点</span>
            </p>
          </div>
        </div>
      </section>

      {/* 产品四大核心：重排序突出「关系顾问」 */}
      <section className="px-6 pb-4">
        <div className="max-w-sm mx-auto space-y-3">
          {[
            {
              icon: "💌",
              title: "AI 关系顾问",
              desc: "双人版完成后，缘缘同时读懂你们两个人的人格档案，分析分歧根源，给出双方都能接受的沟通方式",
            },
            {
              icon: "🧠",
              title: "恋爱人格测试",
              desc: "依恋理论 + 大五人格双底座，25道真实场景题，测出你独特的恋爱密码",
            },
            {
              icon: "🏙️",
              title: "人格匹配",
              desc: "基于你的人格特质匹配最适合你谈恋爱的性格、城市，超准且超好分享",
            },
            {
              icon: "🔒",
              title: "一码一人",
              desc: "激活码绑定手机号 + 设备，双人版各自独立激活，结果安全保护",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-white rounded-2xl p-4 flex items-start gap-3 shadow-sm"
            >
              <span className="text-2xl flex-shrink-0">{item.icon}</span>
              <div>
                <div className="font-semibold text-gray-800 text-sm">{item.title}</div>
                <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 用户评价：突出「读懂彼此」的真实反馈 */}
      <section className="px-6 py-2 pb-6">
        <div className="max-w-sm mx-auto">
          <h3 className="text-center text-xs font-medium text-gray-400 mb-3">他们说 ↓</h3>
          <div className="space-y-2">
            {[
              {
                text: "和男友各自测了，缘缘说我们都需要高质量陪伴，但我倾向仪式感他倾向安静，给了我们具体相处方式，这次终于不吵了",
                user: "双人同频版 @清清",
              },
              {
                text: "之前以为是性格不合，测完才知道是依恋风格差异——我是焦虑型，他是回避型，缘缘解释得太准了，感觉终于有人懂我了",
                user: "个人探索版 @Mia",
              },
              {
                text: "测出来是成都烟火温柔型，超准！发朋友圈被疯狂转发，三个朋友来问我在哪测的",
                user: "小红书 @橘子味的夏天",
              },
            ].map((review, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-gray-700 text-xs leading-relaxed">「{review.text}」</p>
                <p className="text-gray-400 text-xs mt-2">{review.user}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA 按钮 */}
      <section className="px-6 pb-8">
        <div className="max-w-sm mx-auto">
          <Link href="/activate">
            <button className="btn-primary w-full py-4 text-base font-semibold">
              输入激活码，开始测试 →
            </button>
          </Link>
          <p className="text-center text-gray-400 text-xs mt-3">
            还没有激活码？小红书 / 闲鱼搜索「正缘引力」购买
          </p>
          <p className="text-center text-gray-300 text-xs mt-1">
            首周特惠 · 名额有限 · 随时恢复原价
          </p>
        </div>
      </section>

      {/* 城市矩阵 */}
      <section className="px-6 pb-6">
        <div className="max-w-sm mx-auto grid grid-cols-4 gap-2">
          {[
            { city: "北京", emoji: "🔥" },
            { city: "上海", emoji: "💎" },
            { city: "成都", emoji: "🍜" },
            { city: "大理", emoji: "📚" },
            { city: "厦门", emoji: "🧭" },
            { city: "西安", emoji: "🏡" },
            { city: "广州", emoji: "🦋" },
            { city: "苏州", emoji: "🌊" },
          ].map((item) => (
            <div key={item.city} className="bg-white/60 rounded-2xl p-2.5 text-center">
              <div className="text-xl mb-0.5">{item.emoji}</div>
              <div className="text-xs text-gray-500">{item.city}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center text-gray-300 text-xs pb-8">
        <p>© 2026 正缘引力 · 仅供娱乐参考，不构成专业心理建议</p>
      </footer>
    </main>
  );
}
