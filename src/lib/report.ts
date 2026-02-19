/**
 * 报告生成模块
 *
 * 基于评分结果和人格数据，组装完整的 JSON 报告结构。
 * 报告内容来源于 personalities.ts 中预设的模板，
 * 并动态注入用户的维度分数和城市信息，
 * 最终返回可直接存入数据库 Result.reportContent 的 JSON 对象。
 */

import { type ScoringResult } from "@/lib/scoring";
import { getPersonalityById } from "@/data/personalities";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("report");

export type ReportData = {
  /** 人格类型 ID */
  personalityId: string;
  /** 人格类型名称 */
  personalityName: string;
  /** 人格 emoji */
  personalityEmoji: string;
  /** 一句话标语 */
  tagline: string;
  /** 匹配城市（逗号分隔） */
  cityMatch: string;
  /** 5维度得分 */
  scores: {
    d1: number;
    d2: number;
    d3: number;
    d4: number;
    d5: number;
    /** 维度标签（便于前端展示） */
    labels: { d1: string; d2: string; d3: string; d4: string; d5: string };
  };
  /** 与人格标准向量的余弦相似度（0-1） */
  similarity: number;
  /** MBTI 四字母类型，由 Q26-Q29 计算 */
  mbtiType: string;
  /** 报告7个模块内容 */
  modules: {
    personality: string;
    city: string;
    idealType: string;
    advantages: string[];
    warnings: string[];
    compatibility: {
      matchPersonalityId: string;
      matchPersonalityName: string;
      content: string;
    };
    chatInvite: string;
  };
};

/**
 * 根据评分结果生成完整报告数据
 * 所有文本内容已在 personalities.ts 中预设，此函数负责组装
 *
 * @param scoringResult 评分结果（来自 scoring.ts）
 * @returns 完整报告数据，可直接 JSON.stringify 存入数据库
 */
export function generateReport(scoringResult: ScoringResult): ReportData {
  const { scores, personality, similarity, mbtiType } = scoringResult;

  log.info("生成报告", {
    personalityType: personality.name,
    similarity,
  });

  // 获取最佳匹配人格的信息
  const bestMatch = getPersonalityById(personality.bestMatchId);
  if (!bestMatch) {
    log.warn("最佳匹配人格未找到", { bestMatchId: personality.bestMatchId });
  }

  const report: ReportData = {
    personalityId: personality.id,
    personalityName: personality.name,
    personalityEmoji: personality.emoji,
    tagline: personality.tagline,
    cityMatch: personality.cities.join("/"),
    mbtiType: mbtiType ?? "未知",
    scores: {
      ...scores,
      labels: {
        d1: "生活节奏",
        d2: "社交人格",
        d3: "审美偏好",
        d4: "价值观",
        d5: "依恋风格",
      },
    },
    similarity,
    modules: {
      personality: personality.report.personality,
      city: personality.report.city,
      idealType: personality.report.idealType,
      advantages: personality.report.advantages,
      warnings: personality.report.warnings,
      compatibility: {
        matchPersonalityId: personality.bestMatchId,
        matchPersonalityName: bestMatch?.name ?? "待定",
        content: personality.report.compatibility,
      },
      chatInvite: personality.report.chatInvite,
    },
  };

  log.debug("报告生成完成", { personalityId: report.personalityId });
  return report;
}
