"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * 落地页 v2.3
 * 变更：
 * - 新增个人收款码支付弹窗（虎皮椒审核期间的过渡方案）
 * - CTA 区增加「立即购买」主按钮，点击后弹出对应版本的价格确认 + 收款码
 * - 用户扫码支付并备注手机号，等待激活码发送
 * - 保留「已有激活码」入口作为次级操作
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

/** 支付渠道定义 */
const PAY_CHANNELS = [
  {
    id: "wechat",
    label: "微信支付",
    icon: "💚",
    src: "/wechat.jpg",
    color: "border-green-400 text-green-600",
    activeBg: "bg-green-50",
  },
  {
    id: "alipay",
    label: "支付宝",
    icon: "💙",
    src: "/alipay.png",
    color: "border-blue-400 text-blue-600",
    activeBg: "bg-blue-50",
  },
] as const;

// ─────────────────────────────────────────────────────────────
// 购买引导弹窗（支付渠道打通前的过渡方案）
// ─────────────────────────────────────────────────────────────

/** 购买渠道配置，待正式支付上线前在此填写各平台链接 */
const BUY_CHANNELS = [
  {
    id: "xhs",
    icon: "📕",
    name: "小红书",
    label: "搜索「正缘引力」购买",
    hint: "搜索后发私信，选好套餐即可付款",
    color: "border-red-200 bg-red-50",
    textColor: "text-red-600",
    btnClass: "bg-red-500 hover:bg-red-600 text-white",
    link: "", // 上线后填写小红书主页链接
  },
  {
    id: "xianyu",
    icon: "🐟",
    name: "闲鱼",
    label: "搜索「正缘引力」购买",
    hint: "购买后系统自动发送激活码到消息",
    color: "border-orange-200 bg-orange-50",
    textColor: "text-orange-600",
    btnClass: "bg-orange-500 hover:bg-orange-600 text-white",
    link: "", // 上线后填写闲鱼商品链接
  },
] as const;

interface BuyGuideModalProps {
  plan: (typeof PLANS)[number];
  onClose: () => void;
}

/**
 * 购买引导弹窗
 * 虎皮椒支付审核通过后，将此组件替换为 PaymentModal 并更新 CTA onClick 即可
 */
function BuyGuideModal({ plan, onClose }: BuyGuideModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl w-full max-w-sm px-5 pt-5 pb-10">

        {/* 拖拽条 */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        {/* 套餐 + 关闭 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-xl">{plan.emoji}</span>
            <div>
              <div className="font-bold text-gray-800 text-sm">{plan.name}</div>
              <div className="text-xs text-gray-400">{plan.scene}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-rose-500">¥{plan.price}</span>
            <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-2xl leading-none ml-1">×</button>
          </div>
        </div>

        {/* 说明 */}
        <div className="bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-4">
          <p className="text-xs font-bold text-rose-600 mb-1">📦 如何购买激活码</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            在小红书或闲鱼搜索「正缘引力」，选择对应套餐付款后，
            激活码会通过平台消息发送给你，复制粘贴即可使用。
          </p>
        </div>

        {/* 渠道卡片 */}
        <div className="space-y-3 mb-5">
          {BUY_CHANNELS.map((ch) => (
            <div key={ch.id} className={`border-2 ${ch.color} rounded-2xl px-4 py-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{ch.icon}</span>
                  <div>
                    <div className={`text-sm font-bold ${ch.textColor}`}>{ch.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{ch.hint}</div>
                  </div>
                </div>
                {ch.link ? (
                  <a
                    href={ch.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-xs px-3 py-1.5 rounded-xl font-medium ${ch.btnClass}`}
                  >
                    前往 →
                  </a>
                ) : (
                  <span className="text-xs px-3 py-1.5 rounded-xl bg-gray-100 text-gray-400 font-medium">
                    搜索购买
                  </span>
                )}
              </div>
              <div className={`mt-2 text-xs font-mono font-medium ${ch.textColor} bg-white/70 rounded-lg px-3 py-1.5 text-center`}>
                搜索：正缘引力 · {plan.name}
              </div>
            </div>
          ))}
        </div>

        {/* 已有激活码 */}
        <p className="text-center text-xs text-gray-400">
          购买后收到激活码？
          <button
            onClick={onClose}
            className="text-rose-400 underline ml-1"
          >
            点此返回输入激活码
          </button>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 个人收款码支付弹窗（留存备用，支付渠道打通后可切换回来）
// ─────────────────────────────────────────────────────────────
interface PaymentModalProps {
  plan: (typeof PLANS)[number];
  onClose: () => void;
  onPaid: () => void;
}

