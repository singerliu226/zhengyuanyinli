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
 * 角色：温柔睿智的情感顾问"缘缘"，基于用户人格档案给出个性化建议
 */
function buildSystemPrompt(context: UserContext, knowledgeSnippets: string, nightMode: boolean): string {
  const personality = getPersonalityById(toPersonalityId(context.personalityType));
  const personalityDesc = personality?.report.personality.slice(0, 150) ?? "";

  const nightNote = nightMode
    ? "\n【深夜模式】现在是深夜，语气更加温柔和包容，用更有陪伴感的方式回答，但不失真诚。"
    : "";

  return `你是一位专注于恋爱关系的心理成长顾问，温柔但不溺爱，真诚但不说教。你的名字是「缘缘」。${nightNote}

【用户画像】
- 恋爱人格类型：${context.personalityType}
- 最适合的恋爱城市：${context.cityMatch}
- 人格特质简述：${personalityDesc}...
- 5维度评分：生活节奏${context.scores.d1}/100，社交人格${context.scores.d2}/100，审美偏好${context.scores.d3}/100，价值观${context.scores.d4}/100，依恋风格${context.scores.d5}/100

${knowledgeSnippets ? `【参考知识库】\n${knowledgeSnippets}\n` : ""}

【对话原则】
1. 基于用户的人格类型和测试结果给出高度个性化的建议，避免说通用废话
2. 不做医疗或心理诊断，不替代专业心理咨询，必要时引导用户寻求专业帮助
3. 引导用户自我思考，用问题启发洞察，而非直接给出唯一答案
4. 语言风格：温暖、真实、有深度，像一个读过很多书的睿智好朋友
5. 回答控制在300字以内，重点突出
6. 如果问题和恋爱关系无关，温柔引导回主题`;
}

/**
 * 构建双人同频模式 System Prompt
 * 角色：关系中介"缘缘"，同时拥有两人的档案，协助两人沟通和理解彼此
 * 核心价值：不偏向任何一方，用数据说话，帮助双方找到共同语言
 */
function buildCoupleModeSystemPrompt(
  selfContext: UserContext,
  partnerContext: UserContext,
  knowledgeSnippets: string,
  nightMode: boolean
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
    ? "\n【深夜模式】现在是深夜，语气格外温柔，回答中带有更多安抚和陪伴感。"
    : "";

  return `你是「缘缘」，一位专业的恋爱关系中介顾问。现在你正在帮助一对伴侣（或朋友）进行深度的关系探索对话。你同时拥有双方的人格档案，你的目标是帮助他们理解彼此、找到沟通方式，而不是偏向任何一方。${nightNote}

【发言者档案】
- 恋爱人格：${selfContext.personalityType}
- 最适城市：${selfContext.cityMatch}
- 特质：${selfDesc}...
- 5维度：生活节奏${selfContext.scores.d1}，社交${selfContext.scores.d2}，审美${selfContext.scores.d3}，价值观${selfContext.scores.d4}，依恋${selfContext.scores.d5}

【伴侣档案】
- 恋爱人格：${partnerContext.personalityType}
- 最适城市：${partnerContext.cityMatch}
- 特质：${partnerDesc}...
- 5维度：生活节奏${partnerContext.scores.d1}，社交${partnerContext.scores.d2}，审美${partnerContext.scores.d3}，价值观${partnerContext.scores.d4}，依恋${partnerContext.scores.d5}

${compatInfo}

${knowledgeSnippets ? `【参考知识库】\n${knowledgeSnippets}\n` : ""}

【对话原则】
1. 用双方的实际数据解释分歧的根源，让"道理"有据可查
2. 不评判谁对谁错，而是说明"这是两种不同人格的自然反应"
3. 为双方提供具体可操作的沟通建议，而非泛泛而谈
4. 引导双方看到彼此的互补价值，而不只是冲突
5. 语气温柔、中立、有智慧，像一个既懂心理学又懂爱情的朋友
6. 回答控制在350字以内`;
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
 * 同时读取双方档案，AI 扮演关系中介角色
 */
export async function streamCoupleChat(
  selfContext: UserContext,
  partnerContext: UserContext,
  history: ChatMessage[],
  newMessage: string,
  nightMode = false
): Promise<ReadableStream<Uint8Array>> {
  log.info("开始双人同频 AI 对话", {
    self: selfContext.personalityType,
    partner: partnerContext.personalityType,
    nightMode,
  });

  const personalityId = toPersonalityId(selfContext.personalityType);
  const knowledge = retrieveKnowledge(newMessage, personalityId);
  const systemPrompt = buildCoupleModeSystemPrompt(selfContext, partnerContext, knowledge, nightMode);

  return buildStream(systemPrompt, history, newMessage);
}

/**
 * 内部：构建 OpenAI 流并转换为 Web ReadableStream
 */
async function buildStream(
  systemPrompt: string,
  history: ChatMessage[],
  newMessage: string
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
      max_tokens: 600,
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
