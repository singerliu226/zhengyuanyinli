"use client";

import { useState, useEffect } from "react";

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

type Tab = "stats" | "generate" | "keys" | "deliver" | "recharge";

/** 充值方式：通过手机号 | 通过 Result ID */
type RechargeMode = "phone" | "resultId";

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

  // ── 通过手机号查找用户 ────────────────────────────────────────────────
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
    { id: "generate", label: "🎫 生成激活码" },
    { id: "stats", label: "📊 概览" },
    { id: "keys", label: "🔑 激活码列表" },
    { id: "deliver", label: "🚀 自动发货" },
    { id: "recharge", label: "💰 充值" },
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
              onClick={() => { setActiveTab(tab.id); setMessage(""); }}
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
                      { value: "personal", label: "💫 个人探索版", price: "¥9.9", lingxi: "3次灵犀" },
                      { value: "couple",   label: "💕 双人同频版", price: "¥24.9", lingxi: "各8次灵犀" },
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
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📦</span>
                <h3 className="font-bold text-gray-800 text-sm">方案 A · 预生成码池（推荐）</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">
                在「生成激活码」Tab 批量生成，导出 TXT 文件后上传到以下平台，客户付款后系统自动发码：
              </p>
              <div className="space-y-2">
                {[
                  { name: "码小秘", url: "https://www.miaomiaoyun.com", desc: "支持闲鱼/小红书/微信自动发货，上传 TXT 码文件" },
                  { name: "发货宝", url: "https://www.fahuobao.com", desc: "支持淘宝/闲鱼自动发货，码池管理完善" },
                  { name: "易发货", url: "https://www.yifahu.cn", desc: "支持多平台，操作简单" },
                ].map((platform) => (
                  <div key={platform.name} className="border border-gray-100 rounded-xl p-3 flex items-start gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{platform.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{platform.desc}</div>
                    </div>
                    <a href={platform.url} target="_blank" rel="noopener noreferrer" className="text-xs text-rose-500 underline flex-shrink-0 mt-0.5">
                      访问 →
                    </a>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🔗</span>
                <h3 className="font-bold text-gray-800 text-sm">方案 B · API 实时生成（高级）</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                部署上线后，发货平台可通过以下接口实时拉取新激活码（每次调用生成一张新码）：
              </p>

              <div className="bg-gray-900 rounded-xl p-4 mb-3">
                <p className="text-xs text-green-400 font-mono mb-1">GET 请求</p>
                <p className="text-xs text-gray-300 font-mono break-all">
                  {`https://你的域名/api/deliver?secret=管理员密码&planType=personal`}
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
                ⚠️ planType 可选值：<code className="font-mono">personal</code>（个人版）·{" "}
                <code className="font-mono">couple</code>（双人版）
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-xs text-rose-700">
              💡 <strong>推荐流程</strong>：先用方案A上线销售，积累订单后再考虑接入方案B的API。
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
