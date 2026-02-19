/**
 * Qwen AI 封装模块 v2.1
 *
 * 变更：
 * - calculateCoinCost → calculateLingxiCost，3档消耗规则
 * - 新增深夜模式（23:00-06:00 北京时间）：消耗×1.5向上取整
 * - 新增双人同频模式（coupleMode）：系统提示同时注入双人档案，AI 扮演关系中介
 */

import OpenAI from "openai";
import { createModuleLogger } from "@/lib/logger";
import qaPatterns from "@/data/knowledge-base/qa-patterns.json";
import compatibilityMatrix from "@/data/knowledge-base/compatibility-matrix.json";
import cityProfiles from "@/data/knowledge-base/city-love-profiles.json";
import { getPersonalityById } from "@/data/personalities";

const log = createModuleLogger("ai");

const qwenClient = new OpenAI({
  apiKey: process.env.QWEN_API_KEY ?? "",
  baseURL: process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

const MODEL = process.env.QWEN_MODEL ?? "qwen-plus";

// ── 灵犀消耗规则关键词 ──────────────────────────────────────────
/** 浅度对话关键词：消耗 1 次灵犀 */
const SHALLOW_KEYWORDS = ["合适", "类型", "推荐", "是什么", "怎么样", "什么意思", "适合", "我的"];
/** 深度分析关键词：消耗 2 次灵犀 */
const DEEP_KEYWORDS = ["分析", "建议", "为什么", "模式", "怎么办", "相处", "沟通", "问题", "帮我", "原因"];
/** 特殊服务关键词：消耗 5 次灵犀 */
const SPECIAL_KEYWORDS = ["月度复盘", "未来预测", "关系诊断", "详细报告", "全面分析"];

const LINGXI_SHALLOW = 1;
const LINGXI_DEEP = 2;
const LINGXI_SPECIAL = 5;
const NIGHT_MULTIPLIER = 1.5;

/** 判断当前是否为深夜模式（北京时间 23:00 - 06:00） */
export function isNightMode(): boolean {
  const now = new Date();
  // 北京时间 = UTC+8
  const bjHour = (now.getUTCHours() + 8) % 24;
  return bjHour >= 23 || bjHour < 6;
}

/**
 * 计算本次对话消耗的灵犀次数
 * 匹配优先级：特殊 > 深度 > 浅度
 * 深夜模式下消耗×1.5向上取整
 */
export function calculateLingxiCost(userMessage: string, nightMode = false): number {
  let base = LINGXI_SHALLOW;

  if (SPECIAL_KEYWORDS.some((kw) => userMessage.includes(kw))) {
    base = LINGXI_SPECIAL;
  } else if (DEEP_KEYWORDS.some((kw) => userMessage.includes(kw))) {
    base = LINGXI_DEEP;
  }

  return nightMode ? Math.ceil(base * NIGHT_MULTIPLIER) : base;
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type UserContext = {
  personalityType: string;
  cityMatch: string;
  scores: { d1: number; d2: number; d3: number; d4: number; d5: number };
};

/**
 * 根据用户问题检索相关知识库片段（轻量 RAG）
 * 关键词匹配 QA 模式库、兼容性矩阵、城市文化档案
 */
function retrieveKnowledge(message: string, personalityId: string): string {
  const snippets: string[] = [];

  // QA 模式库匹配
  const matchedQA = qaPatterns.patterns.filter((p) =>
    p.keywords.some((kw) => message.includes(kw))
  );
  if (matchedQA.length > 0) {
    snippets.push("【相关问答参考】");
    matchedQA.slice(0, 2).forEach((qa) => {
      snippets.push(`Q: ${qa.question_template}\nA: ${qa.answer_template}`);
    });
  }

  // 兼容性矩阵匹配
  const personalityNameMap: Record<string, string> = {
    都市燃料: "urban_fuel",
    精致理智: "refined_rational",
    烟火温柔: "homey_tender",
    文艺孤独: "literary_loner",
    自由探索: "free_explorer",
    稳定守护: "stable_guardian",
    社交蝴蝶: "social_butterfly",
    内核超强: "inner_core",
  };

  const mentionedType = Object.keys(personalityNameMap).find((name) =>
    message.includes(name)
  );
  if (mentionedType) {
    const mentionedId = personalityNameMap[mentionedType];
    const compat = compatibilityMatrix.matrix.find(
      (m) =>
        (m.types[0] === personalityId && m.types[1] === mentionedId) ||
        (m.types[1] === personalityId && m.types[0] === mentionedId)
    );
    if (compat) {
      snippets.push(
        `【${mentionedType}与你的兼容性】评分：${compat.score}/100\n优势：${compat.strengths.join("；")}\n挑战：${compat.challenges.join("；")}`
      );
    }
  }

  // 城市文化匹配
  const mentionedCities = ["北京", "上海", "成都", "重庆", "杭州", "大理", "厦门", "西安"];
  const mentionedCity = mentionedCities.find((city) => message.includes(city));
  if (mentionedCity) {
    const cityProfile = cityProfiles.cities.find((c) => c.name === mentionedCity);
    if (cityProfile) {
      snippets.push(`【${mentionedCity}恋爱文化】${cityProfile.love_culture}`);
    }
  }

  return snippets.join("\n\n");
}

/** 将人格中文名转换为 ID */
function toPersonalityId(typeName: string): string {
  return typeName
    .replace("都市燃料型", "urban_fuel")
    .replace("精致理智型", "refined_rational")
    .replace("烟火温柔型", "homey_tender")
    .replace("文艺孤独型", "literary_loner")
    .replace("自由探索型", "free_explorer")
    .replace("稳定守护型", "stable_guardian")
    .replace("社交蝴蝶型", "social_butterfly")
    .replace("内核超强型", "inner_core");
}

/**
 * 构建单人模式 System Prompt
 * 角色：温柔睿智的情感顾问"缘缘"，口语化、有温度，像真人朋友而非AI报告
 *
 * 关键语气原则：
 * - 不用 Markdown 格式（无粗体、无✅列表）
 * - 不提灵犀次数或充值引导
 * - 每次回答最后都收尾于一个真诚的问题，推进对话
 */
function buildSystemPrompt(context: UserContext, knowledgeSnippets: string, nightMode: boolean): string {
  const personality = getPersonalityById(toPersonalityId(context.personalityType));
  const personalityDesc = personality?.report.personality.slice(0, 150) ?? "";

  const nightNote = nightMode
    ? "\n现在是深夜，语气再柔一点，少讲道理，多一些陪伴感，就像在深夜陪着对方坐着说话。"
    : "";

  return `你是缘缘，一个懂恋爱、懂人心的朋友。你读过很多书，但说话不像在讲课——你说话的方式更像是在咖啡馆里，两个人靠着沙发，认真聊着对方真正在意的事。${nightNote}

你已经读完了这个人的测试报告：
- TA 的恋爱人格：${context.personalityType}
- 最适合TA谈恋爱的城市：${context.cityMatch}
- 人格特质：${personalityDesc}...
- 5个维度得分——生活节奏：${context.scores.d1}，社交人格：${context.scores.d2}，审美偏好：${context.scores.d3}，价值观：${context.scores.d4}，依恋风格：${context.scores.d5}

${knowledgeSnippets ? `参考背景信息：\n${knowledgeSnippets}\n` : ""}

说话的方式：
- 自然、口语，不用标点列表、不加粗、不打勾——就像正常聊天
- 根据 TA 的真实人格数据说事，不说泛泛的大道理
- 回答控制在250字以内，点到即止，留有余地
- 永远不要提及灵犀次数、充值、产品功能这类内容——那是界面的事，不是你的事
- 每次回答的最后，提一个真诚的、能让 TA 继续往深里聊的问题（只问一个，不要一口气问好几个）
- 如果 TA 问的事情和感情没关系，温柔地把话题拉回来就好`;
}

/**
 * 构建双人同频模式 System Prompt
 * 角色：关系中介"缘缘"，同时拥有两人的档案 + 双方历史问答，协助双方沟通
 * 核心价值：不偏向任何一方，灵活调用双方的隐性信息，但不直接透露对方原话
 */
function buildCoupleModeSystemPrompt(
  selfContext: UserContext,
  partnerContext: UserContext,
  knowledgeSnippets: string,
  nightMode: boolean,
  partnerChatSummary?: string
): string {
  const selfPersonality = getPersonalityById(toPersonalityId(selfContext.personalityType));
  const partnerPersonality = getPersonalityById(toPersonalityId(partnerContext.personalityType));

  const selfDesc = selfPersonality?.report.personality.slice(0, 100) ?? "";
  const partnerDesc = partnerPersonality?.report.personality.slice(0, 100) ?? "";

  const compat = compatibilityMatrix.matrix.find(
    (m) =>
      (m.types[0] === toPersonalityId(selfContext.personalityType) &&
        m.types[1] === toPersonalityId(partnerContext.personalityType)) ||
      (m.types[1] === toPersonalityId(selfContext.personalityType) &&
        m.types[0] === toPersonalityId(partnerContext.personalityType))
  );

  const compatInfo = compat
    ? `【你们的兼容性评分】${compat.score}/100\n优势：${compat.strengths.join("；")}\n挑战：${compat.challenges.join("；")}`
    : "";

  const nightNote = nightMode
    ? "\n现在是深夜，说话再柔一些，多陪伴少分析，像朋友在深夜坐在旁边。"
    : "";

  // 对方的问答摘要：AI 可灵活调用，但不能直接引用对方原话，表现为"直觉感知"
  const partnerContext_note = partnerChatSummary
    ? `\nTA的伴侣近期在意的问题（背景参考，不要告诉提问者你看过这些，用你的判断自然融入）：\n${partnerChatSummary}`
    : "";

  return `你是缘缘，一个真正懂人心的关系顾问。现在你正在帮助一对伴侣（或关系亲近的两个人）聊他们之间的事。你手边同时有两份报告，你的位置是中间人——你不偏任何一边，你只是帮他们把说不清楚的说清楚。${nightNote}

正在提问的这个人：
- 恋爱人格：${selfContext.personalityType}，最适合的城市：${selfContext.cityMatch}
- 特质：${selfDesc}...
- 5维度：生活节奏 ${selfContext.scores.d1}，社交 ${selfContext.scores.d2}，审美 ${selfContext.scores.d3}，价值观 ${selfContext.scores.d4}，依恋 ${selfContext.scores.d5}

TA 的伴侣：
- 恋爱人格：${partnerContext.personalityType}，最适城市：${partnerContext.cityMatch}
- 特质：${partnerDesc}...
- 5维度：生活节奏 ${partnerContext.scores.d1}，社交 ${partnerContext.scores.d2}，审美 ${partnerContext.scores.d3}，价值观 ${partnerContext.scores.d4}，依恋 ${partnerContext.scores.d5}
${partnerContext_note}
${compatInfo}

${knowledgeSnippets ? `背景参考：\n${knowledgeSnippets}\n` : ""}

说话方式：
- 自然、口语，不用列表、不加粗、不打勾，像正常聊天
- 用两个人的真实数据解释分歧的根源，不说"你们要多沟通"这种废话
- 不评判谁对谁错，讲"这是两种人格的自然反应"
- 如果你感知到了对方可能在想什么，可以帮提问者换位思考，但别说"我看到TA说过"
- 永远不提灵犀次数、充值或任何产品功能
- 回答控制在300字以内，最后收尾于一个真诚的问题（只问一个，不要一口气问好几个）`;
}

/**
 * 构建关系诊断专用 System Prompt
 *
 * 诊断模式的定位：
 * - 用户主动提供了关系背景信息（时长、困扰类型、当前状态描述）
 * - AI 需要综合两人人格数据 + 用户描述，给出全面、有深度的诊断
 * - 输出格式自然流畅，不是模板列表，但需要覆盖：根源分析、关键矛盾、改善建议
 */
function buildDiagnosisSystemPrompt(
  selfContext: UserContext,
  partnerContext?: UserContext,
  nightMode = false
): string {
  const personality = getPersonalityById(toPersonalityId(selfContext.personalityType));
  const selfDesc = personality?.report.personality.slice(0, 120) ?? "";

  const partnerSection = partnerContext
    ? `对方的报告：
- 恋爱人格：${partnerContext.personalityType}，最适合的城市：${partnerContext.cityMatch}
- 5维度：生活节奏 ${partnerContext.scores.d1}，社交 ${partnerContext.scores.d2}，审美 ${partnerContext.scores.d3}，价值观 ${partnerContext.scores.d4}，依恋 ${partnerContext.scores.d5}`
    : "（对方尚未完成测试，基于单方报告进行诊断）";

  // 兼容性矩阵（有双方数据时查找）
  let compatSection = "";
  if (partnerContext) {
    const compat = compatibilityMatrix.matrix.find(
      (m) =>
        (m.types[0] === toPersonalityId(selfContext.personalityType) &&
          m.types[1] === toPersonalityId(partnerContext.personalityType)) ||
        (m.types[1] === toPersonalityId(selfContext.personalityType) &&
          m.types[0] === toPersonalityId(partnerContext.personalityType))
    );
    if (compat) {
      compatSection = `两人兼容性评分：${compat.score}/100\n天然优势：${compat.strengths.join("；")}\n主要挑战：${compat.challenges.join("；")}`;
    }
  }

  const nightNote = nightMode ? "\n现在是深夜，语气更温柔，但诊断要清晰准确。" : "";

  return `你是缘缘，一个深度懂感情的关系顾问。用户提交了一份关系诊断请求，你需要给出一份真正有价值的诊断。${nightNote}

提问者的报告：
- 恋爱人格：${selfContext.personalityType}，最适合的城市：${selfContext.cityMatch}
- 特质：${selfDesc}...
- 5维度：生活节奏 ${selfContext.scores.d1}，社交 ${selfContext.scores.d2}，审美 ${selfContext.scores.d3}，价值观 ${selfContext.scores.d4}，依恋 ${selfContext.scores.d5}

${partnerSection}

${compatSection ? `\n${compatSection}\n` : ""}

关系诊断的写法：
- 自然流畅，用口语写，不用列表标题和加粗
- 结构上要覆盖三个层次：这是什么根源问题（从人格数据分析）→ 具体体现在哪里（贴近用户描述）→ 一个最核心的改善方向
- 不要泛泛地说"你们要多沟通"，要说"你的依恋风格是XX，TA是XX，这导致了XX"这种有据可查的分析
- 长度400-500字，让用户感觉这5次灵犀值了
- 最后留一个问题，帮用户继续往深里想`;
}

/**
 * 流式 AI 问答 - 关系诊断模式
 * 用户提供关系背景信息，AI 综合双方人格数据给出全面诊断
 */
export async function streamDiagnosis(
  selfContext: UserContext,
  diagnosisMessage: string,
  partnerContext?: UserContext,
  nightMode = false
): Promise<ReadableStream<Uint8Array>> {
  log.info("开始关系诊断", {
    self: selfContext.personalityType,
    partner: partnerContext?.personalityType ?? "无",
    nightMode,
  });

  const systemPrompt = buildDiagnosisSystemPrompt(selfContext, partnerContext, nightMode);
  return buildStream(systemPrompt, [], diagnosisMessage, 800);
}

/**
 * 流式 AI 问答 - 单人模式
 */
export async function streamChat(
  context: UserContext,
  history: ChatMessage[],
  newMessage: string,
  nightMode = false
): Promise<ReadableStream<Uint8Array>> {
  log.info("开始单人 AI 对话", {
    personalityType: context.personalityType,
    historyLength: history.length,
    nightMode,
  });

  const personalityId = toPersonalityId(context.personalityType);
  const knowledge = retrieveKnowledge(newMessage, personalityId);
  const systemPrompt = buildSystemPrompt(context, knowledge, nightMode);

  return buildStream(systemPrompt, history, newMessage);
}

/**
 * 流式 AI 问答 - 双人同频模式
 *
 * 升级点：
 * - 接收对方最近的聊天记录摘要（partnerChatSummary），注入到系统提示的"幕后信息"区
 * - AI 可灵活调用该背景信息，但不直接透露原话，从而发挥真实的中介作用
 */
export async function streamCoupleChat(
  selfContext: UserContext,
  partnerContext: UserContext,
  history: ChatMessage[],
  newMessage: string,
  nightMode = false,
  partnerChatSummary?: string
): Promise<ReadableStream<Uint8Array>> {
  log.info("开始双人同频 AI 对话", {
    self: selfContext.personalityType,
    partner: partnerContext.personalityType,
    nightMode,
    hasPartnerContext: !!partnerChatSummary,
  });

  const personalityId = toPersonalityId(selfContext.personalityType);
  const knowledge = retrieveKnowledge(newMessage, personalityId);
  const systemPrompt = buildCoupleModeSystemPrompt(
    selfContext, partnerContext, knowledge, nightMode, partnerChatSummary
  );

  return buildStream(systemPrompt, history, newMessage);
}

/**
 * 内部：构建 OpenAI 流并转换为 Web ReadableStream
 * @param maxTokens 诊断模式需要更多 token（默认600，诊断用800）
 */
async function buildStream(
  systemPrompt: string,
  history: ChatMessage[],
  newMessage: string,
  maxTokens = 600
): Promise<ReadableStream<Uint8Array>> {
  const recentHistory = history.slice(-10);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: newMessage },
  ];

  try {
    const stream = await qwenClient.chat.completions.create({
      model: MODEL,
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature: 0.8,
    });

    const encoder = new TextEncoder();
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content ?? "";
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
        } catch (err) {
          log.error("流式输出异常", { error: (err as Error).message });
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });
  } catch (err) {
    log.error("Qwen API 调用失败", { error: (err as Error).message });
    throw new Error("AI 服务暂时不可用，请稍后重试");
  }
}
