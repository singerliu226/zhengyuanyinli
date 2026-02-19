# 正缘引力 · Love City Match

> **AI 恋爱人格测试 × 城市匹配 × 双人关系顾问**
> 帮你读懂 TA，让 TA 理解你。

---

## 产品简介

「正缘引力」是一款面向小红书、闲鱼等平台销售的 AI 情感测评工具。

- **个人探索版**：25 道题测出你的恋爱人格，匹配最适合你谈恋爱的城市
- **双人同频版**：两人各自完成测试后，AI「缘缘」同时读取双方档案，化身中立关系顾问，解释分歧根源，给出双方都能接受的沟通方式
- **灵犀追问**：测完后可继续向缘缘提问，消耗「灵犀」次数（支持自动充值）

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 15 (App Router) |
| 样式 | Tailwind CSS v4 |
| 数据库 | PostgreSQL + Prisma ORM v7 |
| AI 接口 | 阿里云百炼 DashScope（Qwen 系列） |
| 支付 | 虎皮椒支付 PayJS（微信 + 支付宝） |
| 日志 | Winston |
| 鉴权 | Jose (JWT) |
| 部署 | Zeabur |

---

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制示例文件并填入配置：

```bash
cp .env.example .env
```

需要填写的关键变量：

```env
DATABASE_URL=          # PostgreSQL 连接字符串
JWT_SECRET=            # JWT 签名密钥（随机字符串即可）
ADMIN_SECRET=          # 后台管理密码
QWEN_API_KEY=          # 阿里云百炼 API Key
QWEN_MODEL=qwen-plus   # 模型 ID
PAYJS_MCHID=           # 虎皮椒商户号
PAYJS_KEY=             # 虎皮椒通信密钥
NEXT_PUBLIC_APP_URL=   # 应用域名（本地：http://localhost:3000）
```

### 3. 初始化数据库

```bash
npx prisma generate
npx prisma db push
```

### 4. 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看效果。

---

## 目录结构

```
src/
├── app/
│   ├── page.tsx              # 落地页（定价 + 文案）
│   ├── activate/             # 激活码输入页
│   ├── test/                 # 25 道题答题页
│   ├── result/[token]/       # 测试报告页
│   ├── chat/[token]/         # AI 追问页（缘缘）
│   ├── couple/[coupleToken]/ # 伴侣邀请入口页
│   ├── recharge/[token]/     # 灵犀充能页
│   ├── admin/                # 后台管理（激活码 + 充值）
│   └── api/                  # 所有 API 路由
├── lib/
│   ├── ai.ts                 # AI 对话封装（流式输出 + 双人模式）
│   ├── cardkey.ts            # 激活码生成与校验
│   ├── db.ts                 # Prisma 客户端
│   ├── jwt.ts                # JWT 签发与验证
│   ├── logger.ts             # Winston 日志
│   ├── payment.ts            # PayJS 支付封装
│   ├── report.ts             # 报告生成
│   └── scoring.ts            # 评分算法（余弦相似度）
└── data/
    ├── questions.ts           # 25 道测试题目
    ├── personalities.ts       # 8 种恋爱人格定义
    └── knowledge-base/        # AI 知识库（问答 + 兼容性矩阵）
```

---

## 核心功能说明

### 激活码体系
- 16 位大写字母 + 数字，绑定手机号 + 设备指纹
- 分版本（personal / couple）控制初始灵犀数量
- 后台管理页可批量生成，支持按版本类型分批

### 灵犀消耗规则
| 问题类型 | 消耗 |
|----------|------|
| 日常咨询（是什么/合适/推荐） | 1 次 |
| 深度分析（为什么/建议/怎么办） | 2 次 |
| 特殊服务（月度复盘/关系诊断） | 5 次 |

### 双人同频模式
1. 发起人完成测试 → 报告页复制邀请链接
2. 伴侣打开链接 → 独立完成 25 题测试
3. 双方结对后 → 聊天页切换至双人模式
4. AI 同时读取两份人格档案，以中立关系顾问身份回答

### 支付流程
1. 用户选择灵犀套餐 → 调用 `/api/payment/create`
2. 跳转虎皮椒收银台（微信 / 支付宝）
3. 支付完成 → PayJS 异步回调 `/api/payment/callback`
4. 服务端原子更新灵犀余额 → 前端轮询到账确认

---

## 部署（Zeabur）

详见 [DEPLOY.md](./DEPLOY.md)

---

## 后台管理

访问 `/admin`，使用 `ADMIN_SECRET` 环境变量中设置的密码登录。

功能：
- 批量生成激活码（支持按版本类型）
- 查看历史批次 + 导出 CSV
- 手动补充灵犀（处理支付未自动到账的情况）
- 数据概览（激活量 / 使用量 / AI 追问次数）

---

## 注意事项

- 本项目仅供娱乐参考，不构成专业心理咨询建议
- AI 回答基于恋爱人格模型，不能替代专业的情感辅导
- 生产环境请务必替换 `JWT_SECRET` 和 `ADMIN_SECRET`
