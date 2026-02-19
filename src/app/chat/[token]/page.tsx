"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

type Message = {
  role: "user" | "assistant";
  content: string;
  lingxiCost?: number;
};

type InsufficientInfo = {
  lingxiLeft: number;
  lingxiCost: number;
  message: string;
};

/**
 * AI 情感追问页 v2.1
 * 变更：
 * - 情感币 → 灵犀次数，更新消耗展示
 * - 发送前显示预计消耗次数
 * - 深夜模式（23:00-06:00）：深色背景 + 温柔提示
 * - 灵犀不足：显示充能引导卡片（非简单文字报错）
 * - 双人同频模式（URL参数 coupleMode=true）：顶部标识 + 特殊提示
 */
export default function ChatPage() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const coupleMode = searchParams.get("coupleMode") === "true";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [lingxiLeft, setLingxiLeft] = useState<number | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [personalityType, setPersonalityType] = useState("");
  const [cityMatch, setCityMatch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [insufficientInfo, setInsufficientInfo] = useState<InsufficientInfo | null>(null);
  const [isNight, setIsNight] = useState(false);
  const [deepMode, setDeepMode] = useState(false);
  const [partnerHasCompleted, setPartnerHasCompleted] = useState(false);
  const [partnerPersonalityType, setPartnerPersonalityType] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 检测当前是否为深夜模式（北京时间 23:00-06:00）
    const bjHour = (new Date().getUTCHours() + 8) % 24;
    setIsNight(bjHour >= 23 || bjHour < 6);
    initChat();
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function initChat() {
    try {
      const res = await fetch(`/api/result?token=${token}`);
      const data = await res.json();

      if (!res.ok) { setError(data.error || "无法加载对话"); return; }

      setLingxiLeft(data.lingxiLeft);
      setPersonalityType(data.personalityType);
      setCityMatch(data.cityMatch);

      // 双人模式：记录伴侣完成状态（供 UI 提示用）
      if (coupleMode && data.hasPartner && data.partnerInfo) {
        setPartnerHasCompleted(true);
        setPartnerPersonalityType(data.partnerInfo.personalityType ?? "");
      }

      const isNightNow = (new Date().getUTCHours() + 8) % 24 >= 23 ||
                         (new Date().getUTCHours() + 8) % 24 < 6;

      let welcomeMsg = coupleMode
        ? `我已经读完你和 TA 的报告了。\n\n你是「${data.personalityType}」，TA 是「${data.partnerInfo?.personalityType ?? "对方"}」——两种不同的人，在同一段关系里摸索。\n\n你们最近有什么让你说不清楚的事吗？`
        : `你好，我是缘缘。\n\n我已经看完你的报告了——你是「${data.personalityType}」，一个${data.cityMatch}气质的人。\n\n有什么想聊的，直接说吧。`;

      if (isNightNow) {
        welcomeMsg = `夜深了，还没睡。\n\n我在这里——你是「${data.personalityType}」。有什么在心里转的事吗？`;
      }

      setMessages([{ role: "assistant", content: welcomeMsg }]);
    } catch {
      setError("网络异常，请刷新重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const msg = input.trim();
    if (!msg || isStreaming) return;

    setInput("");
    setError("");
    setInsufficientInfo(null);

    const userMsg: Message = { role: "user", content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const history = newMessages.slice(-10).map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: msg, history, coupleMode, deepMode }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMessages(newMessages);

        if (res.status === 402 && data.error === "lingxi_insufficient") {
          setInsufficientInfo({
            lingxiLeft: data.lingxiLeft,
            lingxiCost: data.lingxiCost,
            message: data.message,
          });
          return;
        }

        throw new Error(data.error || "请求失败");
      }

      // 读取响应头
      const lingxiCost = parseInt(res.headers.get("X-Lingxi-Cost") ?? "1");
      const lingxiRemaining = parseInt(res.headers.get("X-Lingxi-Left") ?? "0");
      // 用服务端返回的深夜状态更新 UI（防止首次加载时本地时区与服务端不一致）
      const isNightResponse = res.headers.get("X-Night-Mode") === "true";
      setIsNight(isNightResponse);

      // 读取流式响应
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: fullContent, lingxiCost };
          return updated;
        });
      }

      setLingxiLeft(lingxiRemaining);
    } catch (err) {
      setError((err as Error).message || "发送失败，请重试");
      setMessages(newMessages);
    } finally {
      setIsStreaming(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">💬</div>
          <p className="text-gray-400 text-sm">连接缘缘中...</p>
        </div>
      </main>
    );
  }

  if (error && messages.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center bg-white rounded-3xl p-8 shadow-sm max-w-sm w-full">
          <div className="text-4xl mb-4">😕</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link href={`/result/${token}`}><button className="btn-primary w-full py-3 text-sm">返回报告</button></Link>
        </div>
      </main>
    );
  }

  const bgClass = isNight ? "bg-gray-900" : "bg-gray-50";
  const headerClass = isNight ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100";
  const inputAreaClass = isNight ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100";
  const inputClass = isNight
    ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-rose-400"
    : "border-gray-200 focus:border-rose-300";

  return (
    <main className={`min-h-screen flex flex-col ${bgClass}`}>
      {/* 顶部导航 */}
      <header className={`border-b px-6 py-3 flex items-center justify-between ${headerClass}`}>
        <Link href={`/result/${token}`} className={`text-sm ${isNight ? "text-gray-400" : "text-gray-400"}`}>
          ← 报告
        </Link>
        <div className="flex items-center gap-2">
          {coupleMode && <span className="text-xs text-rose-400">💕 双人同频</span>}
          <span className={`text-sm font-semibold ${isNight ? "text-gray-200" : "text-gray-700"}`}>
            缘缘
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs bg-rose-50 text-rose-500 px-2.5 py-1 rounded-full font-medium">
            💓 {lingxiLeft ?? "?"} 次
          </span>
          {(lingxiLeft ?? 0) <= 3 && (
            <Link href={`/recharge/${token}`}>
              <span className="text-xs text-rose-400 underline">充能</span>
            </Link>
          )}
        </div>
      </header>

      {/* 双人同频：伴侣状态提示条 */}
      {coupleMode && partnerHasCompleted && (
        <div className={`px-6 py-2 text-center text-xs ${isNight ? "bg-gray-800 text-gray-400" : "bg-rose-50 text-rose-500"}`}>
          ✅ TA 已经完成了测试
          {partnerPersonalityType && (
            <span className="ml-1 font-medium">· {partnerPersonalityType}</span>
          )}
          <span className={`ml-1 ${isNight ? "text-gray-500" : "text-rose-300"}`}>· 缘缘已读取双方报告</span>
        </div>
      )}
      {coupleMode && !partnerHasCompleted && (
        <div className={`px-6 py-2 text-center text-xs ${isNight ? "bg-gray-800 text-gray-400" : "bg-amber-50 text-amber-500"}`}>
          ⏳ 等待对方完成测试后，双人同频才能发挥最大效果
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-400 to-pink-400 flex items-center justify-center text-white text-xs mr-2 flex-shrink-0 mt-1">
                缘
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-rose-400 text-white rounded-tr-sm"
                  : isNight
                    ? "bg-gray-700 text-gray-100 rounded-tl-sm shadow-sm"
                    : "bg-white text-gray-700 rounded-tl-sm shadow-sm"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.lingxiCost !== undefined && msg.lingxiCost > 0 && msg.role === "assistant" && (
                <p className={`text-xs mt-2 ${isNight ? "text-gray-500" : "text-gray-400"}`}>
                  消耗 {msg.lingxiCost} 次灵犀
                </p>
              )}
            </div>
          </div>
        ))}

        {/* 灵犀不足：交互式充能引导 */}
        {insufficientInfo && (
          <div className={`mx-4 rounded-2xl p-4 ${isNight ? "bg-gray-800 border-gray-700" : "bg-rose-50 border-rose-100"} border`}>
            <p className={`text-sm font-medium mb-1 ${isNight ? "text-gray-200" : "text-gray-700"}`}>
              💔 {insufficientInfo.message}
            </p>
            <p className={`text-xs mb-3 ${isNight ? "text-gray-400" : "text-gray-500"}`}>
              每一次灵犀，都是更懂自己的机会
            </p>
            <div className="flex gap-2">
              <Link href={`/recharge/${token}`} className="flex-1">
                <button className="w-full py-2 text-xs bg-rose-400 text-white rounded-xl font-medium">
                  ⚡ 立即充能
                </button>
              </Link>
              <button
                onClick={() => setInsufficientInfo(null)}
                className={`flex-1 py-2 text-xs rounded-xl border ${isNight ? "border-gray-600 text-gray-400" : "border-gray-200 text-gray-500"}`}
              >
                稍后再说
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2">
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 text-rose-600 text-xs text-center">
            {error}
          </div>
        </div>
      )}

      {/* 快速提问（首次对话显示） */}
      {messages.length === 1 && !coupleMode && (
        <div className="px-4 pb-2">
          <p className={`text-xs mb-2 text-center ${isNight ? "text-gray-500" : "text-gray-400"}`}>快速提问 ↓</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              "我和稳定守护型合适吗？",
              "我感情里容易出现什么问题？",
              "我的理想型在哪里能遇到？",
              "我的依恋风格是什么？",
            ].map((q) => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs whitespace-nowrap border ${
                  isNight ? "bg-gray-700 border-gray-600 text-gray-300" : "bg-white border-gray-200 text-gray-600"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
      {messages.length === 1 && coupleMode && (
        <div className="px-4 pb-2">
          <p className={`text-xs mb-2 text-center ${isNight ? "text-gray-500" : "text-gray-400"}`}>双人议题 ↓</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              "我们为什么总为同一件事吵架？",
              "我们的相处模式有什么问题？",
              "我们应该去哪个城市发展？",
              "我们各自需要怎么调整？",
            ].map((q) => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs whitespace-nowrap border ${
                  isNight ? "bg-gray-700 border-gray-600 text-gray-300" : "bg-white border-gray-200 text-gray-600"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入框 */}
      <div className={`border-t px-4 pt-2 pb-3 ${inputAreaClass}`}>
        {/* 模式切换 */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs ${isNight ? "text-gray-500" : "text-gray-400"}`}>分析模式：</span>
          <button
            onClick={() => setDeepMode(false)}
            className={`text-xs px-3 py-1 rounded-full transition-all ${
              !deepMode
                ? "bg-rose-400 text-white font-medium"
                : isNight ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"
            }`}
          >
            常规分析 · 1次
          </button>
          <button
            onClick={() => setDeepMode(true)}
            className={`text-xs px-3 py-1 rounded-full transition-all ${
              deepMode
                ? "bg-rose-400 text-white font-medium"
                : isNight ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"
            }`}
          >
            深度分析 · 2次
          </button>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={coupleMode ? "关于你们的问题，告诉缘缘..." : "有什么想问缘缘的..."}
            maxLength={500}
            rows={1}
            className={`flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm focus:outline-none max-h-24 overflow-y-auto border ${inputClass}`}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="btn-primary px-4 py-2.5 text-sm flex-shrink-0 rounded-2xl"
          >
            {isStreaming ? "..." : "发送"}
          </button>
        </div>
        <p className={`text-xs text-center mt-1 ${isNight ? "text-gray-600" : "text-gray-300"}`}>
          余额 {lingxiLeft ?? "?"} 次灵犀
        </p>
      </div>
    </main>
  );
}
