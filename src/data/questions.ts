/**
 * 测试题目数据模块
 *
 * 共25道题，覆盖5个维度：
 * - D1: 生活节奏与事业观（节奏快慢、目标导向程度）
 * - D2: 社交人格（外向 vs 内向，社交广度 vs 深度）
 * - D3: 审美与环境偏好（都市现代 vs 人文自然）
 * - D4: 价值观与金钱观（理性务实 vs 感性浪漫）
 * - D5: 情感需求与依恋风格（焦虑依恋↑ / 安全依恋中 / 回避依恋↓）
 *
 * 每个选项包含5个维度的权重分（0-3分），最终通过加权求和+余弦相似度匹配人格类型。
 * 注意：所有字符串内的双引号用书名号「」替代，避免 TypeScript 解析错误。
 */

export type DimensionScores = {
  d1: number; // 生活节奏与事业观
  d2: number; // 社交人格
  d3: number; // 审美与环境偏好
  d4: number; // 价值观与金钱观
  d5: number; // 情感需求与依恋风格
};

export type QuestionOption = {
  id: "A" | "B" | "C" | "D";
  text: string;
  scores: DimensionScores;
};

export type Question = {
  id: number;
  dimension: "D1" | "D2" | "D3" | "D4" | "D5";
  text: string;
  options: QuestionOption[];
};

