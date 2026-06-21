# 🐕 旺财（WAOS）· AI 私域营销助手

> **AI 私域营销助手，专为奔驰销售运营设计。**
> 一套面向汽车 4S 店销售运营人员的桌面端 AI 自动化系统：微信真实接入 + 多模型 AI 大脑 + 5 个奔驰销售人设 + 全渠道自动回复，把"加好友、聊车、跟进、逼单、售后"这条链路全部交给旺财。

---

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)
![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-latest-000000?logo=shadcnui)
![Bun](https://img.shields.io/badge/Bun-runtime-fbf0df?logo=bun)
![License](https://img.shields.io/badge/License-Proprietary-red)

---

## ✨ 核心特性

| 💬 微信真实接入 | 🧠 AI 多模型大脑 | 🎭 5 销售人设 | 🚀 全渠道自动回复 |
|:---:|:---:|:---:|:---:|
| 基于 ClawBot SDK<br/>扫码登录 / 多号切换<br/>沉睡客户群发 | 智谱 GLM-4 主力 + 豆包 Docker<br/>+ 多平台 Cookie 逆向降级<br/>Z.AI 兜底 | 销冠·苏念安 / 逼单·顾倾城<br/>售后·叶之秋 / 运营·陈墨白<br/>市场·江月明 | 微信 + 视频号 + 抖音<br/>8 种动作：私信 / 评论 / 点赞<br/>沙箱节流防封 |

---

## 📑 目录

- [功能特性](#-功能特性)
- [截图预览](#-截图预览)
- [快速开始](#-快速开始)
- [安装说明](#-安装说明)
- [功能说明](#-功能说明)
- [技术架构](#-技术架构)
- [项目结构](#-项目结构)
- [AI 大脑多模型降级说明](#-ai-大脑多模型降级说明)
- [安全护盾说明](#-安全护盾说明)
- [人设系统说明](#-人设系统说明)
- [开发指南](#-开发指南)
- [常见问题 FAQ](#-常见问题-faq)
- [License](#-license)

---

## 🎯 功能特性

旺财（WAOS，**W**angcai **A**I **O**perations **S**ystem）是一个 **5300+ 行实质业务代码** 的完整可运行桌面应用，而不是界面壳子。核心能力包括：

### 1. 微信真实接入
- ClawBot SDK（`weixin-agent-sdk`）扫码登录，不是模拟器
- 自动收发消息、3 个微信号无缝切换
- 沉睡客户群发激活，**3-8s 防封间隔** + 随机抖动

### 2. AI 多模型大脑
- 主力：智谱 GLM-4 API（内置 Key，开箱即用）
- 备选：豆包 Docker（doubao2api，本地部署）
- 降级链：豆包 → 千问 → Kimi → 智谱 Cookie 逆向
- 兜底：Z.AI
- 5 分钟请求缓存 + 350ms 限流，自动冷却恢复

### 3. Identity Kernel 身份核
- 6 维身份向量：信任 / 意图 / 情绪 / 紧迫 / 抗拒 / 价值
- 身份漂移（driftIdentity）+ 人格编译器（compilePersona）
- Multi-Speed Pipeline：70% 请求走快速规则引擎，**不调用 LLM**
- Action DSL 可验证执行计划，风险分 > 0.7 拒绝执行

### 4. 执行沙箱 Anti-Fragile
- 节流：微信 20/min、抖音 15/min、视频号 10/min
- 防封延迟 2-4s + 随机抖动
- 失败重试 3 次指数退避（基数 2000ms）
- 行为漂移检测 + 执行队列串行化

### 5. 5 个奔驰销售人设
| ID | 名称 | 角色 | 一句话定位 |
|---|---|---|---|
| `star_sales` | 🏆 明星销售·苏念安 | sales | 销冠，朋友式聊车，试驾转化专家 |
| `closer` | 🔥 逼单能手·顾倾城 | sales | 限时优惠 + 现车稀缺，临门一脚 |
| `service` | 💙 售后管家·叶之秋 | service | 保养 / 转介绍 / 续保 |
| `marketing` | 🎬 短视频运营·陈墨白 | marketing | 评论截流 + 私信转化 |
| `bd` | 📈 市场拓展·江月明 | bd | 企业客户 / 异业合作 / 沉睡激活 |

### 6. 安全护盾（3+2 层过滤）
- 输入层：Prompt 注入检测 + 违规关键词 + 价格承诺过滤
- 输出层：违规词二次过滤 + 价格承诺拦截
- Unicode NFKC 归一化 + 全角→半角 + 空白剥离，防绕过

### 7. 全渠道自动回复
- 8 种动作：微信私信 / 点赞 / 评论 + 视频号私信 / 评论 + 抖音私信 / 评论 / 点赞
- 平台 DOM 选择器可被 UI 自愈系统更新

### 8. 视频号截流
- 高播放量视频优先排序
- 内置种子评论数据，启动即可演示

### 9. 压测监控面板
- 12 维度 35 项指标
- 每 2 分钟自动执行，Dashboard 全屏可视化

### 10. 桌面级体验
- 🐕 开机界面：旺财柴犬头像 + 加载进度条
- 深色 / 浅色 / 自动主题
- ErrorBoundary 防白屏，崩溃自动降级
- CommandPalette（⌘K / Ctrl+K）全局命令面板
- 22 个旺财自定义组件，无依赖第三方组件库

---

## 📸 截图预览

> 📌 截图占位符 — 请替换为实际运行截图

```
[主界面三栏布局截图]
- 左侧：微信会话列表 + 聊天窗口
- 右侧：决策面板（客户意向评分 + 推荐话术）
- 底部：EventStream 实时事件流
- 顶栏：人设切换 + 微信号切换 + 全局熔断
```

![主界面](docs/screenshots/main.png)

![人设切换](docs/screenshots/personas.png)

![AI 大脑设置](docs/screenshots/brain-settings.png)

![压测监控面板](docs/screenshots/dashboard.png)

---

## 🚀 快速开始

**3 分钟体验旺财**（Windows 普通用户）：

```bash
# 1. 下载最新的 旺财 Setup 1.0.0.exe
# 2. 双击安装 → 桌面出现"旺财"快捷方式
# 3. 启动后等待初始化（旺财柴犬加载动画）
# 4. 顶栏点击"微信连接" → 扫码登录微信
# 5. 选一个人设（默认销冠苏念安）→ 开始聊天
```

**开发者本地预览**：

```bash
git clone <repo-url> wangcai
cd wangcai
bun install
bun run dev
# 浏览器打开 http://localhost:3000
```

> 📖 详细安装步骤见 [docs/INSTALL.md](docs/INSTALL.md)

---

## 📦 安装说明

旺财支持三种使用方式，按你的身份选一种：

| 用户类型 | 推荐方式 | 文档 |
|---|---|---|
| 🏠 普通用户（销售运营） | 下载 exe 双击安装 | [INSTALL.md → 普通用户](docs/INSTALL.md#普通用户-windows) |
| 👨‍💻 开发者 / 二次开发 | git clone + bun dev | [INSTALL.md → 开发者](docs/INSTALL.md#开发者) |
| 📦 打包发布 / CI | electron-builder 出 nsis exe | [INSTALL.md → 打包发布](docs/INSTALL.md#打包发布) |

### 环境要求

| 项目 | 普通用户 | 开发者 |
|---|---|---|
| 操作系统 | Windows 10/11 x64 | Windows / macOS / Linux |
| Node/Bun | 不需要 | Bun ≥ 1.3 |
| 内存 | ≥ 4 GB | ≥ 8 GB |
| 磁盘 | ≥ 500 MB | ≥ 2 GB（含 node_modules） |
| 微信 | 已安装并登录 | 可选（开发可不扫码） |

---

## 📖 功能说明

详细的逐功能使用说明见 **[docs/FEATURES.md](docs/FEATURES.md)**，包含：

1. 微信真实接入（ClawBot 扫码 + 多号 + 沉睡群发）
2. AI 大脑多模型降级
3. Identity Kernel 身份核
4. 执行沙箱 Anti-Fragile
5. 5 个奔驰销售人设
6. 安全护盾（3+2 层过滤）
7. 全渠道自动回复（8 动作）
8. 视频号截流
9. 压测监控面板
10. 其他（主题 / ErrorBoundary / 开机界面）

每个功能都附带 **使用步骤** 和 **预期效果**，可直接对照操作。

---

## 🏗 技术架构

完整的分层架构图、模块说明、数据流走向见 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**。

### 一句话架构

```
┌──────────────────────────────────────────────────────────────┐
│  Electron 桌面壳（main.js + 3 个 preload + sandbox + ui-actuation）│
├──────────────────────────────────────────────────────────────┤
│  Next.js 16 前端（React 19 + Zustand store + 22 个旺财组件）       │
├──────────────────────────────────────────────────────────────┤
│  API 层（13 个 Next.js API route + Brain 多模型聚合）             │
├──────────────────────────────────────────────────────────────┤
│  业务逻辑（Identity Kernel + Safety + WeChatBridge + DouyinConnector）│
├──────────────────────────────────────────────────────────────┤
│  Mini services（doubao-reverse / multi-reverse / waos-stream）  │
├──────────────────────────────────────────────────────────────┤
│  数据层（Prisma + SQLite）                                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 📁 项目结构

```
wangcai/
├── electron/                      # Electron 桌面端
│   ├── main.js                    # 主进程（542 行）：启动 Next.js + WebSocket
│   ├── sandbox.js                 # 执行沙箱（节流 + 重试 + 回滚）
│   ├── ui-actuation.js            # BrowserView 平台嵌入（微信/抖音/视频号）
│   ├── preload.js                 # 主窗口 preload
│   └── preloads/                  # 各平台 DOM 注入脚本
│       ├── wechat-preload.js
│       ├── douyin-preload.js
│       └── video-preload.js
│
├── src/
│   ├── app/
│   │   ├── page.tsx               # 旺财三栏布局主页面
│   │   ├── layout.tsx             # 标题 + icon
│   │   └── api/waos/              # 13 个 API route
│   │       ├── brain/             # AI 大脑多模型聚合
│   │       │   ├── route.ts       # 主路由（465 行）
│   │       │   ├── verify/        # 模型可用性校验
│   │       │   ├── extract/       # 消息抽取
│   │       │   └── proxy/[...path]/  # 代理转发
│   │       ├── reply/             # 安全回复
│   │       ├── safety/            # 安全检测
│   │       ├── auto-reply/        # 全渠道自动回复
│   │       ├── wechat/            # 微信桥接
│   │       ├── douyin/            # 抖音连接器
│   │       ├── leads/             # 线索管理
│   │       ├── metrics/           # 压测监控
│   │       ├── health/            # 健康检查
│   │       ├── llm/               # LLM 通用入口
│   │       ├── reverse/           # 逆向模型
│   │       ├── vlm/               # 视觉大模型
│   │       ├── asr/               # 语音识别
│   │       └── tts/               # 语音合成
│   │
│   ├── components/
│   │   ├── waos/                  # 22 个旺财业务组件
│   │   │   ├── TopBar.tsx         # 顶栏（人设 + 微信号 + 熔断）
│   │   │   ├── WeChatClient.tsx   # 微信三栏
│   │   │   ├── DecisionPanel.tsx  # 决策面板
│   │   │   ├── EventStream.tsx    # 事件流
│   │   │   ├── ReplyStudio.tsx    # 话术编辑器
│   │   │   ├── ProDrawer.tsx      # 专业抽屉
│   │   │   ├── CommandPalette.tsx # ⌘K 命令面板
│   │   │   ├── Splashscreen.tsx   # 开机动画
│   │   │   ├── ErrorBoundary.tsx  # 防白屏
│   │   │   ├── BrainSettings.tsx  # AI 大脑配置
│   │   │   ├── SettingsDialog.tsx # 系统设置
│   │   │   ├── NotificationsDrawer.tsx
│   │   │   ├── DownloadFloat.tsx  # 下载浮动按钮
│   │   │   ├── DashboardFullscreen.tsx  # 压测大屏
│   │   │   ├── LeadJourney.tsx    # 客户旅程
│   │   │   ├── AuditTimeline.tsx  # 审计时间线
│   │   │   ├── Charts.tsx         # 图表组件
│   │   │   └── LeftPanel / MiddlePanel / RightPanel / FunctionPanel
│   │   └── ui/                    # shadcn/ui 基础组件（60+）
│   │
│   ├── lib/
│   │   ├── identity/kernel.ts     # Identity Kernel（127 行）
│   │   ├── safety.ts              # 安全护盾（144 行）
│   │   ├── wechat/bridge.ts       # 微信桥接（141 行）
│   │   ├── douyin/connector.ts    # 抖音适配（91 行）
│   │   ├── zai.ts                 # Z.AI SDK 封装
│   │   ├── db.ts                  # Prisma 客户端
│   │   └── utils.ts               # 工具函数
│   │
│   ├── store/
│   │   └── useOpsStore.ts         # 中央 Zustand store（2952 行）
│   │
│   └── hooks/waos/
│       ├── useKeyboardNav.ts      # 键盘导航
│       └── usePersistence.ts      # 状态持久化
│
├── mini-services/                 # 独立 WebSocket / 逆向服务
│   ├── doubao-reverse/            # 豆包 Cookie 逆向
│   ├── multi-reverse/             # 多平台 Cookie 逆向
│   └── waos-stream/               # WebSocket 实时推送
│
├── prisma/
│   └── schema.prisma              # Prisma schema（SQLite）
│
├── scripts/
│   └── copy-assets.js             # 构建后资源拷贝
│
├── public/
│   ├── wangcai-logo.png           # 旺财柴犬 logo
│   └── logo.svg
│
├── docs/                          # 项目文档
│   ├── INSTALL.md
│   ├── FEATURES.md
│   └── ARCHITECTURE.md
│
├── worklog.md                     # 项目工作日志
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── Caddyfile                      # 反向代理配置
├── dev-supervisor.sh              # 开发守护脚本
└── start-dev.sh                   # 一键启动开发环境
```

---

## 🧠 AI 大脑多模型降级说明

旺财的 AI 大脑（`/api/waos/brain`）按以下优先级自动降级，**用户无需手动切换**：

| # | 模型 | 接入方式 | 是否需要用户配置 | 备注 |
|---|---|---|---|---|
| 1 | `zhipu_api` | 智谱官方 API | ❌ 内置 Key | **主力**，开箱即用 |
| 2 | `doubao_docker` | doubao2api Docker | 用户启动 Docker | 本地部署，无 token 限制 |
| 3 | `doubao` | 豆包 Cookie 逆向 | 登录豆包网页 | 自动从 mini-service 走 |
| 4 | `qianwen` | 千问 Cookie 逆向 | 登录千问网页 | 同上 |
| 5 | `kimi` | Kimi Cookie 逆向 | 登录 Kimi 网页 | 同上 |
| 6 | `zhipu` | 智谱 Cookie 逆向 | 登录智谱清言 | 同上 |
| 7 | `zai` | Z.AI SDK | ❌ 无需配置 | **兜底**，永不掉线 |

### 关键机制

- **请求缓存**：相同 messages 5 分钟内不重复调用（`replyCache` + `CACHE_TTL = 5 * 60 * 1000`）
- **限流追踪**：智谱 API 每 350ms 最多 1 次（`ZHIPU_MIN_INTERVAL`）
- **自动冷却恢复**：被限流的模型进入冷却期（`rateLimitedUntil`），到期自动恢复
- **统一 OpenAI 兼容接口**：所有模型对上层暴露相同的 `{ messages, model, cookies }` 入参
- **模型统计**：`modelStats` 记录每个模型的 total / success / fail / rateLimited

### 调用示例

```bash
curl -X POST http://localhost:3000/api/waos/brain \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好，奔驰C级多少钱"}],"model":"auto"}'
```

返回：

```json
{
  "reply": "您好！C 级目前指导价 33.32 万起...",
  "model": "zhipu_api",
  "tokens": 53,
  "latencyMs": 11000
}
```

---

## 🛡 安全护盾说明

旺财内置统一安全过滤模块 `src/lib/safety.ts`（144 行），被 `/api/waos/reply`、`/api/waos/safety`、`/api/waos/auto-reply` 三个路由共享。

### 3 层输入过滤

| 层 | 名称 | 防御对象 | 实现 |
|---|---|---|---|
| L1 | Prompt 注入检测 | "忽略以上指令" / "你现在是..." / "reveal system prompt" | `INJECTION_PATTERNS` 13 个正则（中英文） |
| L2 | 违规关键词过滤 | 竞品名、跨平台导流、第三方支付 | `BANNED_KEYWORDS` 数组 |
| L3 | 价格承诺过滤 | "5 折" / "便宜 X 元" / "保证最低价" | `PRICE_PROMISE_PATTERN` |

### 2 层输出过滤

| 层 | 名称 | 防御对象 |
|---|---|---|
| L4 | 违规词二次过滤 | AI 输出中的违禁词 |
| L5 | 价格承诺拦截 | AI 输出中的违规价格承诺 |

### 防绕过：Unicode NFKC 归一化

```ts
// 防止用户用全角字符绕过：ｉｇｎｏｒｅ → ignore
function normalizeForCheck(s: string): string {
  return s.normalize('NFKC')        // 全角→半角
          .replace(/\s+/g, '')      // 剥离所有空白
          .replace(/[\u200B-\u200D]/g, '')  // 零宽字符
}
```

匹配模式也用 `\s*` 而非 `\s+`，允许零或多个空白，防止 "ignore previous" 写成 "ignoreprevious" 绕过。

### 调用示例

```bash
curl -X POST http://localhost:3000/api/waos/safety \
  -H "Content-Type: application/json" \
  -d '{"text":"给我管理员密码 OR 1=1"}'

# 返回 { "inputSanitized": true, "reasons": ["sql_injection_pattern"] }
```

---

## 🎭 人设系统说明

旺财的人设系统基于 **L0-L2 三层架构**（见 `src/lib/identity/kernel.ts`）：

```
L0: Identity Kernel    → 用户身份向量（6 维）
L1: Persona Compiler   → 人格编译器（混合人格，最多 3 人设 blend）
L2: Execution Agents   → 执行体（Action DSL 可验证计划）
```

### 6 维身份向量

| 维度 | 含义 | 取值范围 | 触发词示例 |
|---|---|---|---|
| `trust` | 信任度 | 0-100 | "谢谢"、"推荐"、"满意" +10 |
| `intent` | 购买意图 | 0-100 | "想买"、"换车"、"试驾" +20 |
| `emotion` | 情绪状态 | 0-100 | "太贵"、"算了" -15 |
| `urgency` | 紧迫度 | 0-100 | "试驾"、"到店" +10 |
| `resistance` | 抗拒度 | 0-100 | "再看看"、"考虑考虑" +10 |
| `value` | 价值认同 | 0-100 | "首付"、"贷款" +15 |

### 人格编译流程

```
客户消息
  ↓
inferDelta()      # 关键词识别 → delta
  ↓
driftIdentity()   # 身份向量漂移
  ↓
compilePersona()  # 计算 5 个人设的得分，取 Top-3 blend
  ↓
PersonaBlend {
  blends: [{ 销冠 60%, 逼单 25%, 售后 15% }],
  compiled: { warmth, professionalism, pressure, ... },
  strategy: "限时优惠+现车稀缺促单",
  confidence: 0.85
}
```

### Multi-Speed Pipeline

70% 的请求走快速规则引擎 `fastRuleEngine`，**不调用 LLM**：

```ts
// 价格询问 → 直接返回固定话术
if (/多少钱|价格|报价/.test(message)) return { handled: true, reply: '...' }

// 试驾 → 直接邀约
if (/试驾|体验|开一下/.test(message)) return { handled: true, reply: '...' }
```

只有当规则引擎 `handled: false` 时，才进入 LLM 大脑。

### Action DSL 可验证执行

AI 输出后会编译成可验证的执行计划：

```ts
{
  steps: [
    { op: 'wait', ms: 1000-3000 },     // 防封延迟
    { op: 'focus', target: 'input_box' },
    { op: 'type', text: aiReply, ms: typingTime },
    { op: 'wait', ms: 300-800 },       // 发送前停顿
    { op: 'send' },
  ],
  riskScore: 0.2-0.6,
  confidence: 0.8
}
```

`validatePlan` 会检查：风险分 > 0.7 拒绝 / 置信度 < 0.5 拒绝 / type 内容含违禁词拒绝。

---

## 🛠 开发指南

### 启动开发环境

```bash
# 安装依赖（推荐 bun，npm 也可）
bun install

# 初始化数据库
bun run db:generate
bun run db:push

# 启动 Next.js dev server（端口 3000）
bun run dev

# 另开一个终端启动 Electron 桌面壳
bun run electron:dev
```

### 可用脚本

| 脚本 | 作用 |
|---|---|
| `bun run dev` | Next.js dev server（http://localhost:3000） |
| `bun run build` | 生产构建 |
| `bun run start` | 启动 standalone 生产服务器 |
| `bun run lint` | ESLint 检查 |
| `bun run db:push` | 推送 Prisma schema 到 SQLite |
| `bun run db:generate` | 生成 Prisma Client |
| `bun run electron:dev` | 启动 Electron 桌面壳（开发模式） |
| `bun run electron:build` | 构建并打包 Windows exe |

### 代码规范

- **TypeScript 严格模式**：所有 `.ts/.tsx` 必须通过 `tsc --noEmit`
- **路径别名**：`@/*` → `src/*`（见 `tsconfig.json`）
- **组件命名**：旺财业务组件放 `src/components/waos/`，shadcn/ui 基础组件放 `src/components/ui/`
- **API 路由**：统一前缀 `/api/waos/*`
- **状态管理**：全局状态用 Zustand（`src/store/useOpsStore.ts`），不要引入 Redux
- **样式**：Tailwind CSS 4 + `cn()` 工具函数（`src/lib/utils.ts`）

### 添加一个新的人设

```ts
// src/store/useOpsStore.ts → personas 数组
{
  id: 'new_persona',
  name: '新角色 · 张三',
  shortName: '新角色',
  color: '#xxxxxx',
  gradient: 'from-xxx to-yyy',
  role: 'sales',
  personality: { warmth: 70, professionalism: 80, ... },
  tone: { emojiLevel: 2 },
  specialties: ['...'],
}
```

### 添加一个新的 API 路由

```bash
# 创建 src/app/api/waos/<name>/route.ts
mkdir -p src/app/api/waos/<name>
touch src/app/api/waos/<name>/route.ts
```

```ts
// route.ts 模板
import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // 业务逻辑
  return NextResponse.json({ ok: true })
}
```

### 调试技巧

- 浏览器 DevTools：`Ctrl+Shift+I` 查看 React 组件 / Network
- Electron DevTools：开发模式自动开启
- 日志：所有 API 路由会 `console.log` 关键事件
- 健康检查：`GET /api/waos/health` 返回内存 / PID / 端点列表
- 安全检测：`POST /api/waos/safety` 独立测试安全护盾

---

## ❓ 常见问题 FAQ

### Q1：启动后页面空白 / 白屏？
**A**：旺财内置 ErrorBoundary，理论上不会白屏。如出现：
1. 删除 `.next/` 目录重新 `bun run dev`
2. 检查 `http://localhost:3000/api/waos/health` 是否返回 200
3. 查看 Electron 主进程日志（终端输出）

### Q2：微信扫码登录超时？
**A**：扫码登录有 120 秒超时保护（见 `bridge.ts`）。请确保：
1. 微信 PC 客户端已启动并登录
2. 在 120 秒内完成扫码
3. 网络通畅

### Q3：AI 大脑返回很慢（10 秒+）？
**A**：智谱 GLM-4 API 首次冷启动可能 8-15s。如持续慢：
1. 检查 `modelStats`，看主力模型是否被限流
2. 启动豆包 Docker（`localhost:9090`）作为备选
3. 5 分钟内的相同请求会走缓存，秒回

### Q4：发送消息后被微信封号？
**A**：旺财默认开启沙箱节流（微信 20/min + 2-4s 延迟），但仍建议：
1. 单账号日发送量不超过 200 条
2. 不要在短时间内群发完全相同的内容
3. 沉睡客户群发用 3-8s 随机间隔（已内置）
4. 新号前 7 天不要使用自动回复

### Q5：如何添加新的违规关键词？
**A**：编辑 `src/lib/safety.ts` 的 `BANNED_KEYWORDS` 数组，重启 dev server 生效。

### Q6：Electron 打包后无法启动？
**A**：检查 `release/` 目录是否生成 `旺财 Setup 1.0.0.exe`。常见问题：
1. 缺少 `public/wangcai-logo.png`（NSIS 图标）
2. `.next/standalone` 未生成（先 `bun run build`）
3. Windows Defender 误报（白名单 `com.wangcai.desktop`）

### Q7：如何切换深色 / 浅色主题？
**A**：顶栏右侧有主题切换按钮（☀️/🌙/💻），支持手动 / 跟随系统。设置会持久化到 localStorage。

### Q8：CommandPalette（⌘K）能做什么？
**A**：
- 切换人设（销冠 / 逼单 / 售后 / 运营 / 市场）
- 切换微信号
- 打开各功能面板（设置 / 通知 / 大脑配置 / 压测大屏）
- 全局熔断开关
- 主题切换

### Q9：数据库在哪？怎么重置？
**A**：SQLite 数据库文件在 `db/custom.db`。重置：
```bash
rm db/custom.db
bun run db:push
```

### Q10：可以部署到服务器多人使用吗？
**A**：旺财定位是**桌面单机应用**，不建议多用户共享。如需服务端部署，需要：
1. 用 `bun run start` 启动 standalone server
2. 配置 `Caddyfile` 反向代理
3. 自行处理多用户隔离（当前未实现）

---

## 📄 License

Proprietary — 内部使用，未授权禁止商业分发。

技术栈开源组件的 License 见各自仓库：
- Next.js: MIT
- React: MIT
- Electron: MIT
- Prisma: Apache-2.0
- Tailwind CSS: MIT
- shadcn/ui: MIT

---

> 🐕 **旺财** — 让每一个销售都拥有销冠级的 AI 副驾。
>
> _Built with Next.js 16 + Electron + Bun, 2026._