/** 下载二维码图片（同源，直接 fetch→blob→a[download]） */
async function downloadQR(channel: "wechat" | "alipay") {
  const src = channel === "wechat" ? "/wechat.jpg" : "/alipay.png";
  const filename = channel === "wechat" ? "微信收款码.jpg" : "支付宝收款码.png";
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    window.open(src, "_blank");
  }
}

function PaymentModal({ plan, onClose, onPaid }: PaymentModalProps) {
  const [paid, setPaid] = useState(false);
  const [channel, setChannel] = useState<"wechat" | "alipay">("wechat");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentChannel = PAY_CHANNELS.find((c) => c.id === channel)!;

  function validatePhone(v: string): boolean {
    return /^1[3-9]\d{9}$/.test(v.trim());
  }

  async function handlePaid() {
    if (!validatePhone(phone)) {
      setPhoneError("请输入正确的 11 位手机号");
      return;
    }
    setPhoneError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/payment/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          channel,
          amount: plan.price,
          packageName: plan.name,
          packageId: plan.id,
          type: "initial",
        }),
      });
      // 提交失败时弹出提示，但不阻断展示确认态（用户已付款）
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error("收款记录提交失败", d);
      }
    } catch (e) {
      console.error("收款记录提交异常", e);
    } finally {
      setSubmitting(false);
      setPaid(true);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl w-full max-w-sm px-5 pt-5 pb-10 overflow-y-auto max-h-[92vh]">

        {/* 拖拽条 */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        {/* 套餐信息 + 关闭 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">{plan.emoji}</span>
            <div>
              <div className="font-bold text-gray-800 text-sm">{plan.name}</div>
              <div className="text-xs text-gray-400">{plan.scene}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold text-rose-500">¥{plan.price}</div>
              <div className="text-xs text-gray-300 line-through">¥{plan.original}</div>
            </div>
            <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-2xl leading-none ml-1">×</button>
          </div>
        </div>

        {/* ── 支付前 ── */}
        {!paid && (
          <>
            {/* ① 手机号输入框（最关键，放最上方） */}
            <div className="mb-4">
              <label className="text-xs font-bold text-gray-700 mb-1.5 block">
                📱 你的手机号 <span className="text-red-500">*</span>
                <span className="font-normal text-gray-400 ml-1">（激活码发送凭证）</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 11)); setPhoneError(""); }}
                placeholder="输入 11 位手机号"
                className={`w-full border-2 rounded-xl px-4 py-3 text-base font-mono focus:outline-none transition-colors ${
                  phoneError ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-rose-400"
                }`}
              />
              {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
              <p className="text-xs text-gray-400 mt-1">
                支付时备注同一手机号，方便我们核对并发送激活码
              </p>
            </div>

            {/* ② 渠道切换 */}
            <div className="flex gap-2 mb-3">
              {PAY_CHANNELS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setChannel(c.id as "wechat" | "alipay")}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-colors ${
                    channel === c.id
                      ? `${c.color} ${c.activeBg}`
                      : "border-gray-100 text-gray-400 bg-gray-50"
                  }`}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>

            {/* ③ 收款二维码 + 下载按钮 */}
            <div className="flex flex-col items-center mb-4">
              <img
                key={currentChannel.src}
                src={currentChannel.src}
                alt={currentChannel.label + "收款码"}
                className="w-52 h-52 object-contain rounded-2xl shadow-sm mb-2"
              />
              <button
                onClick={() => downloadQR(channel)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-rose-400 transition-colors border border-gray-200 hover:border-rose-200 px-3 py-1.5 rounded-full"
              >
                ⬇️ 保存收款码到手机
              </button>
            </div>

            {/* ④ 步骤说明（精简版） */}
            <div className="space-y-1.5 mb-4">
              {[
                { text: `扫码支付 ¥${plan.price}（${plan.name}）`, warn: false },
                { text: `备注你的手机号：${phone || "（见上方输入框）"}`, warn: true },
                { text: "点下方按钮，5 分钟内收到激活码", warn: false },
              ].map((item, i) => (
                <div key={i} className={`flex items-start gap-2.5 rounded-xl px-3 py-2 ${item.warn ? "bg-amber-50" : "bg-gray-50"}`}>
                  <span className={`flex-shrink-0 w-4 h-4 rounded-full text-white text-xs font-bold flex items-center justify-center mt-0.5 ${item.warn ? "bg-amber-400" : "bg-rose-400"}`}>
                    {i + 1}
                  </span>
                  <span className={`text-xs leading-relaxed ${item.warn ? "text-amber-700 font-medium" : "text-gray-600"}`}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={handlePaid}
              disabled={submitting}
              className="btn-primary w-full py-4 text-base font-semibold disabled:opacity-60"
            >
              {submitting ? "提交中..." : "我已完成支付 →"}
            </button>

            <p className="text-center text-xs text-gray-300 mt-3">
              收到激活码后，点「已有激活码」即可开始
            </p>
          </>
        )}

        {/* ── 支付后：静态等待卡片 ── */}
        {paid && (
          <div className="text-center py-2">
            <div className="text-4xl mb-3">💓</div>
            <h3 className="text-base font-bold text-gray-800 mb-1">收款确认中</h3>
            <p className="text-sm text-gray-500 mb-4">
              请稍等，<strong className="text-rose-500">5 分钟内</strong>激活码将发送到你的
              {channel === "wechat" ? "微信" : "支付宝"}消息
            </p>

            <div className="bg-rose-50 rounded-2xl px-4 py-4 mb-5 text-left space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">手机号</span>
                <span className="font-mono font-bold text-gray-800">{phone}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">套餐</span>
                <span className="font-bold text-gray-800">{plan.emoji} {plan.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">金额</span>
                <span className="font-bold text-rose-500">¥{plan.price}</span>
              </div>
              <div className="border-t border-rose-100 pt-2">
                <p className="text-xs text-gray-400 text-center">请截图此页面备用</p>
              </div>
            </div>

            <button onClick={onPaid} className="btn-primary w-full py-3.5 text-sm font-semibold mb-3">
              前往输入激活码 →
            </button>
            <button onClick={() => setPaid(false)} className="text-xs text-gray-400 underline">
              还没支付？返回重新扫码
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────────────────────
export default function HomePage() {
  const [selectedPlan, setSelectedPlan] = useState<string>("couple");
  /** true=购买引导弹窗；支付渠道打通后改为收款码弹窗 */
  const [showBuyGuide, setShowBuyGuide] = useState(false);
  const router = useRouter();

  const currentPlan = PLANS.find((p) => p.id === selectedPlan) ?? PLANS[1];

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">

      {/* ── 已购买快捷入口条（置顶） ── */}
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
        <div className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-500 text-xs font-medium px-4 py-1.5 rounded-full mb-6">
          <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-pulse" />
          首周特惠 · 已有 3,847 人解锁报告
        </div>

        <h1 className="text-4xl font-bold mb-3 text-gradient leading-tight">
          正缘引力
        </h1>

        <h2 className="text-xl font-semibold text-gray-700 mb-3 leading-snug">
          发现你的正缘
        </h2>

        <p className="text-gray-500 text-sm max-w-xs mx-auto leading-loose">
          先测试了解你自己，才能遇见正缘
          <br />
          <span className="text-rose-400 font-medium">双人版：帮你读懂 TA，让 TA 理解你</span>
        </p>
      </section>

      {/* 定价卡片（点击选择，高亮显示） */}
      <section className="px-4 py-2">
        <div className="max-w-sm mx-auto space-y-3">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                onClick={() => { setSelectedPlan(plan.id); setShowBuyGuide(true); }}
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

      {/* 双人同频核心亮点 */}
      <section className="px-6 py-6">
        <div className="max-w-sm mx-auto bg-gradient-to-br from-rose-50 to-pink-50 rounded-3xl p-5 border border-rose-100">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">💌</span>
            <h3 className="font-bold text-gray-800 text-sm">你们不是不爱，是频道不对</h3>
          </div>

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

      {/* 产品四大核心 */}
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

      {/* 用户评价 */}
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

      {/* ── CTA 区：立即购买（主）+ 已有激活码（次） ── */}
      <section className="px-6 pb-8">
        <div className="max-w-sm mx-auto space-y-3">
          {/* 主按钮：立即购买 → 跳转购买引导（支付渠道待开通） */}
          <button
            onClick={() => setShowBuyGuide(true)}
            className="btn-primary w-full py-4 text-base font-semibold"
          >
            立即购买 · {currentPlan.emoji} {currentPlan.name} ¥{currentPlan.price} →
          </button>

          {/* 次级：已有激活码 */}
          <Link href="/activate">
            <button className="w-full py-3 text-sm font-medium text-rose-400 border border-rose-200 rounded-2xl bg-white hover:bg-rose-50 transition-colors">
              已有激活码，直接开始 →
            </button>
          </Link>

          <p className="text-center text-gray-300 text-xs">
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

      {/* 购买引导弹窗（支付渠道待开通期间使用） */}
      {showBuyGuide && (
        <BuyGuideModal
          plan={currentPlan}
          onClose={() => setShowBuyGuide(false)}
        />
      )}

      {/* 收款码支付弹窗（留存备用，支付渠道开通后切换） */}
      {/* showBuyGuide 替换为 showPayModal，并还原 state 名称即可启用 */}

    </main>
  );
}
