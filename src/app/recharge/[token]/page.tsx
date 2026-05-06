"use client";

import { useCallback, useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import CustomerService from "@/components/CustomerService";

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
    name: "灵犀急救包",
    lingxi: 5,
    price: "5",
    original: "9.9",
    desc: "临时起意的两个疑问",
    recommended: false,
  },
  {
    id: "standard",
    emoji: "💓",
    name: "灵犀标准包",
    lingxi: 15,
    price: "15",
    original: "29.9",
    desc: "足够深度探索你的关系模式",
    recommended: true,
  },
  {
    id: "deep",
    emoji: "🌟",
    name: "灵犀深度包",
    lingxi: 50,
    price: "50",
    original: "79.9",
    desc: "含1次完整关系诊断（5次灵犀）",
    recommended: false,
  },
];

/** 支付渠道定义 */
const PAY_CHANNELS = [
  { id: "wechat", label: "微信支付", icon: "💚", src: "/wechat.jpg", activeClass: "border-green-400 bg-green-50 text-green-600" },
  { id: "alipay", label: "支付宝",   icon: "💙", src: "/alipay.png", activeClass: "border-blue-400 bg-blue-50 text-blue-600"  },
] as const;

/** 客服微信号（与 CustomerService 组件保持一致） */
const WECHAT_ID = "musinic";

/**
 * 备选渠道提示卡片 —— 扫码不成功或未到账时的兜底引导
 * 扫码区和等待区均复用此组件，避免重复代码
 */
function FallbackGuide() {
  const [copied, setCopied] = useState(false);

  function copyWechat() {
    navigator.clipboard.writeText(WECHAT_ID).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="border border-dashed border-gray-200 rounded-2xl px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-gray-500 text-center">扫码不成功或迟迟未到账？试试以下方式</p>

      {/* 客服微信 */}
      <div className="flex items-center justify-between bg-green-50 rounded-xl px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-base">💬</span>
          <div>
            <p className="text-xs text-gray-500">联系客服微信</p>
            <p className="text-sm font-bold text-gray-800 tracking-wider">{WECHAT_ID}</p>
          </div>
        </div>
        <button
          onClick={copyWechat}
          className="text-xs px-2.5 py-1 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
        >
          {copied ? "✅ 已复制" : "复制"}
        </button>
      </div>

      {/* 小红书 */}
      <div className="bg-red-50 rounded-xl px-3 py-2 text-center">
        <p className="text-sm mb-0.5">📕</p>
        <p className="text-xs font-medium text-red-600">小红书</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-tight">搜索「正缘引力」</p>
      </div>
    </div>
  );
}