export const QUESTIONS: Question[] = [
  // ========== 维度1：生活节奏与事业观 Q1-Q5 ==========
  {
    id: 1,
    dimension: "D1",
    text: "周五晚上，你最理想的安排是？",
    options: [
      { id: "A", text: "约朋友撸串唱K，越热闹越好", scores: { d1: 3, d2: 3, d3: 0, d4: 1, d5: 1 } },
      { id: "B", text: "回家追剧或看书，来一杯热茶", scores: { d1: 0, d2: 0, d3: 1, d4: 1, d5: 2 } },
      { id: "C", text: "去一个从没去过的馆子独自试菜", scores: { d1: 1, d2: 1, d3: 3, d4: 2, d5: 0 } },
      { id: "D", text: "参加一个行业聚会或读书分享会", scores: { d1: 3, d2: 2, d3: 1, d4: 3, d5: 0 } },
    ],
  },
  {
    id: 2,
    dimension: "D1",
    text: "你认为工作和恋爱的关系是？",
    options: [
      { id: "A", text: "工作第一，感情配合我的节奏", scores: { d1: 3, d2: 1, d3: 0, d4: 3, d5: 0 } },
      { id: "B", text: "感情优先，工作是为了更好地生活", scores: { d1: 0, d2: 2, d3: 1, d4: 1, d5: 3 } },
      { id: "C", text: "两者并重，但压力大时会自动屏蔽感情", scores: { d1: 2, d2: 1, d3: 1, d4: 2, d5: 1 } },
      { id: "D", text: "我不太区分，工作中遇到喜欢的人最好", scores: { d1: 1, d2: 3, d3: 2, d4: 0, d5: 2 } },
    ],
  },
  {
    id: 3,
    dimension: "D1",
    text: "当你买一件日常用品（比如水杯），你会？",
    options: [
      { id: "A", text: "看性价比，够用就行，不纠结", scores: { d1: 1, d2: 2, d3: 0, d4: 0, d5: 1 } },
      { id: "B", text: "认真研究品牌和质量，买了就不再想换", scores: { d1: 2, d2: 0, d3: 1, d4: 3, d5: 1 } },
      { id: "C", text: "看颜值，必须放在桌上好看", scores: { d1: 1, d2: 1, d3: 3, d4: 2, d5: 1 } },
      { id: "D", text: "买网红推荐的或朋友在用的", scores: { d1: 1, d2: 3, d3: 2, d4: 1, d5: 2 } },
    ],
  },
  {
    id: 4,
    dimension: "D1",
    text: "你对待假期的态度？",
    options: [
      { id: "A", text: "提前1个月规划好所有行程", scores: { d1: 3, d2: 1, d3: 1, d4: 3, d5: 0 } },
      { id: "B", text: "临时起意说走就走", scores: { d1: 1, d2: 2, d3: 3, d4: 0, d5: 1 } },
      { id: "C", text: "在家躺平就是最好的假期", scores: { d1: 0, d2: 0, d3: 0, d4: 1, d5: 2 } },
      { id: "D", text: "去那种人少、有点秘境感的地方", scores: { d1: 1, d2: 0, d3: 3, d4: 2, d5: 1 } },
    ],
  },
  {
    id: 5,
    dimension: "D1",
    text: "你在工作中更享受哪种状态？",
    options: [
      { id: "A", text: "快节奏、高强度，有成就感", scores: { d1: 3, d2: 2, d3: 0, d4: 3, d5: 0 } },
      { id: "B", text: "稳定可预期，能下班准时回家", scores: { d1: 0, d2: 1, d3: 1, d4: 2, d5: 3 } },
      { id: "C", text: "有创作空间，不被过多管理", scores: { d1: 1, d2: 1, d3: 3, d4: 2, d5: 0 } },
      { id: "D", text: "灵活自由，可以在咖啡馆工作", scores: { d1: 2, d2: 1, d3: 3, d4: 1, d5: 1 } },
    ],
  },

  // ========== 维度2：社交人格与圈层 Q6-Q10 ==========
  {
    id: 6,
    dimension: "D2",
    text: "朋友通常说你是什么类型的人？",
    options: [
      { id: "A", text: "开朗外向，气氛活跃担当", scores: { d1: 2, d2: 3, d3: 0, d4: 1, d5: 1 } },
      { id: "B", text: "稳重可靠，会倾听的那种", scores: { d1: 1, d2: 1, d3: 1, d4: 2, d5: 3 } },
      { id: "C", text: "独特有趣，不走寻常路", scores: { d1: 1, d2: 2, d3: 3, d4: 2, d5: 0 } },
      { id: "D", text: "温柔细腻，情绪感知力强", scores: { d1: 0, d2: 1, d3: 2, d4: 1, d5: 3 } },
    ],
  },
  {
    id: 7,
    dimension: "D2",
    text: "在一个不认识人的聚会上，你会？",
    options: [
      { id: "A", text: "主动破冰，开场就跟陌生人聊嗨", scores: { d1: 2, d2: 3, d3: 0, d4: 1, d5: 0 } },
      { id: "B", text: "找到东道主待在旁边，慢慢融入", scores: { d1: 1, d2: 1, d3: 1, d4: 1, d5: 2 } },
      { id: "C", text: "找个角落观察，等有趣的人来找我聊", scores: { d1: 0, d2: 0, d3: 3, d4: 2, d5: 1 } },
      { id: "D", text: "提前借故离开或根本不去", scores: { d1: 0, d2: 0, d3: 1, d4: 1, d5: 1 } },
    ],
  },
  {
    id: 8,
    dimension: "D2",
    text: "你的社交圈特征是？",
    options: [
      { id: "A", text: "朋友多，各行各业都有，但深交的不多", scores: { d1: 2, d2: 3, d3: 0, d4: 1, d5: 0 } },
      { id: "B", text: "朋友不多，但每一个都认识很久、很深", scores: { d1: 1, d2: 0, d3: 1, d4: 2, d5: 3 } },
      { id: "C", text: "有一个固定小圈子，圈外人很难进来", scores: { d1: 1, d2: 0, d3: 2, d4: 3, d5: 2 } },
      { id: "D", text: "线上关系多，线下独行侠", scores: { d1: 1, d2: 1, d3: 2, d4: 1, d5: 1 } },
    ],
  },
  {
    id: 9,
    dimension: "D2",
    text: "你分享生活的方式？",
    options: [
      { id: "A", text: "发朋友圈全公开，记录日常", scores: { d1: 1, d2: 3, d3: 1, d4: 1, d5: 0 } },
      { id: "B", text: "发限制分组，只给特定人看", scores: { d1: 1, d2: 0, d3: 1, d4: 2, d5: 3 } },
      { id: "C", text: "几乎不主动分享，但会更新个人状态", scores: { d1: 0, d2: 0, d3: 2, d4: 1, d5: 1 } },
      { id: "D", text: "发小红书/微博等公开平台，喜欢和陌生人互动", scores: { d1: 2, d2: 3, d3: 3, d4: 1, d5: 0 } },
    ],
  },
  {
    id: 10,
    dimension: "D2",
    text: "你对恋爱关系中「边界感」的看法？",
    options: [
      { id: "A", text: "两个人就是要融为一体，什么边界？", scores: { d1: 0, d2: 2, d3: 0, d4: 0, d5: 3 } },
      { id: "B", text: "需要一定的私人空间，但愿意为对方妥协", scores: { d1: 1, d2: 1, d3: 1, d4: 2, d5: 2 } },
      { id: "C", text: "边界感非常重要，保持自我才能好好相爱", scores: { d1: 2, d2: 0, d3: 2, d4: 3, d5: 0 } },
      { id: "D", text: "随缘，看对方是什么类型就配合对方", scores: { d1: 0, d2: 2, d3: 1, d4: 0, d5: 1 } },
    ],
  },

  // ========== 维度3：审美与环境偏好 Q11-Q15 ==========
  {
    id: 11,
    dimension: "D3",
    text: "你理想中约会的场景是？",
    options: [
      { id: "A", text: "热闹的商圈，逛街吃饭看电影", scores: { d1: 2, d2: 3, d3: 0, d4: 1, d5: 2 } },
      { id: "B", text: "安静的咖啡馆或美术馆", scores: { d1: 0, d2: 0, d3: 3, d4: 2, d5: 1 } },
      { id: "C", text: "街边小馆或夜市，烟火气十足", scores: { d1: 1, d2: 2, d3: 2, d4: 0, d5: 3 } },
      { id: "D", text: "郊外露营或骑行，贴近自然", scores: { d1: 1, d2: 1, d3: 3, d4: 1, d5: 2 } },
    ],
  },
  {
    id: 12,
    dimension: "D3",
    text: "如果你能选择居住环境，你会选？",
    options: [
      { id: "A", text: "市中心高楼，繁华便利，24小时都是城市", scores: { d1: 3, d2: 2, d3: 0, d4: 2, d5: 0 } },
      { id: "B", text: "老城区有历史感的小区，有人情味", scores: { d1: 0, d2: 2, d3: 2, d4: 1, d5: 2 } },
      { id: "C", text: "有文艺气息的街区，咖啡馆书店环绕", scores: { d1: 1, d2: 1, d3: 3, d4: 2, d5: 1 } },
      { id: "D", text: "郊区独栋或公寓，安静，能养猫养狗", scores: { d1: 0, d2: 0, d3: 2, d4: 2, d5: 3 } },
    ],
  },
  {
    id: 13,
    dimension: "D3",
    text: "你最欣赏哪种穿搭风格（不一定是你自己穿）？",
    options: [
      { id: "A", text: "干净利落的商务/都市风", scores: { d1: 3, d2: 1, d3: 0, d4: 3, d5: 0 } },
      { id: "B", text: "精致日系/韩系通勤风", scores: { d1: 2, d2: 1, d3: 2, d4: 3, d5: 1 } },
      { id: "C", text: "有个性的vintage或设计师款", scores: { d1: 1, d2: 1, d3: 3, d4: 2, d5: 0 } },
      { id: "D", text: "随性自然，户外感或中性风", scores: { d1: 1, d2: 1, d3: 2, d4: 1, d5: 1 } },
    ],
  },
  {
    id: 14,
    dimension: "D3",
    text: "你最想在哪种场景约会？",
    options: [
      { id: "A", text: "夜晚霓虹闪烁的酒吧街（如武康路、三里屯）", scores: { d1: 2, d2: 3, d3: 1, d4: 1, d5: 0 } },
      { id: "B", text: "下午阳光洒进来的独立书店（如成都方所）", scores: { d1: 0, d2: 0, d3: 3, d4: 2, d5: 1 } },
      { id: "C", text: "周末老街的早市，喝豆浆吃煎饼", scores: { d1: 0, d2: 2, d3: 2, d4: 0, d5: 3 } },
      { id: "D", text: "山顶看日落，只有你们两个人", scores: { d1: 0, d2: 0, d3: 3, d4: 1, d5: 3 } },
    ],
  },
  {
    id: 15,
    dimension: "D3",
    text: "你对「家」的理解？",
    options: [
      { id: "A", text: "家是基地，充好电出去闯荡", scores: { d1: 3, d2: 2, d3: 0, d4: 2, d5: 0 } },
      { id: "B", text: "家是重心，布置好了比哪里都舒服", scores: { d1: 0, d2: 0, d3: 2, d4: 2, d5: 3 } },
      { id: "C", text: "哪里有感情哪里就是家", scores: { d1: 0, d2: 2, d3: 1, d4: 0, d5: 3 } },
      { id: "D", text: "随时可以打包离开的地方才是自由", scores: { d1: 2, d2: 1, d3: 3, d4: 2, d5: 0 } },
    ],
  },

  // ========== 维度4：价值观与金钱观 Q16-Q20 ==========
  {
    id: 16,
    dimension: "D4",
    text: "在一段关系里，你对「谁出钱」的看法？",
    options: [
      { id: "A", text: "严格AA，经济独立最重要", scores: { d1: 3, d2: 0, d3: 1, d4: 3, d5: 0 } },
      { id: "B", text: "谁有钱谁多出，但心意更重要", scores: { d1: 1, d2: 2, d3: 1, d4: 1, d5: 2 } },
      { id: "C", text: "对方承担更多是自然的", scores: { d1: 0, d2: 1, d3: 0, d4: 0, d5: 2 } },
      { id: "D", text: "随具体情况，不固执于形式", scores: { d1: 1, d2: 2, d3: 2, d4: 2, d5: 1 } },
    ],
  },
  {
    id: 17,
    dimension: "D4",
    text: "对于另一半，你最在意哪个？",
    options: [
      { id: "A", text: "有上进心和事业心", scores: { d1: 3, d2: 1, d3: 0, d4: 3, d5: 0 } },
      { id: "B", text: "情绪稳定，有安全感", scores: { d1: 0, d2: 1, d3: 0, d4: 2, d5: 3 } },
      { id: "C", text: "有自己的审美和独特性", scores: { d1: 1, d2: 1, d3: 3, d4: 2, d5: 0 } },
      { id: "D", text: "懂生活、会享受，有情趣", scores: { d1: 1, d2: 2, d3: 2, d4: 1, d5: 2 } },
    ],
  },
  {
    id: 18,
    dimension: "D4",
    text: "两个人发生争吵后，你通常怎么做？",
    options: [
      { id: "A", text: "当场解决，不留隔夜仇", scores: { d1: 3, d2: 3, d3: 0, d4: 2, d5: 1 } },
      { id: "B", text: "先冷静，过几小时再沟通", scores: { d1: 1, d2: 1, d3: 1, d4: 3, d5: 1 } },
      { id: "C", text: "等对方先开口，我拉不下脸", scores: { d1: 0, d2: 1, d3: 0, d4: 0, d5: 3 } },
      { id: "D", text: "需要独处一段时间消化情绪再说", scores: { d1: 1, d2: 0, d3: 2, d4: 2, d5: 0 } },
    ],
  },
  {
    id: 19,
    dimension: "D4",
    text: "你对「异地恋」的态度？",
    options: [
      { id: "A", text: "完全接受，爱情可以跨越距离", scores: { d1: 2, d2: 1, d3: 1, d4: 3, d5: 0 } },
      { id: "B", text: "接受短期异地，但必须有明确的在一起计划", scores: { d1: 2, d2: 1, d3: 0, d4: 3, d5: 1 } },
      { id: "C", text: "尝试过但很痛苦，现在拒绝", scores: { d1: 0, d2: 1, d3: 0, d4: 1, d5: 3 } },
      { id: "D", text: "没想过，走一步看一步", scores: { d1: 1, d2: 2, d3: 2, d4: 0, d5: 1 } },
    ],
  },
  {
    id: 20,
    dimension: "D4",
    text: "你认为恋爱中最重要的是？",
    options: [
      { id: "A", text: "共同的目标和三观一致", scores: { d1: 3, d2: 1, d3: 0, d4: 3, d5: 1 } },
      { id: "B", text: "相互吸引和化学反应", scores: { d1: 1, d2: 2, d3: 2, d4: 1, d5: 2 } },
      { id: "C", text: "精神上的深度连接", scores: { d1: 1, d2: 0, d3: 3, d4: 2, d5: 1 } },
      { id: "D", text: "生活习惯和日常的舒适度", scores: { d1: 0, d2: 1, d3: 1, d4: 2, d5: 3 } },
    ],
  },

  // ========== 维度5：情感需求与亲密关系风格 Q21-Q25 ==========
  {
    id: 21,
    dimension: "D5",
    text: "在关系中，你更容易出现哪种焦虑？",
    options: [
      { id: "A", text: "怕被冷落，需要频繁确认爱意", scores: { d1: 0, d2: 1, d3: 0, d4: 0, d5: 3 } },
      { id: "B", text: "怕失去自我，被对方淹没", scores: { d1: 2, d2: 0, d3: 2, d4: 2, d5: 0 } },
      { id: "C", text: "怕对方不理解真实的自己", scores: { d1: 0, d2: 0, d3: 3, d4: 1, d5: 1 } },
      { id: "D", text: "我不太会焦虑，比较佛系", scores: { d1: 1, d2: 2, d3: 1, d4: 2, d5: 1 } },
    ],
  },
  {
    id: 22,
    dimension: "D5",
    text: "你更喜欢哪种相处模式？",
    options: [
      { id: "A", text: "天天见面，形影不离，恨不得住在一起", scores: { d1: 0, d2: 2, d3: 0, d4: 0, d5: 3 } },
      { id: "B", text: "每周固定约会，保留各自的生活节奏", scores: { d1: 2, d2: 1, d3: 1, d4: 2, d5: 1 } },
      { id: "C", text: "不一定要见面，但要持续的精神交流", scores: { d1: 1, d2: 0, d3: 3, d4: 2, d5: 0 } },
      { id: "D", text: "自然而然，不刻意安排频率", scores: { d1: 1, d2: 2, d3: 1, d4: 1, d5: 1 } },
    ],
  },
  {
    id: 23,
    dimension: "D5",
    text: "对方做了让你不满意的事，你会？",
    options: [
      { id: "A", text: "直接说出来，哪怕当场争执", scores: { d1: 3, d2: 3, d3: 0, d4: 2, d5: 1 } },
      { id: "B", text: "暗示对方，希望他自己意识到", scores: { d1: 0, d2: 1, d3: 1, d4: 0, d5: 3 } },
      { id: "C", text: "先消化，选合适时机好好谈", scores: { d1: 1, d2: 0, d3: 1, d4: 3, d5: 1 } },
      { id: "D", text: "忍了，大事化小，不想因小事破坏关系", scores: { d1: 0, d2: 1, d3: 0, d4: 0, d5: 2 } },
    ],
  },
  {
    id: 24,
    dimension: "D5",
    text: "你心中理想关系的画面？",
    options: [
      { id: "A", text: "一起创业或为共同目标努力，互相是战友", scores: { d1: 3, d2: 2, d3: 0, d4: 3, d5: 0 } },
      { id: "B", text: "平淡而幸福，回家有人等，出门有人陪", scores: { d1: 0, d2: 1, d3: 1, d4: 1, d5: 3 } },
      { id: "C", text: "互相激发，精神上的高度共鸣", scores: { d1: 1, d2: 0, d3: 3, d4: 2, d5: 1 } },
      { id: "D", text: "一起探索世界，去没去过的地方", scores: { d1: 2, d2: 2, d3: 3, d4: 1, d5: 1 } },
    ],
  },
  {
    id: 25,
    dimension: "D5",
    text: "你最害怕在关系中经历的？",
    options: [
      { id: "A", text: "被背叛或欺骗", scores: { d1: 1, d2: 1, d3: 0, d4: 2, d5: 2 } },
      { id: "B", text: "变成最熟悉的陌生人，感情淡化", scores: { d1: 0, d2: 1, d3: 1, d4: 0, d5: 3 } },
      { id: "C", text: "失去自我，活成对方想要的样子", scores: { d1: 2, d2: 0, d3: 3, d4: 2, d5: 0 } },
      { id: "D", text: "错过了更合适的人", scores: { d1: 2, d2: 1, d3: 1, d4: 3, d5: 1 } },
    ],
  },
];
