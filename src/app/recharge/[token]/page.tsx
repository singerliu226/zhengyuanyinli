"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

/**
 * 灵犀充能页 v2.1
 * 变更：
 * - 新增「个人扫码收款」模式（虎皮椒审核期间使用）
 * - 虎皮椒支付通道保留，通过 NEXT_PUBLIC_PAYJS_ENABLED=true 可随时切回
 * - 扫码模式流程：选套餐 → 展示收款码 → 用户支付并备注手机号 → 点击「已完成」→ 轮询到账
 * - 管理员收到付款通知后，在后台用手机号查找用户并手动充值
 */

const PACKAGES = [
  {
    id: "single",
    emoji: "⚡",
    name: "单次急救",
    lingxi: 2,
    price: "5.9",
    original: "9.9",
    desc: "临时起意的两个疑问",
    recommended: false,
  },
  {
    id: "standard",
    emoji: "💓",
    name: "灵犀标准包",
    lingxi: 15,
    price: "19.9",
    original: "29.9",
    desc: "足够深度探索你的关系模式",
    recommended: true,
  },
  {
    id: "deep",
    emoji: "🌟",
    name: "灵犀深度包",
    lingxi: 50,
    price: "49.9",
    original: "79.9",
    desc: "含1次完整关系诊断（5次灵犀）",
    recommended: false,
  },
];

/** 收款码地址，优先取环境变量，否则用 public/ 目录下的占位图 */
const PAYMENT_QR_URL = process.env.NEXT_PUBLIC_PAYMENT_QR_URL ?? "/payment-qr.svg";

/**
 * 是否启用虎皮椒正式支付通道
 * 审核通过后在 .env 中设置 NEXT_PUBLIC_PAYJS_ENABLED=true 即可切回
 */
const PAYJS_ENABLED = process.env.NEXT_PUBLIC_PAYJS_ENABLED === "true";