/** 下载二维码图片 */
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
  /** 当前选中的支付渠道 */
  const [payChannel, setPayChannel] = useState<"wechat" | "alipay">("wechat");
  /** 用户在页面内填写的手机号 */
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  /** 正在提交收款记录 */
  const [submitting, setSubmitting] = useState(false);
  /** 充值码输入 */
  const [rechargeCode, setRechargeCode] = useState("");
  const [rechargeCodeOpen, setRechargeCodeOpen] = useState(false);
  const [rechargeCodeLoading, setRechargeCodeLoading] = useState(false);
  const [rechargeCodeResult, setRechargeCodeResult] = useState<{
    success: boolean;
    message: string;
    lingxiCount?: number;
    newBalance?: number;
  } | null>(null);

  const isDev = process.env.NODE_ENV === "development" ||
    (typeof window !== "undefined" && window.location.hostname === "localhost");

  const isReturnFromPayment = searchParams.get("status") === "success";

  const currentPkg = PACKAGES.find((p) => p.id === selectedPkg) ?? PACKAGES[1];

  const fetchLingxiLeft = useCallback(async () => {
    try {
      const res = await fetch(`/api/result?token=${token}`);
      const data = await res.json();
      if (res.ok) setLingxiLeft(data.lingxiLeft);
    } catch {
      // 静默失败
    }
  }, [token]);

  // 页面加载时获取当前余额
  useEffect(() => {
    fetchLingxiLeft();
  }, [fetchLingxiLeft]);

  /**
   * 轮询余额直到检测到灵犀增加
   * 适用于两种场景：
   *   1. 虎皮椒支付回调后的自动到账检测
   *   2. 扫码收款后等待管理员手动充值
   * 最多轮询 60 次（约 120 秒），超时后提示联系客服
   */
  const startPolling = useCallback(async (initialBalance?: number) => {
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
  }, [lingxiLeft, token]);

  // ─── 充值码兑换 ─────────────────────────────────────────────────────────
  async function handleRedeemCode() {
    const code = rechargeCode.trim();
    if (!code) return;

    setRechargeCodeLoading(true);
    setRechargeCodeResult(null);

    try {
      const res = await fetch("/api/recharge/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code }),
      });
      const data = await res.json();

      if (data.success) {
        setLingxiLeft(data.newBalance);
        setRechargeCodeResult({
          success: true,
          message: `${data.packageName} 兑换成功！+${data.lingxiCount} 次灵犀`,
          lingxiCount: data.lingxiCount,
          newBalance: data.newBalance,
        });
        setRechargeCode("");
      } else {
        setRechargeCodeResult({
          success: false,
          message: data.error ?? "兑换失败",
        });
      }
    } catch {
      setRechargeCodeResult({ success: false, message: "网络异常，请稍后重试" });
    } finally {
      setRechargeCodeLoading(false);
    }
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

  // ─── 扫码收款模式：用户确认支付（校验手机号 → 写记录 → 展示等待卡片）──────
  async function handleQrPaid() {
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      setPhoneError("请先输入正确的 11 位手机号");
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
          channel: payChannel,
          amount: currentPkg.price,
          packageName: currentPkg.name,
          packageId: currentPkg.id,
          type: "recharge",
          lingxiCount: currentPkg.lingxi,
          resultToken: token,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error("收款记录提交失败", d);
      }
    } catch (e) {
      console.error("收款记录提交异常", e);
    } finally {
      setSubmitting(false);
    }
    setQrPaid(true);
    // 不启动自动轮询；用户点「检测余额」时才触发一次查询
  }

  // ─── 手动检测余额（单次查询，供用户主动触发）─────────────────────────────
  async function checkBalance() {
    const res = await fetch(`/api/result?token=${token}`);
    const data = await res.json();
    if (res.ok) {
      setLingxiLeft(data.lingxiLeft);
      if (data.lingxiLeft > (lingxiLeft ?? 0)) {
        setPollResult("success");
      }
    }
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
  }, [isReturnFromPayment, startPolling, token]);

  /**
   * 虎皮椒正式支付的轮询结果展示（仅 PAYJS_ENABLED 时使用）
   * 扫码收款模式改用静态等待卡片，不显示此组件
   */
  const PayjsPollResult = () => {
    if (polling) {
      return (
        <div className="bg-white rounded-2xl p-5 shadow-sm text-center border border-rose-100">
          <div className="text-3xl mb-3 animate-pulse">💓</div>
          <p className="text-sm font-medium text-gray-700">正在确认到账...</p>
          <p className="text-xs text-gray-400 mt-1">预计等待 {Math.min(pollCount * 2, 60)} 秒</p>
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
            <button className="mt-4 w-full py-2.5 text-sm bg-green-500 text-white rounded-xl font-medium">开始追问 →</button>
          </Link>
        </div>
      );
    }
    if (pollResult === "timeout") {
      return (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-center">
          <div className="text-3xl mb-2">⏳</div>
          <p className="text-sm font-medium text-amber-700">未检测到到账</p>
          <p className="text-xs text-amber-600 mt-1 mb-4 leading-relaxed">
            如超过 5 分钟未到账，请截图支付记录联系客服
          </p>
          <button onClick={() => { setPollResult("pending"); startPolling(); }}
            className="w-full py-2.5 text-xs border border-amber-300 text-amber-600 rounded-xl font-medium">
            重新检测
          </button>
        </div>
      );
    }
    return null;
  };

  /**
   * 扫码收款模式的静态等待卡片
   * 不依赖自动轮询，用户可以主动点击「检测余额」触发单次查询
   * 管理员收到支付通知后，在后台按手机号充值，到账后余额自动更新
   */
  const QrWaitingCard = () => {
    if (pollResult === "success") {
      return (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <p className="text-sm font-medium text-green-700">灵犀已到账！</p>
          <p className="text-xs text-green-500 mt-1 mb-4">当前余额 {lingxiLeft} 次</p>
          <Link href={`/chat/${token}`}>
            <button className="w-full py-2.5 text-sm bg-green-500 text-white rounded-xl font-medium">
              去找缘缘追问 →
            </button>
          </Link>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-rose-100">
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">💓</div>
          <p className="text-base font-bold text-gray-800">支付已提交</p>
          <p className="text-sm text-gray-500 mt-1">
            请稍等，<strong className="text-rose-500">5 分钟内</strong>灵犀将到账
          </p>
        </div>

        {/* 订单摘要（含手机号） */}
        <div className="bg-rose-50 rounded-xl px-4 py-3 mb-4 space-y-1.5">
          {[
            { label: "手机号", value: phone || "—", cls: "font-mono" },
            { label: "套餐",   value: `${currentPkg.emoji} ${currentPkg.name}`, cls: "" },
            { label: "灵犀",   value: `💓 +${currentPkg.lingxi} 次`, cls: "text-rose-500" },
            { label: "金额",   value: `¥${currentPkg.price}`, cls: "" },
          ].map((row) => (
            <div key={row.label} className="flex justify-between items-center">
              <span className="text-gray-400 text-xs">{row.label}</span>
              <span className={`font-bold text-gray-800 text-xs ${row.cls}`}>{row.value}</span>
            </div>
          ))}
          <div className="border-t border-rose-100 pt-1.5 mt-0.5">
            <p className="text-xs text-gray-400 text-center">请截图此页面备用</p>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mb-4 leading-relaxed">
          到账后余额自动更新，可点下方按钮检测
        </p>

        <button
          onClick={checkBalance}
          className="w-full py-2.5 text-sm border border-rose-200 text-rose-500 rounded-xl font-medium hover:bg-rose-50 transition-colors"
        >
          检测是否已到账
        </button>

        {lingxiLeft !== null && (
          <p className="text-center text-xs text-gray-400 mt-2">
            当前余额：💓 {lingxiLeft} 次
          </p>
        )}

        {/* 长时间未到账的兜底引导 */}
        <div className="pt-1">
          <FallbackGuide />
        </div>
      </div>
    );
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

      {/* 充值码兑换入口 */}
      {!polling && pollResult !== "success" && !qrPaid && (
        <div className="px-6 mb-4">
          <div className="max-w-sm mx-auto">
            {!rechargeCodeOpen ? (
              <button
                onClick={() => setRechargeCodeOpen(true)}
                className="w-full text-center text-xs text-rose-400 py-2 hover:text-rose-500 transition-colors"
              >
                🎫 有充值码？点击兑换
              </button>
            ) : (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-rose-100 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-800">🎫 充值码兑换</p>
                  <button
                    onClick={() => { setRechargeCodeOpen(false); setRechargeCodeResult(null); }}
                    className="text-xs text-gray-400 hover:text-gray-500"
                  >
                    收起
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={rechargeCode}
                    onChange={(e) => setRechargeCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleRedeemCode()}
                    placeholder="输入充值码 如 LX-XXXX-XXXX"
                    className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-rose-400 transition-colors"
                  />
                  <button
                    onClick={handleRedeemCode}
                    disabled={rechargeCodeLoading || !rechargeCode.trim()}
                    className="px-4 py-2.5 bg-rose-400 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex-shrink-0 hover:bg-rose-500 transition-colors"
                  >
                    {rechargeCodeLoading ? "..." : "兑换"}
                  </button>
                </div>
                {rechargeCodeResult && (
                  <div className={`rounded-xl px-3 py-2.5 text-xs ${
                    rechargeCodeResult.success
                      ? "bg-green-50 text-green-700 border border-green-100"
                      : "bg-red-50 text-red-600 border border-red-100"
                  }`}>
                    {rechargeCodeResult.success ? "🎉 " : ""}{rechargeCodeResult.message}
                    {rechargeCodeResult.success && rechargeCodeResult.newBalance !== undefined && (
                      <span className="block mt-1 font-medium">
                        当前灵犀余额：💓 {rechargeCodeResult.newBalance} 次
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  充值码可在小红书购买，格式为 LX-开头
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 虎皮椒回调后的轮询状态 */}
      {isReturnFromPayment && (
        <div className="px-6 mb-4">
          <div className="max-w-sm mx-auto">
            <PayjsPollResult />
          </div>
        </div>
      )}

      {/* 扫码模式：用户点击「我已支付」后的静态等待卡片 */}
      {qrPaid && !PAYJS_ENABLED && (
        <div className="px-6 mb-4">
          <div className="max-w-sm mx-auto">
            <QrWaitingCard />
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
                  <div className="bg-white rounded-3xl p-5 shadow-sm border border-rose-100 space-y-4">

                    {/* 标题 + 金额 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-800">扫码支付</p>
                        <p className="text-xs text-gray-400 mt-0.5">微信 / 支付宝 均可</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-rose-500">¥{currentPkg.price}</div>
                        <div className="text-xs text-gray-300 line-through">¥{currentPkg.original}</div>
                      </div>
                    </div>

                    {/* ① 手机号输入框（最核心，放最上方） */}
                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1.5 block">
                        📱 你的手机号 <span className="text-red-500">*</span>
                        <span className="font-normal text-gray-400 ml-1">（到账确认凭证）</span>
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
                        支付备注填同一手机号，我们按此号查找账户并充值
                      </p>
                    </div>

                    {/* ② 渠道切换 */}
                    <div className="flex gap-2">
                      {PAY_CHANNELS.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setPayChannel(c.id as "wechat" | "alipay")}
                          className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-colors ${
                            payChannel === c.id
                              ? c.activeClass
                              : "border-gray-100 text-gray-400 bg-gray-50"
                          }`}
                        >
                          {c.icon} {c.label}
                        </button>
                      ))}
                    </div>

                    {/* ③ 收款码 + 下载按钮 */}
                    <div className="flex flex-col items-center">
                      <img
                        key={PAY_CHANNELS.find((c) => c.id === payChannel)!.src}
                        src={PAY_CHANNELS.find((c) => c.id === payChannel)!.src}
                        alt={PAY_CHANNELS.find((c) => c.id === payChannel)!.label + "收款码"}
                        className="w-48 h-48 object-contain rounded-2xl shadow-sm mb-2"
                      />
                      <button
                        onClick={() => downloadQR(payChannel)}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-rose-400 border border-gray-200 hover:border-rose-200 px-3 py-1.5 rounded-full transition-colors"
                      >
                        ⬇️ 保存收款码到手机
                      </button>
                    </div>

                    {/* ④ 步骤说明 */}
                    <div className="space-y-1.5">
                      {[
                        { text: `扫码支付 ¥${currentPkg.price}（${currentPkg.name}）`, warn: false },
                        { text: `备注你的手机号：${phone || "（见上方输入框）"}`, warn: true },
                        { text: "点击下方按钮，请稍等 5 分钟到账", warn: false },
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

                    {/* ⑤ 已完成按钮 */}
                    <button
                      onClick={handleQrPaid}
                      disabled={submitting}
                      className="btn-primary w-full py-3.5 text-sm font-semibold disabled:opacity-60"
                    >
                      {submitting ? "提交中..." : "我已完成扫码支付 →"}
                    </button>

                    {/* ⑥ 扫码不成功时的备选引导 */}
                    <FallbackGuide />
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

      {/* 支付成功后才显示客服入口（有成功订单记录） */}
      <CustomerService token={token} extraVisible={pollResult === "success"} />
    </main>
  );
}
