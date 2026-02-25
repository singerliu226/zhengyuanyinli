"use client";

import { useState, useEffect, useRef } from "react";

/**
 * 后台管理页 v2.3
 *
 * Tab 结构：
 *  - 生成激活码：批量生成 + 导出 TXT
 *  - 概览：数据统计
 *  - 激活码列表：查看历史批次 + 封禁
 *  - 自动发货：API 接口说明
 *  - 充值：手动补充灵犀
 *    ├── 方式一：通过手机号查找（主推，适合扫码收款场景）
 *    └── 方式二：通过 Result ID 直接充值
 */

type Stats = {
  total: number;
  activated: number;
  used: number;
  results: number;
  chatCount: number;
  paidOrders: number;
};

type Batch = {
  id: string;
  name: string;
  count: number;
  createdAt: string;
};

type CardKey = {
  code: string;
  status: string;
  planType: string;
  phone: string | null;
  activatedAt: string | null;
  usedAt: string | null;
  createdAt: string;
};

/** 手机号查找返回的用户信息 */
type PhoneUser = {
  keyCode: string;
  planType: string;
  keyStatus: string;
  activatedAt: string | null;
  resultId: string;
  personalityType: string;
  cityMatch: string;
  lingxi: number;
  resultCreatedAt: string;
};

type Tab = "stats" | "generate" | "keys" | "deliver" | "recharge" | "pending" | "rechargeCodes";

/** 充值方式：通过手机号 | 通过 Result ID */
type RechargeMode = "phone" | "resultId";

/** 充值码批次 */
type RechargeBatchType = {
  id: string;
  name: string;
  count: number;
  packageId: string;
  packageName: string;
  lingxiCount: number;
  createdAt: string;
};

/** 充值码套餐 */
type RechargePackageType = {
  id: string;
  name: string;
  lingxi: number;
  price: string;
};

/** 手动收款记录 */
type ManualRecord = {
  id: string;
  phone: string;
  channel: string;
  amount: string;
  packageName: string;
  packageId: string;
  type: string;
  lingxiCount: number | null;
  resultToken: string | null;
  status: string;
  createdAt: string;
};

