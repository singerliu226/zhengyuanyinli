"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import CustomerService from "@/components/CustomerService";

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
 * AI 情感追问页 v2.2
 * 变更：
 * - 情感币 → 灵犀次数，更新消耗展示
 * - 发送前显示预计消耗次数
 * - 深夜模式（23:00-06:00）：深色背景 + 温柔提示
 * - 灵犀不足：显示充能引导卡片（非简单文字报错）
 * - 双人同频模式（URL参数 coupleMode=true）：顶部标识 + 特殊提示
 * - 预设快速提问按 personalityType 动态渲染（8种人格各4题）
 * - 移除气泡内"消耗 X 次灵犀"，灵犀余额仅在 header 静默更新
 */

/**
 * 8种恋爱人格的专属快速提问
 * 根据用户 personalityType 动态渲染，让第一眼就觉得"这说的是我"
 */
const QUICK_QUESTIONS: Record<string, string[]> = {
  "都市燃料型": [
    "为什么我恋爱总感觉有点累？",
    "我这种节奏，适合什么类型的伴侣？",
    "我会不会因为太独立让对方觉得不被需要？",
    "我在感情里什么时候最容易不安？",
  ],
  "精致理智型": [
    "我是不是在感情里太理性，反而让对方觉得冷？",
    "我的完美主义在感情里是优势还是障碍？",
    "什么样的人能真正让我心动？",
    "我是不是很难接受不符合预期的伴侣？",
  ],
  "烟火温柔型": [
    "我感情里容易过度付出吗？",
    "我这种性格最容易被什么样的人吸引？",
    "我在感情里最需要的安全感是什么样的？",
    "我怎么判断一段感情值不值得继续？",
  ],
  "文艺孤独型": [
    "我为什么感情里总有点距离感？",
    "我是不是很难找到真正懂我的人？",
    "我的理想关系是什么样的？",
    "我适合主动迈出第一步吗？",
  ],
  "自由探索型": [
    "我是不是骨子里有点害怕稳定的关系？",
    "我的自由感和感情稳定感能共存吗？",
    "什么样的伴侣不会让我觉得窒息？",
    "我怎么知道自己是真的爱一个人？",
  ],
  "稳定守护型": [
    "我的稳定是对方的安心，还是对方眼里的沉闷？",
    "我感情里是不是付出多、表达少？",
    "我怎么判断对方是否真的珍惜我？",
    "我容易找到和我频率一致的人吗？",
  ],
  "社交蝴蝶型": [
    "我太受欢迎了，会不会让对方没有安全感？",
    "我是不是有点依赖对方给我的关注和回应？",
    "什么样的感情模式最适合我？",
    "我怎么区分喜欢一个人和喜欢被喜欢？",
  ],
  "内核超强型": [
    "我自我很强，感情里容易出现什么问题？",
    "我是不是对伴侣有很高的精神层面要求？",
    "我能放下自我、真正融入一段关系吗？",
    "什么样的人才能真正进入我的世界？",
  ],
};