export default function RechargePage() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedPkg, setSelectedPkg] = useState("standard");
  const [lingxiLeft, setLingxiLeft] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [pollResult, setPollResult] = useState<"pending" | "success" | "timeout">("pending");
  const [error, setError] = useState("");
  const [testSuccess, setTestSuccess] = useState<number | null>(null);
  /** 用户点击「我已完成扫码支付」后进入等待态 */
  const [qrPaid, setQrPaid] = useState(false);

  const isDev = process.env.NODE_ENV === "development" ||
    (typeof window !== "undefined" && window.location.hostname === "localhost");

  const isReturnFromPayment = searchParams.get("status") === "success";

  const currentPkg = PACKAGES.find((p) => p.id === selectedPkg) ?? PACKAGES[1];

  // 页面加载时获取当前余额
  useEffect(() => {
    fetchLingxiLeft();
  }, []);

  async function fetchLingxiLeft() {
    try {
      const res = await fetch(`/api/result?token=${token}`);
      const data = await res.json();
      if (res.ok) setLingxiLeft(data.lingxiLeft);
    } catch {
      // 静默失败
    }
  }

  /**
   * 轮询余额直到检测到灵犀增加
   * 适用于两种场景：
   *   1. 虎皮椒支付回调后的自动到账检测
   *   2. 扫码收款后等待管理员手动充值
   * 最多轮询 60 次（约 120 秒），超时后提示联系客服
   */
  async function startPolling(initialBalance?: number) {
    setPolling(true);
    const baseline = initialBalance ?? lingxiLeft ?? 0;
    let count = 0;

    const timer = setInterval(async () => {
      count++;
      setPollCount(count);

      try {
        const res = await fetch(`/api/result?token=${token}`);
        const data = await res.json();

        if (res.ok && data.lingxiLeft > baseline) {
          clearInterval(timer);
          setLingxiLeft(data.lingxiLeft);
          setPolling(false);
          setPollResult("success");
          return;
        }
      } catch {
        // 继续轮询
      }

      // 扫码模式等待时间更长（管理员需要手动操作）
      const maxPolls = PAYJS_ENABLED ? 30 : 60;
      if (count >= maxPolls) {
        clearInterval(timer);
        setPolling(false);
        setPollResult("timeout");
      }
    }, 2000);
  }

  // ─── 虎皮椒支付（审核通过后使用）───────────────────────────────────────
  async function handlePayjsPay() {
    if (!selectedPkg || isProcessing) return;
    setError("");
    setIsProcessing(true);

    const currentBalance = lingxiLeft ?? 0;

    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, packageId: selectedPkg }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error ?? "创建订单失败，请重试");
        return;
      }

      await startPollingAfterRedirect(currentBalance);
      window.location.href = data.cashierUrl;
    } catch (err) {
      setError((err as Error).message ?? "网络异常，请重试");
    } finally {
      setIsProcessing(false);
    }
  }

  // 保存当前余额到 sessionStorage，跳回后用来比对是否到账
  async function startPollingAfterRedirect(baseline: number) {
    sessionStorage.setItem(`lingxi_baseline_${token}`, String(baseline));
  }

  // ─── 扫码收款模式：用户确认支付 ──────────────────────────────────────────
  function handleQrPaid() {
    const baseline = lingxiLeft ?? 0;
    setQrPaid(true);
    startPolling(baseline);
  }

  // ─── 测试支付（仅本地开发）────────────────────────────────────────────────
  async function handleTestPay() {
    if (isProcessing) return;
    setIsProcessing(true);
    setError("");
    try {
      const res = await fetch("/api/payment/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, packageId: selectedPkg }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error ?? "测试支付失败"); return; }
      setLingxiLeft(data.newBalance);
      setTestSuccess(data.lingxiAdded);
    } catch {
      setError("网络异常");
    } finally {
      setIsProcessing(false);
    }
  }

  // 虎皮椒回调返回页面时读取 baseline
  useEffect(() => {
    if (isReturnFromPayment) {
      const saved = sessionStorage.getItem(`lingxi_baseline_${token}`);
      const baseline = saved ? parseInt(saved, 10) : 0;
      sessionStorage.removeItem(`lingxi_baseline_${token}`);
      startPolling(baseline);
    }
  }, [isReturnFromPayment]);

  // ─── 到账成功/超时状态（两种支付模式共用）────────────────────────────────
  const PollResult = () => {
    if (polling) {
      return (
        <div className="bg-white rounded-2xl p-5 shadow-sm text-center border border-rose-100">
          <div className="text-3xl mb-3 animate-pulse">💓</div>
          <p className="text-sm font-medium text-gray-700">
            {PAYJS_ENABLED ? "正在确认到账..." : "等待管理员确认到账..."}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {PAYJS_ENABLED
              ? `预计等待 ${Math.min(pollCount * 2, 60)} 秒`
              : "支付后将在 15 分钟内到账，请稍候"}
          </p>
          {!PAYJS_ENABLED && (
            <p className="text-xs text-gray-300 mt-2">
              到账前页面可以关闭，稍后再来查看余额
            </p>
          )}
        </div>
      );
    }

    if (pollResult === "success") {
      return (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <p className="text-sm font-medium text-green-700">灵犀已到账！</p>
          <p className="text-xs text-green-500 mt-1">当前余额 {lingxiLeft} 次</p>
          <Link href={`/chat/${token}`}>
            <button className="mt-4 w-full py-2.5 text-sm bg-green-500 text-white rounded-xl font-medium">
              开始追问 →
            </button>
          </Link>
        </div>
      );
    }

    if (pollResult === "timeout") {
      return (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-center">
          <div className="text-3xl mb-2">⏳</div>
          <p className="text-sm font-medium text-amber-700">还未检测到到账</p>
          <p className="text-xs text-amber-600 mt-1 mb-4 leading-relaxed">
            {PAYJS_ENABLED
              ? "支付完成后一般1-3分钟到账，如超过5分钟未到账，请截图支付记录联系客服"
              : "正在处理中，如15分钟内未到账，请截图支付记录联系客服"}
          </p>
          <button
            onClick={() => { setPollResult("pending"); startPolling(); }}
            className="w-full py-2.5 text-xs border border-amber-300 text-amber-600 rounded-xl font-medium"
          >
            重新检测
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      {/* 顶部 */}
      <header className="px-6 pt-12 pb-4 flex items-center gap-4">
        <Link href={`/result/${token}`} className="text-gray-400 text-sm">← 返回报告</Link>
        <h1 className="font-bold text-gray-800">为你的心动充能</h1>
      </header>

      {/* 当前余额 */}
      {lingxiLeft !== null && (
        <div className="px-6 mb-4">
          <div className="max-w-sm mx-auto bg-white rounded-2xl px-5 py-3 flex items-center justify-between shadow-sm">
            <span className="text-sm text-gray-500">当前灵犀余额</span>
            <span className="text-rose-500 font-bold text-lg">💓 {lingxiLeft} 次</span>
          </div>
        </div>
      )}

      {/* 虎皮椒回调后的轮询状态 */}
      {isReturnFromPayment && (
        <div className="px-6 mb-4">
          <div className="max-w-sm mx-auto">
            <PollResult />
          </div>
        </div>
      )}

      {/* 扫码模式：用户点击「我已支付」后的等待状态 */}
      {qrPaid && !PAYJS_ENABLED && (
        <div className="px-6 mb-4">
          <div className="max-w-sm mx-auto">
            <PollResult />
          </div>
        </div>
      )}

      {/* 套餐选择（未在轮询中时展示） */}
      {!polling && pollResult !== "success" && !qrPaid && (
        <div className="px-6 pb-4">
          <div className="max-w-sm mx-auto space-y-3">
            {PACKAGES.map((pkg) => {
              const isSelected = selectedPkg === pkg.id;
              return (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPkg(pkg.id)}
                  className={`w-full text-left rounded-3xl p-5 transition-all border-2 ${
                    isSelected
                      ? "bg-white border-rose-400 shadow-md shadow-rose-100"
                      : "bg-white/60 border-transparent shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{pkg.emoji}</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-gray-800 text-sm">{pkg.name}</span>
                          {pkg.recommended && (
                            <span className="text-xs bg-rose-400 text-white px-1.5 py-0.5 rounded-full">推荐</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{pkg.desc}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-rose-500">¥{pkg.price}</div>
                      <div className="text-xs text-gray-300 line-through">¥{pkg.original}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">包含</span>
                    <span className="text-sm font-semibold text-rose-500">💓 {pkg.lingxi} 次灵犀</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 消耗规则说明 */}
      {!polling && pollResult !== "success" && !qrPaid && (
        <div className="px-6 pb-4">
          <div className="max-w-sm mx-auto bg-white/70 rounded-2xl p-4 text-xs text-gray-500 space-y-1.5">
            <p className="font-medium text-gray-600 mb-2">灵犀消耗规则</p>
            <p>💬 日常咨询（合适/类型/推荐等）：消耗 <strong>1次</strong></p>
            <p>🔍 深度分析（为什么/建议/怎么办等）：消耗 <strong>2次</strong></p>
            <p>🔍 关系诊断（填写基本情况，AI全面诊断）：消耗 <strong>5次</strong></p>
            <p className="text-gray-400 pt-1">灵犀次数永久有效，不限制使用期限</p>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="px-6 pb-4">
          <div className="max-w-sm mx-auto bg-red-50 border border-red-100 rounded-2xl p-3 text-xs text-red-600">
            {error}
          </div>
        </div>
      )}

      {/* ── 支付区域 ── */}
      {!polling && pollResult !== "success" && !qrPaid && (
        <div className="px-6 pb-8">
          <div className="max-w-sm mx-auto space-y-3">

            {/* 测试充值成功提示 */}
            {testSuccess !== null && (
              <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center">
                <div className="text-2xl mb-1">🎉</div>
                <p className="text-sm font-medium text-green-700">测试充值成功！</p>
                <p className="text-xs text-green-500 mt-1">
                  已添加 {testSuccess} 次灵犀，当前余额 {lingxiLeft} 次
                </p>
                <Link href={`/chat/${token}`}>
                  <button className="mt-3 w-full py-2.5 text-sm bg-green-500 text-white rounded-xl">
                    去找缘缘对话 →
                  </button>
                </Link>
              </div>
            )}

            {testSuccess === null && (
              <>
                {/* ── 模式一：个人扫码收款（虎皮椒审核期间默认使用）── */}
                {!PAYJS_ENABLED && (
                  <div className="bg-white rounded-3xl p-5 shadow-sm border border-rose-100">
                    {/* 标题 */}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-bold text-gray-800">扫码支付</p>
                        <p className="text-xs text-gray-400 mt-0.5">微信 / 支付宝 均可</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-rose-500">¥{currentPkg.price}</div>
                        <div className="text-xs text-gray-300 line-through">¥{currentPkg.original}</div>
                      </div>
                    </div>

                    {/* 收款码 */}
                    <div className="flex justify-center mb-4">
                      <img
                        src={PAYMENT_QR_URL}
                        alt="个人收款码"
                        width={160}
                        height={160}
                        className="rounded-2xl object-contain border border-gray-100 shadow-sm"
                        onError={(e) => {
                          const el = e.currentTarget;
                          el.style.display = "none";
                          const next = el.nextElementSibling as HTMLElement | null;
                          if (next) next.style.display = "flex";
                        }}
                      />
                      {/* 图片加载失败时的占位 */}
                      <div
                        style={{ display: "none" }}
                        className="w-40 h-40 border-2 border-dashed border-gray-200 rounded-2xl items-center justify-center text-center px-3"
                      >
                        <p className="text-xs text-gray-400 leading-relaxed">
                          配置 <code className="text-rose-400">NEXT_PUBLIC_PAYMENT_QR_URL</code><br />
                          或将收款码放在<br />
                          <code className="text-rose-400">public/payment-qr.png</code>
                        </p>
                      </div>
                    </div>

                    {/* 支付步骤 */}
                    <div className="bg-rose-50 rounded-2xl px-4 py-3 mb-4 space-y-2">
                      {[
                        `扫码支付 ¥${currentPkg.price}（${currentPkg.name}）`,
                        "备注你的手机号（必填，用于到账确认）",
                        "点击下方按钮，等待灵犀到账",
                      ].map((text, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-rose-400 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-xs text-gray-600 leading-relaxed">{text}</span>
                        </div>
                      ))}
                    </div>

                    {/* 已完成按钮 */}
                    <button
                      onClick={handleQrPaid}
                      className="btn-primary w-full py-3.5 text-sm font-semibold"
                    >
                      我已完成扫码支付，等待到账 →
                    </button>
                  </div>
                )}

                {/* ── 模式二：虎皮椒正式支付（NEXT_PUBLIC_PAYJS_ENABLED=true 时启用）── */}
                {PAYJS_ENABLED && (
                  <button
                    onClick={handlePayjsPay}
                    disabled={isProcessing}
                    className="btn-primary w-full py-4 text-base font-semibold"
                  >
                    {isProcessing
                      ? "正在创建订单..."
                      : `支付 ¥${currentPkg.price} · 支付宝`}
                  </button>
                )}

                {/* 测试支付按钮（仅本地开发） */}
                {isDev && (
                  <button
                    onClick={handleTestPay}
                    disabled={isProcessing}
                    className="w-full py-3 text-sm border-2 border-dashed border-amber-300 text-amber-600 rounded-2xl bg-amber-50 font-medium"
                  >
                    🧪 测试充值（跳过支付，仅开发环境）
                  </button>
                )}

                <p className="text-center text-gray-400 text-xs">
                  {PAYJS_ENABLED
                    ? "支付完成后自动到账 · 如有问题请联系客服"
                    : "支付后备注手机号 · 15分钟内到账 · 有问题联系客服"}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