/** 可选充值次数（覆盖初始值3/8，以及各充值套餐2/15/50） */
const RECHARGE_AMOUNTS = [1, 2, 3, 5, 8, 10, 15, 50];

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [keys, setKeys] = useState<CardKey[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("generate");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");

  // 生成表单
  const [genCount, setGenCount] = useState(50);
  const [genBatchName, setGenBatchName] = useState("");
  const [genPlanType, setGenPlanType] = useState("personal");
  const [generating, setGenerating] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  // 待确认收款记录
  const [manualRecords, setManualRecords] = useState<ManualRecord[]>([]);
  const [manualFilter, setManualFilter] = useState<"pending" | "confirmed" | "all">("pending");
  const [manualLoading, setManualLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const pendingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 充值 - 通用
  const [rechargeMode, setRechargeMode] = useState<RechargeMode>("phone");
  const [rechargeAmount, setRechargeAmount] = useState(3);

  // 充值 - 通过手机号
  const [rechargePhone, setRechargePhone] = useState("");
  const [phoneSearching, setPhoneSearching] = useState(false);
  const [phoneUsers, setPhoneUsers] = useState<PhoneUser[] | null>(null);
  const [selectedUser, setSelectedUser] = useState<PhoneUser | null>(null);
  const [recharging, setRecharging] = useState(false);

  // 充值 - 通过 Result ID
  const [rechargeResultId, setRechargeResultId] = useState("");

  // 充值码管理
  const [rcBatches, setRcBatches] = useState<RechargeBatchType[]>([]);
  const [rcPackages, setRcPackages] = useState<RechargePackageType[]>([]);
  const [rcGenCount, setRcGenCount] = useState(50);
  const [rcGenBatchName, setRcGenBatchName] = useState("");
  const [rcGenPackageId, setRcGenPackageId] = useState("standard");
  const [rcGenerating, setRcGenerating] = useState(false);
  const [rcGeneratedCodes, setRcGeneratedCodes] = useState<string[]>([]);
  const [rcLoading, setRcLoading] = useState(false);

  function getHeaders() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${secret}` };
  }

  function showMsg(text: string, type: "success" | "error" | "info" = "info") {
    setMessage(text);
    setMessageType(type);
  }

  // ── 登录 ──────────────────────────────────────────────────────────────
  async function login() {
    try {
      const res = await fetch("/api/admin?action=stats", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (res.status === 401) { showMsg("密码错误", "error"); return; }
      const data = await res.json();
      setStats(data.stats);
      setBatches(data.batches ?? []);
      setAuthed(true);
      setActiveTab("generate");
    } catch {
      showMsg("连接失败，请稍后重试", "error");
    }
  }

  // ── 刷新统计 ──────────────────────────────────────────────────────────
  async function refreshStats() {
    const res = await fetch("/api/admin?action=stats", { headers: { Authorization: `Bearer ${secret}` } });
    const data = await res.json();
    setStats(data.stats);
    setBatches(data.batches ?? []);
  }

  // ── 批量生成激活码 ────────────────────────────────────────────────────
  async function generateKeys() {
    if (!genBatchName.trim()) { showMsg("请输入批次名称", "error"); return; }
    setGenerating(true);
    showMsg("生成中...", "info");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          action: "generate",
          count: genCount,
          batchName: genBatchName.trim(),
          planType: genPlanType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedCodes(data.codes);
        showMsg(`✅ 成功生成 ${data.codes.length} 张激活码`, "success");
        refreshStats();
      } else {
        showMsg(`❌ ${data.error}`, "error");
      }
    } catch {
      showMsg("❌ 生成失败，请检查数据库连接", "error");
    } finally {
      setGenerating(false);
    }
  }

  // ── 查看批次激活码 ────────────────────────────────────────────────────
  async function loadKeys(batchId?: string) {
    const url = batchId ? `/api/admin?action=keys&batch=${batchId}` : "/api/admin?action=keys";
    const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
    const data = await res.json();
    setKeys(data.keys ?? []);
    setActiveTab("keys");
  }

  // ── 加载手动收款记录（silent=true 时静默刷新，不显示 loading） ──────────
  async function loadManualRecords(status: "pending" | "confirmed" | "all" = "pending", silent = false) {
    if (!silent) setManualLoading(true);
    try {
      const res = await fetch(`/api/admin?action=manualPayments&status=${status}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!res.ok) {
        if (!silent) showMsg(`加载记录失败 (${res.status})`, "error");
        return;
      }
      const data = await res.json();
      setManualRecords(data.records ?? []);
    } catch {
      if (!silent) showMsg("加载记录失败，请检查网络", "error");
    } finally {
      if (!silent) setManualLoading(false);
    }
  }

  // ── 进入「充值码」Tab 时加载批次数据 ──────────────────────────────
  useEffect(() => {
    if (!authed) return;
    if (activeTab === "rechargeCodes") {
      loadRcBatches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, authed]);

  // ── 在「待确认」Tab 时启动 15s 轮询，离开时清除 ───────────────────────
  useEffect(() => {
    if (!authed) return;
    if (activeTab === "pending") {
      // 进入 Tab 立即加载一次
      loadManualRecords(manualFilter);
      // 每 15s 静默刷新
      pendingPollRef.current = setInterval(() => {
        loadManualRecords(manualFilter, true);
      }, 15000);
    } else {
      if (pendingPollRef.current) {
        clearInterval(pendingPollRef.current);
        pendingPollRef.current = null;
      }
    }
    return () => {
      if (pendingPollRef.current) {
        clearInterval(pendingPollRef.current);
        pendingPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, authed]);

  // ── 确认收款记录（一键充值 or 标记已处理）───────────────────────
  async function confirmManual(id: string, op: "recharge" | "done") {
    setConfirmingId(id);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ action: "confirmManual", id, op }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg(`✅ ${data.message}`, "success");
        // 刷新列表
        loadManualRecords(manualFilter);
      } else {
        showMsg(`❌ ${data.error}`, "error");
      }
    } catch {
      showMsg("❌ 操作失败，请重试", "error");
    } finally {
      setConfirmingId(null);
    }
  }

  // ── 通过手机号查找用户 ──────────────────────────────────────────────────
  async function searchByPhone() {
    if (!rechargePhone.trim() || rechargePhone.trim().length < 7) {
      showMsg("请输入有效手机号", "error");
      return;
    }
    setPhoneSearching(true);
    setPhoneUsers(null);
    setSelectedUser(null);
    try {
      const res = await fetch(
        `/api/admin?action=findByPhone&phone=${encodeURIComponent(rechargePhone.trim())}`,
        { headers: { Authorization: `Bearer ${secret}` } }
      );
      const data = await res.json();
      if (!res.ok) { showMsg(`❌ ${data.error}`, "error"); return; }

      if (!data.found) {
        showMsg("未找到该手机号对应的用户，请确认手机号是否正确", "error");
        setPhoneUsers([]);
      } else {
        setPhoneUsers(data.users);
        if (data.users.length === 1) {
          setSelectedUser(data.users[0]);
          showMsg(`✅ 找到用户：${data.users[0].personalityType} · 当前灵犀 ${data.users[0].lingxi} 次`, "success");
        } else {
          showMsg(`找到 ${data.count} 条记录，请选择要充值的账户`, "info");
        }
      }
    } catch {
      showMsg("❌ 查找失败，请检查网络", "error");
    } finally {
      setPhoneSearching(false);
    }
  }

  // ── 执行充值（支持两种来源：手机号选中的用户 / 直接输入 Result ID）──
  async function doRecharge(resultId: string) {
    if (!resultId || rechargeAmount < 1) {
      showMsg("参数无效", "error");
      return;
    }
    setRecharging(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ action: "recharge", resultId, amount: rechargeAmount }),
      });
      const data = await res.json();

      if (data.success) {
        showMsg(`✅ ${data.message}（当前灵犀：${data.newBalance} 次）`, "success");
        // 刷新手机号搜索结果中的余额（让管理员看到最新值）
        if (selectedUser && selectedUser.resultId === resultId) {
          setSelectedUser({ ...selectedUser, lingxi: data.newBalance });
        }
        if (phoneUsers) {
          setPhoneUsers(phoneUsers.map((u) =>
            u.resultId === resultId ? { ...u, lingxi: data.newBalance } : u
          ));
        }
      } else {
        showMsg(`❌ ${data.error}`, "error");
      }
    } catch {
      showMsg("❌ 充值失败，请重试", "error");
    } finally {
      setRecharging(false);
    }
  }

  // ── 导出工具 ──────────────────────────────────────────────────────────
  function copyAll(codes: string[]) {
    navigator.clipboard.writeText(codes.join("\n"));
    showMsg("✅ 已复制全部激活码到剪贴板", "success");
  }

  function exportTXT(codes: string[]) {
    const blob = new Blob([codes.join("\n")], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${genBatchName || "codes"}-${Date.now()}.txt`;
    a.click();
  }

  function exportCSV(targetKeys: CardKey[]) {
    const csv = ["激活码,状态,版本,手机号,激活时间,使用时间"]
      .concat(targetKeys.map((k) =>
        [k.code, k.status, k.planType, k.phone ?? "", k.activatedAt ?? "", k.usedAt ?? ""].join(",")
      ))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keys-${Date.now()}.csv`;
    a.click();
  }

  // ── 充值码管理 ──────────────────────────────────────────────────────
  async function loadRcBatches() {
    setRcLoading(true);
    try {
      const res = await fetch("/api/admin?action=rechargeBatches", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      setRcBatches(data.batches ?? []);
      setRcPackages(data.packages ?? []);
    } catch {
      showMsg("加载充值码批次失败", "error");
    } finally {
      setRcLoading(false);
    }
  }

  async function generateRechargeCodes() {
    if (rcGenerating) return;
    if (!rcGenBatchName.trim()) {
      showMsg("请输入批次名称", "error");
      return;
    }
    setRcGenerating(true);
    setRcGeneratedCodes([]);

    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          action: "generateRechargeCodes",
          count: rcGenCount,
          batchName: rcGenBatchName.trim(),
          packageId: rcGenPackageId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRcGeneratedCodes(data.codes);
        showMsg(data.message, "success");
        loadRcBatches();
      } else {
        showMsg(data.error ?? "生成失败", "error");
      }
    } catch {
      showMsg("请求失败", "error");
    } finally {
      setRcGenerating(false);
    }
  }

  function downloadRcCodes(codes: string[], batchName: string) {
    const text = codes.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `充值码-${batchName}-${codes.length}张.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusColor: Record<string, string> = {
    unused: "text-gray-400",
    activated: "text-blue-500",
    used: "text-green-500",
    banned: "text-red-500",
  };

  const statusLabel: Record<string, string> = {
    unused: "未使用",
    activated: "已激活",
    used: "已完成",
    banned: "已封禁",
  };

  const planLabel: Record<string, string> = {
    personal: "💫 个人版",
    couple: "💕 双人版",
    gift: "🎁 礼盒版",
    partner: "伴侣虚拟",
  };

  // ── 登录页 ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
          <h1 className="text-xl font-bold text-gray-800 mb-2 text-center">🔐 正缘引力 · 后台管理</h1>
          <p className="text-xs text-gray-400 mb-6 text-center">激活码生成 · 数据统计 · 充值管理</p>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="输入管理员密码"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-rose-400 text-sm"
          />
          {message && (
            <p className={`text-sm mb-4 text-center ${messageType === "error" ? "text-red-500" : "text-gray-500"}`}>
              {message}
            </p>
          )}
          <button onClick={login} className="btn-primary w-full py-3 text-sm">
            登录
          </button>
        </div>
      </main>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "pending",       label: "💳 待确认" },
    { id: "rechargeCodes", label: "🎫 充值码" },
    { id: "generate",      label: "🔑 生成激活码" },
    { id: "stats",         label: "📊 概览" },
    { id: "keys",          label: "📋 激活码列表" },
    { id: "deliver",       label: "🚀 自动发货" },
    { id: "recharge",      label: "💰 手动充值" },
  ];

  return (
    <main className="min-h-screen bg-gray-100">
      {/* 顶部 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-800">正缘引力 · 后台管理</h1>
        {stats && (
          <span className="text-xs text-gray-400">
            已售 {stats.used} 码 · AI 追问 {stats.chatCount} 次
          </span>
        )}
      </header>

      {/* Tab 导航 */}
      <div className="bg-white border-b border-gray-100 px-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setMessage("");
              }}
              className={`px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-rose-400 text-rose-500"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mx-4 mt-3 px-4 py-3 rounded-xl text-sm ${
          messageType === "success" ? "bg-green-50 text-green-700 border border-green-100" :
          messageType === "error"   ? "bg-red-50 text-red-600 border border-red-100" :
                                     "bg-blue-50 text-blue-600 border border-blue-100"
        }`}>
          {message}
        </div>
      )}

      <div className="px-4 py-4 max-w-2xl mx-auto">

        {/* ── Tab: 待确认收款记录 ──────────────────────────────────────── */}
        {activeTab === "pending" && (
          <div className="space-y-3">
            {/* 过滤器 + 刷新 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium">显示：</span>
              {(["pending", "confirmed", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => { setManualFilter(f); loadManualRecords(f, false); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    manualFilter === f
                      ? "border-rose-400 bg-rose-50 text-rose-500"
                      : "border-gray-200 text-gray-500"
                  }`}
                >
                  {{ pending: "待处理", confirmed: "已处理", all: "全部" }[f]}
                </button>
              ))}
              <button
                onClick={() => loadManualRecords(manualFilter, false)}
                disabled={manualLoading}
                className="ml-auto text-xs text-rose-500 border border-rose-200 px-3 py-1.5 rounded-xl hover:bg-rose-50 transition-colors"
              >
                {manualLoading ? "加载中..." : "🔄 刷新"}
              </button>
            </div>

            {/* 空状态 */}
            {!manualLoading && manualRecords.length === 0 && (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <div className="text-3xl mb-2">📭</div>
                <p className="text-sm text-gray-500 font-medium">暂无{manualFilter === "pending" ? "待处理" : manualFilter === "confirmed" ? "已处理" : ""}记录</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">用户填写手机号并点击「我已完成支付」后，记录将自动出现在这里</p>
                <button
                  onClick={() => loadManualRecords(manualFilter, false)}
                  className="text-xs text-rose-400 border border-rose-200 px-4 py-2 rounded-xl hover:bg-rose-50 transition-colors"
                >
                  🔄 点击刷新
                </button>
              </div>
            )}

            {/* 加载态 */}
            {manualLoading && (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <p className="text-sm text-gray-400">加载中...</p>
              </div>
            )}

            {/* 记录列表 */}
            {manualRecords.map((rec) => {
              const isRecharge = rec.type === "recharge";
              const isPending = rec.status === "pending";
              const channelLabel = rec.channel === "wechat" ? "💚 微信" : "💙 支付宝";
              const typeLabel = isRecharge ? "灵犀充值" : "首次购买";
              const typeColor = isRecharge ? "text-purple-600 bg-purple-50" : "text-rose-600 bg-rose-50";

              return (
                <div key={rec.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${isPending ? "border-amber-100" : "border-gray-100"}`}>
                  {/* 标题行 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColor}`}>{typeLabel}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isPending ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"}`}>
                        {isPending ? "待处理" : "✓ 已处理"}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(rec.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  {/* 详情 */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
                    <div>
                      <span className="text-xs text-gray-400">手机号</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-sm font-mono font-bold text-gray-800">{rec.phone}</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(rec.phone); showMsg("✅ 手机号已复制", "success"); }}
                          className="text-xs text-gray-300 hover:text-rose-400 transition-colors"
                        >
                          复制
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">渠道</span>
                      <div className="text-sm font-medium text-gray-700 mt-0.5">{channelLabel}</div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">套餐</span>
                      <div className="text-sm font-medium text-gray-800 mt-0.5">{rec.packageName}</div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">金额</span>
                      <div className="text-sm font-bold text-rose-500 mt-0.5">¥{rec.amount}</div>
                    </div>
                    {rec.lingxiCount && (
                      <div>
                        <span className="text-xs text-gray-400">应充灵犀</span>
                        <div className="text-sm font-bold text-purple-600 mt-0.5">💓 {rec.lingxiCount} 次</div>
                      </div>
                    )}
                  </div>

                  {/* 操作按钮（仅待处理时显示） */}
                  {isPending && (
                    <div className="flex gap-2">
                      {isRecharge ? (
                        <button
                          onClick={() => confirmManual(rec.id, "recharge")}
                          disabled={confirmingId === rec.id}
                          className="flex-1 py-2.5 text-sm font-medium bg-purple-500 text-white rounded-xl disabled:opacity-50 hover:bg-purple-600 transition-colors"
                        >
                          {confirmingId === rec.id ? "充值中..." : `💓 一键充值 ${rec.lingxiCount} 次`}
                        </button>
                      ) : (
                        <button
                          onClick={() => confirmManual(rec.id, "done")}
                          disabled={confirmingId === rec.id}
                          className="flex-1 py-2.5 text-sm font-medium bg-green-500 text-white rounded-xl disabled:opacity-50 hover:bg-green-600 transition-colors"
                        >
                          {confirmingId === rec.id ? "处理中..." : "✓ 已发送激活码"}
                        </button>
                      )}
                      <button
                        onClick={() => confirmManual(rec.id, "done")}
                        disabled={confirmingId === rec.id}
                        className="px-3 py-2 text-xs text-gray-400 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                      >
                        仅标记
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* 操作说明（始终显示） */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs text-blue-700 leading-relaxed">
              💡 用户填写手机号并点击「我已完成支付」后，记录自动出现在这里。
              核对收款通知后，点击「一键充值」或「已发送激活码」即可完成处理。
              页面每 15 秒自动刷新。
            </div>
          </div>
        )}

        {/* ── Tab: 充值码管理 ──────────────────────────────────────────── */}
        {activeTab === "rechargeCodes" && (
          <div className="space-y-3">

            {/* 生成充值码表单 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4">批量生成充值码</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block font-medium">批次名称</label>
                  <input
                    value={rcGenBatchName}
                    onChange={(e) => setRcGenBatchName(e.target.value)}
                    placeholder="如：2026-02-小红书-灵犀标准包"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-rose-400"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block font-medium">充值套餐</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(rcPackages.length > 0 ? rcPackages : [
                      { id: "single", name: "灵犀急救包", lingxi: 5, price: "5" },
                      { id: "standard", name: "灵犀标准包", lingxi: 15, price: "15" },
                      { id: "deep", name: "灵犀深度包", lingxi: 50, price: "50" },
                    ]).map((pkg) => (
                      <button
                        key={pkg.id}
                        onClick={() => setRcGenPackageId(pkg.id)}
                        className={`rounded-xl p-3 text-center border-2 transition-colors ${
                          rcGenPackageId === pkg.id
                            ? "border-rose-400 bg-rose-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="text-sm font-bold text-gray-800">{pkg.name}</div>
                        <div className="text-xs text-rose-500 mt-0.5">{pkg.lingxi} 次灵犀</div>
                        <div className="text-xs text-gray-400 mt-0.5">¥{pkg.price}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block font-medium">生成数量</label>
                  <div className="flex gap-2 flex-wrap">
                    {[10, 20, 50, 100, 200].map((n) => (
                      <button
                        key={n}
                        onClick={() => setRcGenCount(n)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${
                          rcGenCount === n
                            ? "border-rose-400 bg-rose-50 text-rose-500"
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {n} 张
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={generateRechargeCodes}
                  disabled={rcGenerating || !rcGenBatchName.trim()}
                  className="w-full py-3 text-sm font-semibold bg-rose-500 text-white rounded-xl disabled:opacity-50 hover:bg-rose-600 transition-colors"
                >
                  {rcGenerating ? "生成中..." : `生成 ${rcGenCount} 张充值码`}
                </button>
              </div>
            </div>

            {/* 生成结果 */}
            {rcGeneratedCodes.length > 0 && (
              <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-green-700">生成成功：{rcGeneratedCodes.length} 张</p>
                  <button
                    onClick={() => downloadRcCodes(rcGeneratedCodes, rcGenBatchName)}
                    className="px-4 py-1.5 text-xs font-medium bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors"
                  >
                    下载 TXT
                  </button>
                </div>
                <div className="bg-white rounded-xl p-3 max-h-40 overflow-y-auto">
                  {rcGeneratedCodes.map((code) => (
                    <div key={code} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                      <span className="text-xs font-mono font-bold text-green-600">{code}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(code); showMsg("已复制", "success"); }}
                        className="text-xs text-gray-300 hover:text-rose-400"
                      >
                        复制
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 历史批次 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="text-sm font-bold text-gray-800 mb-3">历史批次</h3>
              {rcLoading && <p className="text-xs text-gray-400 text-center py-4">加载中...</p>}
              {!rcLoading && rcBatches.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">暂无充值码批次</p>
              )}
              {rcBatches.map((batch) => (
                <div key={batch.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{batch.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {batch.packageName} · {batch.lingxiCount}次/张 · {batch.count}张
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(batch.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                </div>
              ))}
            </div>

            {/* 使用说明 */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs text-blue-700 leading-relaxed space-y-1">
              <p className="font-medium">💡 充值码使用流程</p>
              <p>1. 在此页面批量生成充值码，下载 TXT 文件</p>
              <p>2. 将 TXT 上传到阿奇索（agiso.com）91卡券仓库</p>
              <p>3. 阿奇索在买家下单后自动发送充值码给买家</p>
              <p>4. 买家在报告页/充值页输入充值码，灵犀自动到账</p>
              <p className="text-blue-500 mt-2">
                也可使用 HTTP 拉取模式：GET /api/deliver?secret=xxx&type=recharge&packageId=standard
              </p>
            </div>
          </div>
        )}

      {/* ── Tab: 生成激活码 ──────────────────────────────────────────── */}
      {activeTab === "generate" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4">批量生成激活码</h3>

              <div className="space-y-4">
                {/* 批次名称 */}
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block font-medium">批次名称</label>
                  <input
                    value={genBatchName}
                    onChange={(e) => setGenBatchName(e.target.value)}
                    placeholder="如：2026-02-小红书首发批"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400"
                  />
                </div>

                {/* 版本类型 */}
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block font-medium">版本类型</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "personal", label: "💫 个人探索版", price: "¥3.9", lingxi: "3次灵犀" },
                      { value: "couple",   label: "💕 双人同频版", price: "¥10.9", lingxi: "各8次灵犀" },
                    ].map((plan) => (
                      <button
                        key={plan.value}
                        onClick={() => setGenPlanType(plan.value)}
                        className={`p-3 rounded-xl border-2 text-left transition-colors ${
                          genPlanType === plan.value
                            ? "border-rose-400 bg-rose-50"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="text-sm font-medium text-gray-800">{plan.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{plan.price} · {plan.lingxi}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 数量 */}
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block font-medium">
                    生成数量：<strong className="text-gray-800">{genCount}</strong> 张
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={500}
                    step={10}
                    value={genCount}
                    onChange={(e) => setGenCount(parseInt(e.target.value))}
                    className="w-full accent-rose-400"
                  />
                  <div className="flex justify-between text-xs text-gray-300 mt-1">
                    <span>1</span><span>100</span><span>200</span><span>500</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {[10, 50, 100, 200].map((n) => (
                      <button
                        key={n}
                        onClick={() => setGenCount(n)}
                        className={`px-3 py-1 rounded-lg text-xs border ${
                          genCount === n ? "border-rose-400 bg-rose-50 text-rose-500" : "border-gray-200 text-gray-500"
                        }`}
                      >
                        {n} 张
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={generateKeys}
                  disabled={generating}
                  className="btn-primary w-full py-3 text-sm"
                >
                  {generating ? "⏳ 生成中，请稍候..." : `生成 ${genCount} 张【${genPlanType === "personal" ? "个人版" : "双人版"}】激活码`}
                </button>
              </div>
            </div>

            {/* 生成结果 */}
            {generatedCodes.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800">
                    ✅ 已生成 {generatedCodes.length} 张激活码
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => copyAll(generatedCodes)}
                    className="py-2.5 text-sm font-medium rounded-xl bg-rose-50 text-rose-500 border border-rose-200"
                  >
                    📋 复制全部
                  </button>
                  <button
                    onClick={() => exportTXT(generatedCodes)}
                    className="py-2.5 text-sm font-medium rounded-xl bg-blue-50 text-blue-500 border border-blue-200"
                  >
                    📄 导出 TXT
                  </button>
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4 text-xs text-blue-600">
                  💡 <strong>自动发货提示</strong>：导出的 TXT 文件（一行一码）可直接上传到
                  <strong>码小秘、发货宝</strong>等平台，客户付款后系统自动发码。
                </div>

                <div className="bg-gray-50 rounded-xl p-3 max-h-48 overflow-y-auto font-mono text-xs text-gray-700 space-y-0.5">
                  {generatedCodes.map((code) => (
                    <div key={code} className="py-0.5 border-b border-gray-100 last:border-0">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: 概览 ────────────────────────────────────────────────── */}
        {activeTab === "stats" && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "激活码总量", value: stats.total, color: "text-gray-700" },
                { label: "已激活", value: stats.activated, color: "text-blue-500" },
                { label: "已完成", value: stats.used, color: "text-green-500" },
                { label: "测试结果数", value: stats.results, color: "text-purple-500" },
                { label: "AI追问次数", value: stats.chatCount, color: "text-rose-500" },
                { label: "已支付充值", value: stats.paidOrders, color: "text-amber-500" },
              ].map((item) => (
                <div key={item.label} className="bg-white rounded-xl p-4 text-center shadow-sm">
                  <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                  <div className="text-xs text-gray-400 mt-1">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-3">历史批次</h3>
              {batches.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">暂无批次，请先生成激活码</p>
              ) : (
                <div className="space-y-2">
                  {batches.map((batch) => (
                    <div key={batch.id} className="flex justify-between items-center py-2.5 border-b border-gray-100 last:border-0">
                      <div>
                        <div className="text-sm font-medium text-gray-700">{batch.name}</div>
                        <div className="text-xs text-gray-400">
                          {batch.count} 张 · {new Date(batch.createdAt).toLocaleDateString("zh-CN")}
                        </div>
                      </div>
                      <button onClick={() => loadKeys(batch.id)} className="text-xs text-rose-500 underline">
                        查看
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: 激活码列表 ──────────────────────────────────────────── */}
        {activeTab === "keys" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-2">选择批次查看激活码：</p>
              <div className="flex flex-wrap gap-2">
                {batches.map((batch) => (
                  <button
                    key={batch.id}
                    onClick={() => loadKeys(batch.id)}
                    className="px-3 py-1.5 rounded-xl text-xs border border-gray-200 text-gray-600 hover:border-rose-400 hover:text-rose-500 transition-colors"
                  >
                    {batch.name} ({batch.count}张)
                  </button>
                ))}
              </div>
            </div>

            {keys.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="flex justify-between items-center px-5 py-3 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-700">{keys.length} 条记录</span>
                  <div className="flex gap-3">
                    <button onClick={() => copyAll(keys.filter(k => k.status === "unused").map(k => k.code))} className="text-xs text-blue-500 underline">
                      复制未使用
                    </button>
                    <button onClick={() => exportCSV(keys)} className="text-xs text-rose-500 underline">
                      导出 CSV
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-400">
                        <th className="px-4 py-3 text-left font-medium">激活码</th>
                        <th className="px-4 py-3 text-left font-medium">版本</th>
                        <th className="px-4 py-3 text-left font-medium">状态</th>
                        <th className="px-4 py-3 text-left font-medium">手机号</th>
                        <th className="px-4 py-3 text-left font-medium">激活时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => (
                        <tr key={key.code} className="border-t border-gray-50">
                          <td className="px-4 py-3 font-mono text-xs">{key.code}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{planLabel[key.planType] ?? key.planType}</td>
                          <td className={`px-4 py-3 text-xs font-medium ${statusColor[key.status] ?? "text-gray-400"}`}>
                            {statusLabel[key.status] ?? key.status}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {key.phone ? key.phone.slice(0, 3) + "****" + key.phone.slice(-4) : "-"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {key.activatedAt ? new Date(key.activatedAt).toLocaleDateString("zh-CN") : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {keys.length === 0 && (
              <div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-sm shadow-sm">
                请在上方选择批次查看激活码
              </div>
            )}
          </div>
        )}

        {/* ── Tab: 自动发货 ────────────────────────────────────────────── */}
        {activeTab === "deliver" && (
          <div className="space-y-4">

            {/* 阿奇索推荐 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🛍️</span>
                <h3 className="font-bold text-gray-800 text-sm">推荐：阿奇索（agiso.com）自动发货</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                阿奇索专门支持小红书个人店铺自动发货，买家付款后通过聊天窗口/短信自动发送激活码和充值码。
              </p>
              <div className="space-y-2">
                <a
                  href="https://www.agiso.com/product/aldsXhs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border border-rose-100 rounded-xl p-3 hover:bg-rose-50 transition-colors"
                >
                  <div className="text-sm font-medium text-gray-800">阿奇索 · 小红书自动发货</div>
                  <div className="text-xs text-gray-400 mt-0.5">支持聊天窗口发码/短信发码/网页自助提取，按SKU分发</div>
                </a>
              </div>
            </div>

            {/* 对接方式说明 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📦</span>
                <h3 className="font-bold text-gray-800 text-sm">方案 A · 预生成码池（推荐新手）</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                批量生成激活码/充值码，导出 TXT，上传到阿奇索 91卡券仓库：
              </p>
              <div className="space-y-1.5 text-xs text-gray-600 leading-relaxed">
                <p>1. 在「生成激活码」Tab 批量生成 → 下载 TXT</p>
                <p>2. 在「充值码」Tab 批量生成 → 下载 TXT</p>
                <p>3. 登录阿奇索 → 91卡券仓库 → 创建卡种 → 上传 TXT</p>
                <p>4. 在自动发货后台绑定商品和卡种，按 SKU 分发</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🔗</span>
                <h3 className="font-bold text-gray-800 text-sm">方案 B · API 实时拉取（高级）</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                阿奇索支持 HTTP 拉取模式，每次订单自动调用接口实时生成新码：
              </p>

              <div className="bg-gray-900 rounded-xl p-4 mb-3 space-y-3">
                <div>
                  <p className="text-xs text-green-400 font-mono mb-1">激活码</p>
                  <p className="text-xs text-gray-300 font-mono break-all">
                    {`GET https://你的域名/api/deliver?secret=管理员密码&type=activation&planType=personal`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-purple-400 font-mono mb-1">充值码</p>
                  <p className="text-xs text-gray-300 font-mono break-all">
                    {`GET https://你的域名/api/deliver?secret=管理员密码&type=recharge&packageId=standard`}
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700 space-y-1">
                <p>激活码 planType：<code className="font-mono">personal</code>（个人版）· <code className="font-mono">couple</code>（双人版）</p>
                <p>充值码 packageId：<code className="font-mono">single</code>（5次）· <code className="font-mono">standard</code>（15次）· <code className="font-mono">deep</code>（50次）</p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-xs text-rose-700 leading-relaxed space-y-1">
              <p className="font-medium">💡 小红书 SKU 对应关系</p>
              <p>确保小红书商品的 SKU 名称与阿奇索后台的分发规则一一对应。例如：</p>
              <p>· SKU「个人探索版」→ 发激活码（planType=personal）</p>
              <p>· SKU「双人共鸣版」→ 发激活码（planType=couple）</p>
              <p>· SKU「灵犀标准包」→ 发充值码（packageId=standard）</p>
            </div>
          </div>
        )}

        {/* ── Tab: 充值 ────────────────────────────────────────────────── */}
        {activeTab === "recharge" && (
          <div className="space-y-4">

            {/* 说明 */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-xs text-blue-700">
              💡 <strong>使用场景</strong>：用户通过扫码支付后，在支付备注中留下手机号。
              收到付款通知后，用手机号查找用户并补充灵犀次数。
            </div>

            {/* 充值方式切换 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4">手动补充灵犀</h3>

              {/* 方式切换 Tab */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
                {([
                  { mode: "phone" as RechargeMode, label: "📱 通过手机号查找" },
                  { mode: "resultId" as RechargeMode, label: "🔍 通过 Result ID" },
                ] as { mode: RechargeMode; label: string }[]).map((item) => (
                  <button
                    key={item.mode}
                    onClick={() => {
                      setRechargeMode(item.mode);
                      setMessage("");
                      setPhoneUsers(null);
                      setSelectedUser(null);
                    }}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                      rechargeMode === item.mode
                        ? "bg-white text-rose-500 shadow-sm"
                        : "text-gray-500"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* ── 方式一：通过手机号 ── */}
              {rechargeMode === "phone" && (
                <div className="space-y-4">
                  {/* 手机号输入 + 查找 */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block font-medium">用户手机号（支付备注中的号码）</label>
                    <div className="flex gap-2">
                      <input
                        value={rechargePhone}
                        onChange={(e) => setRechargePhone(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && searchByPhone()}
                        placeholder="输入11位手机号"
                        maxLength={11}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400"
                      />
                      <button
                        onClick={searchByPhone}
                        disabled={phoneSearching}
                        className="px-4 py-2.5 bg-rose-400 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex-shrink-0"
                      >
                        {phoneSearching ? "查找中..." : "查找"}
                      </button>
                    </div>
                  </div>

                  {/* 搜索结果：未找到 */}
                  {phoneUsers !== null && phoneUsers.length === 0 && (
                    <div className="bg-gray-50 rounded-xl p-4 text-center text-sm text-gray-400">
                      未找到该手机号对应的用户
                    </div>
                  )}

                  {/* 搜索结果：找到多个，让管理员选择 */}
                  {phoneUsers !== null && phoneUsers.length > 1 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">找到 {phoneUsers.length} 个账户，请选择要充值的：</p>
                      <div className="space-y-2">
                        {phoneUsers.map((user) => (
                          <button
                            key={user.resultId}
                            onClick={() => setSelectedUser(user)}
                            className={`w-full text-left p-3 rounded-xl border-2 transition-colors ${
                              selectedUser?.resultId === user.resultId
                                ? "border-rose-400 bg-rose-50"
                                : "border-gray-100 bg-gray-50 hover:border-gray-200"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-sm font-medium text-gray-700">{planLabel[user.planType] ?? user.planType}</span>
                                <span className="text-xs text-gray-400 ml-2">{user.personalityType}</span>
                              </div>
                              <span className="text-rose-500 font-bold text-sm">💓 {user.lingxi} 次</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              激活于 {user.activatedAt ? new Date(user.activatedAt).toLocaleDateString("zh-CN") : "-"}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 已选中的用户信息卡 */}
                  {selectedUser && (
                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-800">已选中用户</span>
                        <button
                          onClick={() => { setSelectedUser(null); setPhoneUsers(null); setRechargePhone(""); }}
                          className="text-xs text-gray-400 underline"
                        >
                          重新查找
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div>版本：<strong>{planLabel[selectedUser.planType] ?? selectedUser.planType}</strong></div>
                        <div>人格：<strong>{selectedUser.personalityType}</strong></div>
                        <div>城市匹配：<strong>{selectedUser.cityMatch}</strong></div>
                        <div>当前灵犀：<strong className="text-rose-500">💓 {selectedUser.lingxi} 次</strong></div>
                      </div>
                      <div className="text-xs text-gray-400 mt-2 font-mono break-all">
                        ID: {selectedUser.resultId}
                      </div>
                    </div>
                  )}

                  {/* 充值次数选择（找到用户后显示） */}
                  {selectedUser && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block font-medium">
                        补充灵犀次数：<strong className="text-gray-800">{rechargeAmount} 次</strong>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {RECHARGE_AMOUNTS.map((n) => (
                          <button
                            key={n}
                            onClick={() => setRechargeAmount(n)}
                            className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
                              rechargeAmount === n
                                ? "border-rose-400 bg-rose-50 text-rose-500 font-medium"
                                : "border-gray-200 text-gray-500"
                            }`}
                          >
                            {n} 次
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedUser && (
                    <button
                      onClick={() => doRecharge(selectedUser.resultId)}
                      disabled={recharging}
                      className="btn-primary w-full py-3 text-sm"
                    >
                      {recharging ? "充值中..." : `确认补充 ${rechargeAmount} 次灵犀`}
                    </button>
                  )}
                </div>
              )}

              {/* ── 方式二：通过 Result ID ── */}
              {rechargeMode === "resultId" && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Result ID 可从报告页 URL 的 token 前缀部分获取，或让用户截图提供。
                  </p>

                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block font-medium">用户 Result ID</label>
                    <input
                      value={rechargeResultId}
                      onChange={(e) => setRechargeResultId(e.target.value)}
                      placeholder="从数据库或用户提供"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block font-medium">
                      补充灵犀次数：<strong className="text-gray-800">{rechargeAmount} 次</strong>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {RECHARGE_AMOUNTS.map((n) => (
                        <button
                          key={n}
                          onClick={() => setRechargeAmount(n)}
                          className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
                            rechargeAmount === n
                              ? "border-rose-400 bg-rose-50 text-rose-500 font-medium"
                              : "border-gray-200 text-gray-500"
                          }`}
                        >
                          {n} 次
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => doRecharge(rechargeResultId.trim())}
                    disabled={recharging || !rechargeResultId.trim()}
                    className="btn-primary w-full py-3 text-sm disabled:opacity-50"
                  >
                    {recharging ? "充值中..." : `确认补充 ${rechargeAmount} 次灵犀`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
