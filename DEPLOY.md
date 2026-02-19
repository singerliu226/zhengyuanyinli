# 正缘引力 · Zeabur 部署指南 v2.1

## 一、前置准备

1. **注册 Zeabur 账号**：https://zeabur.com（支持 GitHub 登录）
2. **阿里云通义千问 API Key**：前往 https://dashscope.aliyuncs.com 申请
3. **虎皮椒支付账号**：前往 https://payjs.cn 注册（个人开发者可申请，支持微信+支付宝）
   - 注册完成后在后台获取「商户号」(MCHID) 和「通信密钥」(KEY)
   - 在 PayJS 后台填写「异步通知地址」：`https://你的域名/api/payment/callback`

## 二、部署步骤

### Step 1：将代码推送到 GitHub

```bash
cd love-city-match
git init
git add .
git commit -m "feat: 正缘引力初始版本"
git remote add origin https://github.com/你的用户名/love-city-match.git
git push -u origin main
```

### Step 2：在 Zeabur 创建项目

1. 进入 Zeabur 控制台 → 点击「新建项目」
2. 选择「从 GitHub 部署」→ 授权并选择 `love-city-match` 仓库
3. Zeabur 会自动识别为 Next.js 项目

### Step 3：添加 PostgreSQL 数据库

1. 在项目页面点击「添加服务」→ 选择「PostgreSQL」
2. Zeabur 会自动创建数据库并注入 `DATABASE_URL` 环境变量
3. **不需要手动配置 DATABASE_URL**，Zeabur 自动处理

### Step 4：配置环境变量

在 Zeabur 项目设置 → 环境变量中添加以下变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `QWEN_API_KEY` | `sk-xxx` | 阿里云通义千问 API Key |
| `QWEN_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Qwen API 地址 |
| `QWEN_MODEL` | `qwen-plus` | 使用的模型名称 |
| `JWT_SECRET` | 随机32位字符串 | JWT 签名密钥（可用 `openssl rand -hex 32` 生成） |
| `ADMIN_SECRET` | 自定义管理员密码 | 访问 /admin 页面的密码 |
| `NEXT_PUBLIC_APP_URL` | `https://你的域名.zeabur.app` | 应用公开域名 |
| `PAYJS_MCHID` | PayJS商户号 | 虎皮椒支付商户ID |
| `PAYJS_KEY` | PayJS通信密钥 | 虎皮椒支付签名密钥（勿泄露） |

### Step 5：初始化数据库

Zeabur 部署成功后，需要运行数据库迁移。在 Zeabur 的「终端」功能中执行：

```bash
npx prisma migrate deploy
```

或者在构建命令中自动运行（已在 `zeabur.json` 中配置 `prisma generate`，
但 migrate 需要在首次部署后手动运行一次）。

### Step 6：绑定自定义域名（可选但推荐）

1. 在 Zeabur 服务设置 → 域名 → 添加域名
2. 按提示配置 DNS CNAME 记录
3. Zeabur 自动申请 SSL 证书

---

## 三、上线后操作流程

### 生成第一批激活码

1. 访问 `https://你的域名/admin`
2. 输入 `ADMIN_SECRET` 环境变量中设置的密码
3. 填写批次名称（如：`2026-02-小红书首发-100张`）
4. 设置生成数量，点击「生成」
5. 复制生成的激活码列表，配置到自动发货平台（如：闲鱼千牛、秋秋发货等）

### 闲鱼/淘宝自动发货配置

推荐使用「**卡券宝**」或「**秋秋发货**」等第三方工具实现：
- 买家付款 → 自动发送一张激活码给买家
- 发货话术：见 PRD 第九节

### 情感币手动充值

1. 买家通过微信/支付宝转账购买情感币
2. 买家提供手机号或报告链接
3. 在 `/admin` 页面「充值」标签 → 输入 ResultId → 充值对应币数

**如何获取 ResultId**：
- 用户报告页 URL 格式：`/result/[token]`
- 在 admin 统计页面查询（功能待完善）
- 或直接询问用户复制报告链接

---

## 四、成本估算

| 项目 | 月费用 | 说明 |
|------|--------|------|
| Zeabur 托管 | ~$5-15 | 根据流量，小流量阶段约 $5 |
| PostgreSQL | 包含在 Zeabur 内 | - |
| Qwen API | 按用量 | 1000次追问约 ¥5-10 |
| **合计** | ~¥40-120/月 | 卖出约5-12单即可覆盖成本 |

---

## 五、常见问题

**Q: 部署后访问 500 错误？**
A: 检查环境变量是否都填写了，特别是 `JWT_SECRET` 和 `QWEN_API_KEY`。数据库迁移是否运行。

**Q: AI 追问没有响应？**
A: 确认 `QWEN_API_KEY` 正确，`QWEN_BASE_URL` 使用完整路径（含 `/v1`）。

**Q: 用户报告链接过期？**
A: 报告 JWT 有效期7天。过期后用户无法查看，这是有意设计（防永久分享）。如需延期，在 `jwt.ts` 中修改 `7d` 为更长时间。