/** 兜底预设问题（人格未知时使用） */
const DEFAULT_QUICK_QUESTIONS = [
  "我感情里容易出现什么问题？",
  "我适合什么类型的伴侣？",
  "我的理想关系是什么样的？",
  "我在感情里最需要什么？",
];
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
  const [diagnosisMode, setDiagnosisMode] = useState(false);
  const [showDiagnosisForm, setShowDiagnosisForm] = useState(false);
  const [diagDuration, setDiagDuration] = useState("");
  const [diagIssue, setDiagIssue] = useState("");
  const [diagDesc, setDiagDesc] = useState("");
  const [partnerHasCompleted, setPartnerHasCompleted] = useState(false);
  const [partnerPersonalityType, setPartnerPersonalityType] = useState("");
  const [hasSentMessage, setHasSentMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const initChat = useCallback(async () => {
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

      const historyRes = await fetch(`/api/chat?token=${token}&coupleMode=${coupleMode}`);
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        if (Array.isArray(historyData.messages) && historyData.messages.length > 0) {
          setMessages(historyData.messages as Message[]);
          setHasSentMessage(historyData.messages.some((m: Message) => m.role === "user"));
          return;
        }
      }

      const isNightNow = (new Date().getUTCHours() + 8) % 24 >= 23 ||
                         (new Date().getUTCHours() + 8) % 24 < 6;

      let welcomeMsg = coupleMode
        ? `我已经读完你和 TA 的报告了。\n\n你是「${data.personalityType}」，TA 是「${data.partnerInfo?.personalityType ?? "对方"}」。我会尽量站在你们中间，把说不清楚的地方讲明白。\n\n最近你们卡在哪件事上？`
        : `你好，我是缘缘。\n\n我看完你的报告了——你是「${data.personalityType}」，带着一点${data.cityMatch}的气质。\n\n你可以直接说最近困扰你的事，我会顺着你的真实情况聊。`;

      if (isNightNow) {
        welcomeMsg = `夜深了，还没睡。\n\n我在这里——你是「${data.personalityType}」。有什么在心里转的事吗？`;
      }

      setMessages([{ role: "assistant", content: welcomeMsg }]);
    } catch {
      setError("网络异常，请刷新重试");
    } finally {
      setLoading(false);
    }
  }, [coupleMode, token]);

  useEffect(() => {
    // 检测当前是否为深夜模式（北京时间 23:00-06:00）
    const bjHour = (new Date().getUTCHours() + 8) % 24;
    setIsNight(bjHour >= 23 || bjHour < 6);
    initChat();
  }, [initChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** 提交关系诊断表单，构造诊断请求消息 */
  function handleDiagnosisSubmit() {
    if (!diagDuration || !diagIssue || !diagDesc.trim()) return;
    const msg = `【关系诊断请求】
在一起时长：${diagDuration}
主要困扰：${diagIssue}
当前状态：${diagDesc.trim()}

请基于我的人格测试数据${partnerHasCompleted ? "和对方的报告" : ""}，对这段关系做一次完整的诊断：分析问题的根源，指出关键矛盾点，给出一个最核心的改善方向。`;

    setDiagnosisMode(true);
    setShowDiagnosisForm(false);
    setInput(msg);
    // 延迟一帧让 input 更新后再触发发送
    setTimeout(() => {
      handleSendWithMessage(msg, true);
    }, 50);
  }

  async function handleSend() {
    const msg = input.trim();
    if (!msg || isStreaming) return;
    await handleSendWithMessage(msg, diagnosisMode);
    setDiagnosisMode(false);
  }

  async function handleSendWithMessage(msg: string, isDiagnosis: boolean) {
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
      // history 只传当前消息之前的对话记录；当前用户消息通过 message 字段单独发送，
      // 避免 API 层在 history + message 中重复出现同一条用户消息
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: msg, history, coupleMode, deepMode: isDiagnosis ? false : deepMode, diagnosisMode: isDiagnosis }),
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

        // 503 = AI 服务问题，使用服务端返回的具体信息（便于诊断）
        if (res.status === 503) {
          throw new Error(data.error || "AI 服务暂时繁忙，请稍等1分钟再试～");
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
      // 第一条消息发送成功后，立即解锁客服按钮
      if (!hasSentMessage) setHasSentMessage(true);
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
              <p className={`whitespace-pre-wrap ${msg.content ? "" : "cursor-blink text-gray-400"}`}>
                {msg.content || (isStreaming && i === messages.length - 1 ? "缘缘正在想" : "")}
              </p>
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

      {/* 快速提问（首次对话显示，按人格类型动态渲染） */}
      {messages.length === 1 && !coupleMode && (
        <div className="px-4 pb-2">
          <p className={`text-xs mb-2 text-center ${isNight ? "text-gray-500" : "text-gray-400"}`}>快速提问 ↓</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(QUICK_QUESTIONS[personalityType] ?? DEFAULT_QUICK_QUESTIONS).map((q) => (
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

      {/* 关系诊断入口 */}
      {!showDiagnosisForm && (
        <div className="px-4 pb-2">
          <button
            onClick={() => setShowDiagnosisForm(true)}
            className={`w-full text-left rounded-2xl px-4 py-3 text-xs border transition-all ${
              isNight
                ? "bg-gray-800 border-gray-600 text-gray-300"
                : "bg-white border-rose-100 text-gray-600 hover:border-rose-200"
            }`}
          >
            <span className="font-medium text-rose-500">🔍 关系诊断</span>
            <span className={`ml-2 ${isNight ? "text-gray-500" : "text-gray-400"}`}>
              · 5次灵犀 · 描述你们的情况，缘缘给出全面分析
            </span>
          </button>
        </div>
      )}

      {/* 关系诊断表单 */}
      {showDiagnosisForm && (
        <div className={`mx-4 mb-3 rounded-2xl p-4 border ${
          isNight ? "bg-gray-800 border-gray-600" : "bg-white border-rose-100 shadow-sm"
        }`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-sm font-semibold ${isNight ? "text-gray-200" : "text-gray-700"}`}>
              🔍 关系诊断
            </span>
            <button
              onClick={() => setShowDiagnosisForm(false)}
              className={`text-xs ${isNight ? "text-gray-500" : "text-gray-400"}`}
            >
              收起
            </button>
          </div>

          {/* Q1: 时长 */}
          <div className="mb-3">
            <p className={`text-xs mb-1.5 ${isNight ? "text-gray-400" : "text-gray-500"}`}>在一起多久了？</p>
            <div className="flex flex-wrap gap-1.5">
              {["不到1个月", "1-6个月", "6个月-1年", "1-3年", "3年以上"].map((d) => (
                <button
                  key={d}
                  onClick={() => setDiagDuration(d)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    diagDuration === d
                      ? "bg-rose-400 text-white border-rose-400"
                      : isNight ? "bg-gray-700 text-gray-400 border-gray-600" : "bg-gray-50 text-gray-500 border-gray-200"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Q2: 主要困扰 */}
          <div className="mb-3">
            <p className={`text-xs mb-1.5 ${isNight ? "text-gray-400" : "text-gray-500"}`}>最让你困扰的是？</p>
            <div className="flex flex-wrap gap-1.5">
              {["沟通不顺", "冷战/冷漠", "信任危机", "情感距离感", "价值观分歧", "控制与自由"].map((issue) => (
                <button
                  key={issue}
                  onClick={() => setDiagIssue(issue)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    diagIssue === issue
                      ? "bg-rose-400 text-white border-rose-400"
                      : isNight ? "bg-gray-700 text-gray-400 border-gray-600" : "bg-gray-50 text-gray-500 border-gray-200"
                  }`}
                >
                  {issue}
                </button>
              ))}
            </div>
          </div>

          {/* Q3: 自由描述 */}
          <div className="mb-3">
            <p className={`text-xs mb-1.5 ${isNight ? "text-gray-400" : "text-gray-500"}`}>用一两句话描述现在的状态</p>
            <textarea
              value={diagDesc}
              onChange={(e) => setDiagDesc(e.target.value)}
              placeholder="比如：我们最近总为同一件事反复争，我说完他沉默，感觉话说不进去..."
              rows={2}
              maxLength={200}
              className={`w-full resize-none rounded-xl px-3 py-2 text-xs focus:outline-none border ${
                isNight
                  ? "bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500"
                  : "border-gray-200 text-gray-700 placeholder-gray-400"
              }`}
            />
          </div>

          <button
            onClick={handleDiagnosisSubmit}
            disabled={!diagDuration || !diagIssue || !diagDesc.trim() || isStreaming}
            className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
              diagDuration && diagIssue && diagDesc.trim()
                ? "bg-rose-400 text-white"
                : isNight ? "bg-gray-700 text-gray-500" : "bg-gray-100 text-gray-400"
            }`}
          >
            提交诊断（消耗 5 次灵犀）
          </button>
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

      {/* 客服入口：发过消息后实时出现，或之前有过历史对话/充值 */}
      {/* bottom-32 避免遮挡底部输入框（输入框约 64px + 安全区） */}
      <CustomerService
        token={token}
        extraVisible={hasSentMessage}
        buttonClassName="fixed bottom-32 left-4 z-40 flex items-center gap-1.5 bg-white border border-gray-200 shadow-md rounded-full px-3 py-2 text-xs text-gray-500 hover:shadow-lg transition-shadow"
      />
    </main>
  );
}
