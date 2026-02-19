/**
 * 答题评分算法模块
 *
 * 算法思路：
 * 1. 收集用户25道题的选项（A/B/C/D）
 * 2. 对每道题的选项权重进行累加，得到5个维度的原始总分
 * 3. 将5维度原始分归一化到 0-100 区间
 * 4. 用归一化后的5维向量与8种人格的标准向量进行余弦相似度计算
 * 5. 相似度最高的人格类型即为结果
 *
 * 余弦相似度公式：cos(θ) = (A·B) / (|A| × |B|)
 * 取值范围：-1 到 1，越接近1表示越相似
 */

import { QUESTIONS, type DimensionScores } from "@/data/questions";
import { PERSONALITIES, type PersonalityType } from "@/data/personalities";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("scoring");

export type UserAnswers = Record<number, "A" | "B" | "C" | "D">;

export type ScoringResult = {
  /** 归一化后的5维度得分（0-100） */
  scores: DimensionScores;
  /** 匹配到的人格类型 */
  personality: PersonalityType;
  /** 与该人格的余弦相似度（0-1） */
  similarity: number;
  /** 所有人格的相似度排名（便于调试和扩展） */
  allSimilarities: { id: string; name: string; similarity: number }[];
  /** MBTI 四字母类型（如 INFJ、ENTP），由 Q26-Q29 计算得出 */
  mbtiType: string;
};

/**
 * 计算两个向量的余弦相似度
 * 将维度分数转换为数组后比较方向相似性
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

/** 将 DimensionScores 对象转换为数组，顺序固定为 [d1, d2, d3, d4, d5] */
function scoresToArray(scores: DimensionScores): number[] {
  return [scores.d1, scores.d2, scores.d3, scores.d4, scores.d5];
}

/**
 * 主评分函数：接收用户答案，返回完整评分结果
 *
 * @param answers 用户答案映射，key 为题目 ID（1-25），value 为选项 ID（A/B/C/D）
 * @returns 完整的评分结果，包含归一化分数和匹配人格
 */
/**
 * 根据 Q26-Q29 的答案计算 MBTI 四字母类型
 * Q26: A=E / B=I
 * Q27: A=N / B=S
 * Q28: A=T / B=F
 * Q29: A=J / B=P
 */
function calculateMBTI(answers: UserAnswers): string {
  const ei = answers[26] === "A" ? "E" : "I";
  const ns = answers[27] === "A" ? "N" : "S";
  const tf = answers[28] === "A" ? "T" : "F";
  const jp = answers[29] === "A" ? "J" : "P";
  return `${ei}${ns}${tf}${jp}`;
}

export function calculateScore(answers: UserAnswers): ScoringResult {
  log.info("开始评分计算", { answeredCount: Object.keys(answers).length });

  // Step 1: 累加各维度原始分（仅处理 D1-D5 题目，跳过 MBTI 题）
  const rawScores: DimensionScores = { d1: 0, d2: 0, d3: 0, d4: 0, d5: 0 };

  for (const question of QUESTIONS) {
    // MBTI 题（Q26-Q29）不参与 D1-D5 评分
    if (question.dimension === "MBTI") continue;

    const selectedId = answers[question.id];
    if (!selectedId) {
      log.warn("题目未作答，跳过", { questionId: question.id });
      continue;
    }

    const option = question.options.find((o) => o.id === selectedId);
    if (!option) {
      log.warn("选项 ID 无效", { questionId: question.id, selectedId });
      continue;
    }

    // 累加每道题选项的5维度权重到总分
    rawScores.d1 += option.scores.d1;
    rawScores.d2 += option.scores.d2;
    rawScores.d3 += option.scores.d3;
    rawScores.d4 += option.scores.d4;
    rawScores.d5 += option.scores.d5;
  }

  // 计算 MBTI 类型
  const mbtiType = calculateMBTI(answers);
  log.info("MBTI 类型", { mbtiType });

  log.debug("原始维度得分", rawScores);

  // Step 2: 归一化到 0-100
  // 每道题单个维度最高为3分，共25题（但各维度不是每题都满分，理论最大约为5题×3=15分，
  // 但实际每题都有该维度权重，最保守的最大值取 25*3=75 作为基准）
  const MAX_RAW = 75; // 25题 × 最大单题得分3分
  const normalizedScores: DimensionScores = {
    d1: Math.min(100, Math.round((rawScores.d1 / MAX_RAW) * 100)),
    d2: Math.min(100, Math.round((rawScores.d2 / MAX_RAW) * 100)),
    d3: Math.min(100, Math.round((rawScores.d3 / MAX_RAW) * 100)),
    d4: Math.min(100, Math.round((rawScores.d4 / MAX_RAW) * 100)),
    d5: Math.min(100, Math.round((rawScores.d5 / MAX_RAW) * 100)),
  };

  log.debug("归一化维度得分", normalizedScores);

  // Step 3: 与每种人格计算余弦相似度
  const userVector = scoresToArray(normalizedScores);

  const similarities = PERSONALITIES.map((personality) => {
    const personalityVector = scoresToArray(personality.vector);
    const similarity = cosineSimilarity(userVector, personalityVector);
    return {
      id: personality.id,
      name: personality.name,
      similarity: parseFloat(similarity.toFixed(4)),
    };
  }).sort((a, b) => b.similarity - a.similarity);

  log.debug("人格相似度排名", similarities);

  // Step 4: 取相似度最高的人格
  const topMatch = similarities[0];
  const matchedPersonality = PERSONALITIES.find((p) => p.id === topMatch.id)!;

  log.info("评分完成", {
    personalityType: matchedPersonality.name,
    similarity: topMatch.similarity,
    scores: normalizedScores,
  });

  return {
    scores: normalizedScores,
    personality: matchedPersonality,
    similarity: topMatch.similarity,
    allSimilarities: similarities,
    mbtiType,
  };
}
