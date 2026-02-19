"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

/**
 * 灵犀充能页
 * 流程：选套餐 → 调 /api/payment/create → 跳转虎皮椒收银台 → 支付完成跳回 → 轮询到账
 *
 * URL 参数：
 * - status=success  支付宝/微信回调后携带，显示"正在确认到账"并轮询
 * - pkg=xxx         套餐名称，用于展示
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
    desc: "赠送1次专属月度复盘",
    recommended: false,
  },
];

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

  const isReturnFromPayment = searchParams.get("status") === "success";
  const pkgName = searchParams.get("pkg") ?? "";

  // 页面加载时获取当前余额
  // BUG-FIX: 原版在这里也调用了 startPolling()，导致和下面 useEffect 产生双重轮询定时器；
  // 轮询逻辑统一由第二个 useEffect 负责（它能正确读取 sessionStorage 中的 baseline）
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
   * 最多轮询 30 次（约 60 秒），超时后提示联系客服
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

      if (count >= 30) {
        clearInterval(timer);
        setPolling(false);
        setPollResult("timeout");
      }
    }, 2000);
  }

  async function handlePay() {
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

      // 跳转到虎皮椒收银台（支付宝/微信）
      // 支付完成后 PayJS 会回调 notify_url（webhook）并重定向到 callback_url
      // 我们在 callback_url 里加了 ?status=success 参数，此页面会自动轮询
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

  // 返回页面时读取 baseline
  useEffect(() => {
    if (isReturnFromPayment) {
      const saved = sessionStorage.getItem(`lingxi_baseline_${token}`);
      const baseline = saved ? parseInt(saved, 10) : 0;
      sessionStorage.removeItem(`lingxi_baseline_${token}`);
      startPolling(baseline);
    }
  }, [isReturnFromPayment]);

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

      {/* 支付完成轮询状态 */}
      {isReturnFromPayment && (
        <div className="px-6 mb-4">
          <div className="max-w-sm mx-auto">
            {polling && (
              <div className="bg-white rounded-2xl p-4 shadow-sm text-center border border-rose-100">
                <div className="text-2xl mb-2 animate-pulse">💓</div>
                <p className="text-sm font-medium text-gray-700">正在确认到账...</p>
                <p className="text-xs text-gray-400 mt-1">预计等待 {Math.min(pollCount * 2, 60)} 秒</p>
              </div>
            )}
            {pollResult === "success" && (
              <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center">
                <div className="text-2xl mb-2">🎉</div>
                <p className="text-sm font-medium text-green-700">灵犀已到账！</p>
                <p className="text-xs text-green-500 mt-1">当前余额 {lingxiLeft} 次</p>
                <Link href={`/chat/${token}`}>
                  <button className="mt-3 w-full py-2.5 text-sm bg-green-500 text-white rounded-xl">
                    开始追问 →
                  </button>
                </Link>
              </div>
            )}
            {pollResult === "timeout" && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center">
                <div className="text-2xl mb-2">⏳</div>
                <p className="text-sm font-medium text-amber-700">到账验证超时</p>
                <p className="text-xs text-amber-500 mt-1 mb-3">
                  一般1-3分钟内到账，如超过5分钟未到账，请截图支付记录联系客服
                </p>
                <button
                  onClick={() => { setPollResult("pending"); startPolling(); }}
                  className="w-full py-2 text-xs border border-amber-300 text-amber-600 rounded-xl"
                >
                  重新检测
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 套餐选择 */}
      {!polling && pollResult !== "success" && (
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
      {!polling && pollResult !== "success" && (
        <div className="px-6 pb-4">
          <div className="max-w-sm mx-auto bg-white/70 rounded-2xl p-4 text-xs text-gray-500 space-y-1.5">
            <p className="font-medium text-gray-600 mb-2">灵犀消耗规则</p>
            <p>💬 日常咨询（合适/类型/推荐等）：消耗 <strong>1次</strong></p>
            <p>🔍 深度分析（为什么/建议/怎么办等）：消耗 <strong>2次</strong></p>
            <p>📋 特殊服务（月度复盘/关系诊断等）：消耗 <strong>5次</strong></p>
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

      {/* 支付按钮 */}
      {!polling && pollResult !== "success" && (
        <div className="px-6 pb-8">
          <div className="max-w-sm mx-auto">
            <button
              onClick={handlePay}
              disabled={isProcessing}
              className="btn-primary w-full py-4 text-base font-semibold"
            >
              {isProcessing
                ? "正在创建订单..."
                : `支付 ¥${PACKAGES.find((p) => p.id === selectedPkg)?.price ?? "--"} · 支付宝`}
            </button>
            <p className="text-center text-gray-400 text-xs mt-3">
              支付完成后自动到账 · 如有问题请联系客服
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
