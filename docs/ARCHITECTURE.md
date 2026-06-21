# 🏗 旺财技术架构

> 本文档说明旺财（WAOS）的分层架构、模块职责、数据流走向。
> 适合开发者阅读，普通用户可跳过。

---

## 📑 目录

- [整体架构](#-整体架构)
- [前端层](#-前端层react--zustand-store--22-个旺财组件)
- [API 层](#-api-层13-个-nextjs-api-route)
- [业务逻辑层](#-业务逻辑层identity-kernel--safety--bridge)
- [Electron 层](#-electron-层main--3-个-preload--sandbox--ui-actuation)
- [Mini services 层](#-mini-services-层doubao-reverse--multi-reverse--waos-stream)
- [数据层](#-数据层prisma--sqlite)
- [数据流走向](#-数据流走向)
- [关键模块代码量](#-关键模块代码量)

---

## 🎯 整体架构

旺财采用 **6 层架构**，从上到下依次为桌面壳、前端、API、业务逻辑、Mini services、数据层。

### ASCII 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🖥️  Electron 桌面壳 (electron/)                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ main.js (542 行)                                                 │    │
│  │   ├─ 启动 waos-stream (port 3003)                                │    │
│  │   ├─ 启动 Next.js (dev:3000 / prod:standalone)                   │    │
│  │   ├─ 创建 BrowserWindow                                          │    │
│  │   └─ IPC: wechat-login / douyin-login / video-login              │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ sandbox.js (214 行)                                              │    │
│  │   ├─ 节流: 微信 20/min, 抖音 15/min, 视频号 10/min              │    │
│  │   ├─ 防封延迟 2-4s + 随机抖动                                    │    │
│  │   ├─ 失败重试 3 次指数退避                                       │    │
│  │   └─ 执行队列串行化                                              │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ ui-actuation.js (363 行)                                         │    │
│  │   ├─ BrowserView: 微信 wx.qq.com                                 │    │
│  │   ├─ BrowserView: 抖音 douyin.com                                │    │
│  │   └─ BrowserView: 视频号 channels.weixin.qq.com                  │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ Preloads (3 个 DOM 注入脚本)                                     │    │
│  │   ├─ wechat-preload.js   → 消息读取 / 发送 / 评论                │    │
│  │   ├─ douyin-preload.js   → 评论抓取 / 私信 / 点赞                │    │
│  │   └─ video-preload.js    → 评论截流 / 私信                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ loadURL(http://localhost:3000)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🎨 前端层 (src/) — React 19 + Next.js 16 App Router                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ app/page.tsx — 三栏布局主页面                                    │    │
│  │   ├─ Splashscreen (开机动画)                                     │    │
│  │   ├─ TopBar (顶栏：人设 + 微信号 + 熔断)                          │    │
│  │   ├─ WeChatClient (左侧微信三栏, ErrorBoundary 包裹)              │    │
│  │   ├─ DecisionPanel (右侧决策面板, ErrorBoundary 包裹)             │    │
│  │   ├─ EventStream (底部事件流)                                    │    │
│  │   └─ ReplyStudio / CommandPalette / NotificationsDrawer /        │    │
│  │      SettingsDialog / ProDrawer / BrainSettings / DownloadFloat  │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ store/useOpsStore.ts (2952 行) — 中央 Zustand store              │    │
│  │   ├─ personas (5 个人设)                                         │    │
│  │   ├─ wechatAccounts (3 个微信号)                                 │    │
│  │   ├─ leads (客户线索)                                            │    │
│  │   ├─ events (实时事件流)                                         │    │
│  │   ├─ customerMemory L1-L4 (客户记忆引擎)                         │    │
│  │   └─ metrics (压测指标)                                          │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ hooks/waos/                                                      │    │
│  │   ├─ useKeyboardNav.ts (⌘K / 数字快捷键)                          │    │
│  │   └─ usePersistence.ts (localStorage 持久化)                     │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ components/waos/ (22 个业务组件)                                  │    │
│  │ components/ui/ (60+ shadcn/ui 基础组件)                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ fetch /api/waos/*
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🔌 API 层 (src/app/api/waos/) — 13 个 Next.js API route                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ brain/           AI 大脑多模型聚合 (主路由 465 行)                │    │
│  │   ├─ route.ts             POST /api/waos/brain                   │    │
│  │   ├─ verify/route.ts      GET  /api/waos/brain/verify            │    │
│  │   ├─ extract/route.ts     POST /api/waos/brain/extract           │    │
│  │   └─ proxy/[...path]/     代理转发                               │    │
│  │                                                                  │    │
│  │ reply/          POST 安全回复 (调用 safety)                       │    │
│  │ safety/         POST 安全检测 (3+2 层过滤)                        │    │
│  │ auto-reply/     POST 全渠道自动回复 (8 动作)                      │    │
│  │ wechat/         微信桥接 (调用 WeChatBridge)                      │    │
│  │ douyin/         抖音连接器                                        │    │
│  │ leads/          线索管理 CRUD                                     │    │
│  │ metrics/        压测指标聚合 (12 维度 35 项)                      │    │
│  │ health/         GET 健康检查 (内存/PID/端点)                      │    │
│  │ llm/            LLM 通用入口                                      │    │
│  │ reverse/        逆向模型代理                                      │    │
│  │ vlm/            视觉大模型                                        │    │
│  │ asr/            语音识别                                          │    │
│  │ tts/            语音合成                                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ 调用
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚙️ 业务逻辑层 (src/lib/)                                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ identity/kernel.ts (127 行) — Identity Kernel 身份核              │    │
│  │   ├─ IdentityVector (6 维向量)                                   │    │
│  │   ├─ driftIdentity (身份漂移)                                    │    │
│  │   ├─ inferDelta (关键词识别)                                     │    │
│  │   ├─ compilePersona (人格编译器, Top-3 blend)                     │    │
│  │   ├─ fastRuleEngine (快速规则引擎, 70% 不走 LLM)                  │    │
│  │   ├─ compileActionPlan (Action DSL 编译)                         │    │
│  │   └─ validatePlan (执行计划验证)                                 │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ safety.ts (144 行) — SafetyShield 安全护盾                       │    │
│  │   ├─ INJECTION_PATTERNS (13 个注入正则)                          │    │
│  │   ├─ BANNED_KEYWORDS (违规关键词)                                │    │
│  │   ├─ PRICE_PROMISE_PATTERN (价格承诺)                            │    │
│  │   ├─ normalizeForCheck (Unicode NFKC 归一化)                     │    │
│  │   ├─ sanitizeInput (3 层输入过滤)                                │    │
│  │   └─ filterOutput (2 层输出过滤)                                 │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ wechat/bridge.ts (141 行) — WeChatBridge 微信桥接                 │    │
│  │   ├─ ClawBot SDK (weixin-agent-sdk) 动态 import                  │    │
│  │   ├─ 120s 超时保护                                               │    │
│  │   ├─ conversations / identities 状态管理                         │    │
│  │   └─ broadcast (沉睡客户群发)                                    │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ douyin/connector.ts (91 行) — DouyinConnector 抖音适配            │    │
│  │   ├─ 接口定义 (DouyinMessage / DouyinComment)                    │    │
│  │   ├─ MockDouyinConnector (模拟数据 + 种子评论)                   │    │
│  │   └─ 预留真实抖音 API 接入点                                     │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ zai.ts — Z.AI SDK 封装 (兜底大模型)                              │    │
│  │ db.ts  — Prisma Client 单例                                      │    │
│  │ utils.ts — cn() 等工具函数                                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ fetch / child_process
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🧪 Mini services 层 (mini-services/) — 独立子进程服务                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ doubao-reverse/   豆包 Cookie 逆向 (本地 HTTP)                   │    │
│  │   ├─ index.ts           Bun HTTP server                          │    │
│  │   └─ 路由: /v1/chat/completions (OpenAI 兼容)                    │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ multi-reverse/   多平台 Cookie 逆向 (豆包/千问/Kimi/智谱)         │    │
│  │   ├─ index.ts           Bun HTTP server                          │    │
│  │   └─ 路由: /v1/chat/completions?model=<platform>                 │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ waos-stream/     WebSocket 实时推送 (port 3003)                  │    │
│  │   ├─ index.ts           socket.io server                         │    │
│  │   └─ 事件: message / event / metric / alert                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ 持久化
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  💾 数据层 — Prisma + SQLite                                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ prisma/schema.prisma                                             │    │
│  │   ├─ model User (id, email, name, timestamps)                    │    │
│  │   └─ model Post (id, title, content, published, authorId, ts)    │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ db/custom.db  SQLite 数据库文件                                  │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │ src/lib/db.ts  Prisma Client 单例                                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 前端层（React + Zustand store + 22 个旺财组件）

### 技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| Next.js | ^16.1.1 | App Router 框架 |
| React | ^19.0.0 | UI 库（Concurrent Mode） |
| TypeScript | ^5 | 类型安全 |
| Zustand | ^5.0.6 | 全局状态管理 |
| Tailwind CSS | ^4 | 原子化样式 |
| shadcn/ui | latest | 基础组件库（基于 Radix UI） |
| framer-motion | ^12.23.2 | 动画 |
| recharts | ^2.15.4 | 图表 |
| react-resizable-panels | ^3.0.3 | 可调分栏布局 |
| next-themes | ^0.4.6 | 主题切换 |
| cmdk | ^1.1.1 | CommandPalette |
| sonner | ^2.0.6 | Toast 通知 |
| vaul | ^1.1.2 | Drawer |
| lucide-react | ^0.525.0 | 图标 |

### 主页面布局（src/app/page.tsx）

```
┌──────────────────────────────────────────────────────────────────┐
│  TopBar  (人设 + 微信号 + 6 数字快捷键 + 线索/队列 + 连接状态)    │  56px
├────────────────────────────────┬─────────────────────────────────┤
│                                │                                 │
│  WeChatClient (左, ErrorBoundary)│  DecisionPanel (右, ErrorBoundary)│
│                                │                                 │
│  ┌────────┬──────────────┐     │  ┌───────────────────────────┐  │
│  │ 会话   │ 聊天窗口      │     │  │ 客户身份向量 (6 维)        │  │
│  │ 列表   │              │     │  ├───────────────────────────┤  │
│  │ 6 条   │ 林晚秋: ...   │     │  │ 推荐人设 blend             │  │
│  │        │ AI: ...       │     │  ├───────────────────────────┤  │
│  │        │              │     │  │ 推荐话术 (人设风格)         │  │
│  │        │ [输入框]      │     │  ├───────────────────────────┤  │
│  │        │              │     │  │ [自动回复][优先][转人工][完成]│  │
│  └────────┴──────────────┘     │  └───────────────────────────┘  │
│                                │                                 │
├────────────────────────────────┴─────────────────────────────────┤
│  EventStream  (实时事件流, 140px 高)                              │  140px
└──────────────────────────────────────────────────────────────────┘

浮层组件（z-index 高）:
- Splashscreen (开机动画, 启动后 3s 消失)
- ReplyStudio (话术编辑器, 抽屉式)
- CommandPalette (⌘K 命令面板, 弹窗式)
- NotificationsDrawer (通知抽屉, 右侧滑出)
- SettingsDialog (系统设置, 弹窗)
- ProDrawer (专业模式抽屉)
- BrainSettings (AI 大脑配置, 弹窗)
- DownloadFloat (右下角下载浮动按钮)
- DashboardFullscreen (压测大屏, 全屏)
```

### 22 个旺财业务组件

| 组件 | 文件 | 职责 |
|---|---|---|
| TopBar | `TopBar.tsx` | 顶栏：人设切换 + 微信号切换 + 6 数字快捷键 + 全局熔断 + 主题切换 |
| WeChatClient | `WeChatClient.tsx` | 左侧微信三栏（会话列表 + 聊天窗口 + 输入框） |
| DecisionPanel | `DecisionPanel.tsx` | 右侧决策面板（身份向量 + 推荐人设 + 推荐话术 + 4 动作按钮） |
| EventStream | `EventStream.tsx` | 底部事件流（实时显示收发消息、安全拦截、沙箱执行） |
| ReplyStudio | `ReplyStudio.tsx` | 话术编辑器（5 个人设模板 + 自定义） |
| ProDrawer | `ProDrawer.tsx` | 专业模式抽屉（高级功能入口） |
| CommandPalette | `CommandPalette.tsx` | ⌘K 命令面板（快速搜索 + 执行命令） |
| NotificationsDrawer | `NotificationsDrawer.tsx` | 通知抽屉（新消息 + 告警 + 异常） |
| SettingsDialog | `SettingsDialog.tsx` | 系统设置对话框 |
| DownloadFloat | `DownloadFloat.tsx` | 右下角下载浮动按钮 |
| BrainSettings | `BrainSettings.tsx` | AI 大脑配置（模型选择 + Cookie 管理） |
| Splashscreen | `Splashscreen.tsx` | 开机动画（旺财柴犬头像 + 进度条） |
| ErrorBoundary | `ErrorBoundary.tsx` | 错误边界（防白屏） |
| DashboardFullscreen | `DashboardFullscreen.tsx` | 压测大屏（12 维度 35 项指标） |
| LeadJourney | `LeadJourney.tsx` | 客户旅程时间线 |
| AuditTimeline | `AuditTimeline.tsx` | 审计时间线 |
| Charts | `Charts.tsx` | 图表组件（基于 recharts） |
| LeftPanel | `LeftPanel.tsx` | 左侧面板容器 |
| MiddlePanel | `MiddlePanel.tsx` | 中间面板容器 |
| RightPanel | `RightPanel.tsx` | 右侧面板容器 |
| FunctionPanel | `FunctionPanel.tsx` | 功能面板（视频号截流等） |

### 中央 Zustand Store（src/store/useOpsStore.ts，2952 行）

```ts
interface OpsStore {
  // ─── 人设系统 ───
  personas: Persona[]                          // 5 个奔驰销售人设
  activePersonaId: string                      // 当前激活的人设
  setPersona: (id: string) => void

  // ─── 微信号管理 ───
  wechatAccounts: WeChatAccount[]              // 3 个微信号
  activeWechatId: string
  switchWechat: (id: string) => void

  // ─── 客户线索 ───
  leads: Lead[]                                // 客户线索池
  activeLeadId: string
  selectLead: (id: string) => void

  // ─── 客户记忆引擎 L1-L4 ───
  customerMemory: {
    l1_short: Message[]                        // 短期（最近 30 条）
    l2_profile: { key, value }[]               // 长期画像（预算/城市/孩子）
    l3_semantic: { memory, score }[]           // 语义检索
    l4_events: Event[]                         // 关键事件
  }

  // ─── 事件流 ───
  events: OpsEvent[]                           // 实时事件
  pushEvent: (e: OpsEvent) => void

  // ─── 连接状态 ───
  connection: 'connected' | 'connecting' | 'reconnecting' | 'disconnected'
  connect: () => void
  disconnect: () => void

  // ─── 压测指标 ───
  metrics: Metrics                             // 12 维度 35 项
  refreshMetrics: () => Promise<void>

  // ─── 全局熔断 ───
  circuitBreaker: boolean
  toggleBreaker: () => void

  // ─── 主题 ───
  theme: 'light' | 'dark' | 'system'
  setTheme: (t: Theme) => void
}
```

---

## 🔌 API 层（13 个 Next.js API route）

### 路由清单

| 方法 | 路径 | 文件 | 职责 |
|---|---|---|---|
| POST | `/api/waos/brain` | `brain/route.ts` (465 行) | AI 大脑多模型聚合（主路由） |
| GET | `/api/waos/brain/verify` | `brain/verify/route.ts` | 校验各模型可用性 |
| POST | `/api/waos/brain/extract` | `brain/extract/route.ts` | 消息抽取 |
| ALL | `/api/waos/brain/proxy/[...path]` | `brain/proxy/[...path]/route.ts` | 代理转发 |
| POST | `/api/waos/reply` | `reply/route.ts` | 安全回复（调用 safety） |
| POST | `/api/waos/safety` | `safety/route.ts` | 安全检测（3+2 层过滤） |
| POST | `/api/waos/auto-reply` | `auto-reply/route.ts` | 全渠道自动回复（8 动作） |
| POST | `/api/waos/wechat` | `wechat/route.ts` | 微信桥接 |
| POST | `/api/waos/douyin` | `douyin/route.ts` | 抖音连接器 |
| GET | `/api/waos/leads` | `leads/route.ts` | 线索管理 CRUD |
| GET | `/api/waos/metrics` | `metrics/route.ts` | 压测指标聚合 |
| GET | `/api/waos/health` | `health/route.ts` | 健康检查（内存/PID/端点） |
| POST | `/api/waos/llm` | `llm/route.ts` | LLM 通用入口 |
| POST | `/api/waos/reverse` | `reverse/route.ts` | 逆向模型代理 |
| POST | `/api/waos/vlm` | `vlm/route.ts` | 视觉大模型 |
| POST | `/api/waos/asr` | `asr/route.ts` | 语音识别 |
| POST | `/api/waos/tts` | `tts/route.ts` | 语音合成 |

> 💡 共 **17 个 route 文件**（含 brain 子路由），主路由 `/api/waos/brain/route.ts` 是核心，465 行实现多模型降级、缓存、限流。

### /api/waos/brain 调用流程

```
POST /api/waos/brain { messages, model?, cookies? }
  │
  ├─ 1. 检查缓存 (replyCache, 5 分钟 TTL)
  │     └─ 命中 → 直接返回 { reply, cached: true }
  │
  ├─ 2. 计算可用模型 (isModelAvailable)
  │     ├─ 排除冷却中的模型 (rateLimitedUntil > now)
  │     ├─ Cookie 模型需有对应 Cookie
  │     └─ zhipu_api / doubao_docker / zai 不需 Cookie
  │
  ├─ 3. 按优先级轮询降级
  │     zhipu_api → doubao_docker → doubao → qianwen → kimi → zhipu → zai
  │     │
  │     ├─ zhipu_api: 智谱 GLM-4 官方 API (内置 Key)
  │     │   └─ 限流 350ms 间隔
  │     │
  │     ├─ doubao_docker: 调用 localhost:9090
  │     │   └─ doubao2api Docker 服务
  │     │
  │     ├─ doubao / qianwen / kimi / zhipu:
  │     │   └─ 调用 mini-services/multi-reverse
  │     │       └─ Cookie 逆向 → OpenAI 兼容接口
  │     │
  │     └─ zai (兜底): 调用 src/lib/zai.ts
  │         └─ Z.AI SDK，永不失败
  │
  ├─ 4. 失败处理
  │     ├─ 限流 → 记录 modelStats[model].rateLimitedUntil = now + 60s
  │     ├─ 网络/超时 → 记录 lastError
  │     └─ 自动尝试下一个模型
  │
  ├─ 5. 成功处理
  │     ├─ 更新 modelStats: { total++, success++ }
  │     ├─ 写入缓存 replyCache
  │     └─ 返回 { reply, model, tokens, latencyMs }
  │
  └─ 返回 NextResponse.json(...)
```

---

## ⚙️ 业务逻辑层（Identity Kernel + Safety + Bridge）

### Identity Kernel（src/lib/identity/kernel.ts，127 行）

```
                  ┌─────────────────┐
客户消息 ────────►│  inferDelta()   │  关键词识别 → delta
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ driftIdentity() │  身份向量漂移 (clamp 0-100)
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │compilePersona() │  人格编译 (Top-3 blend)
                  └────────┬────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       PersonaBlend   strategy      confidence
       (混合权重)      (推荐策略)    (置信度)
                           │
                           ▼
                  ┌─────────────────┐
                  │ AI 大脑调用      │  带上 personaContext
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │compileActionPlan│  Action DSL 编译
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ validatePlan()  │  风险分 + 置信度 + 安全
                  └────────┬────────┘
                           │
                    ┌──────┴──────┐
                    │             │
                  通过           拒绝
                    │             │
                    ▼             ▼
               执行发送      "抱歉，我需要确认一下"
```

### Safety Shield（src/lib/safety.ts，144 行）

```
输入文本
  │
  ▼
┌──────────────────────────────────────────┐
│ normalizeForCheck()                       │
│   1. NFKC 归一化 (全角→半角)              │
│   2. 剥离所有空白 (含全角空格)             │
│   3. 去除零宽字符 (\u200B-\u200D)         │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│ Layer 1: INJECTION_PATTERNS (13 个正则)  │
│   - "ignore previous instructions"       │
│   - "忽略以上指令"                        │
│   - "system:"                             │
│   - "you are now..."                      │
│   - ... 共 13 个                          │
└──────────────┬───────────────────────────┘
               │ 命中 → 拦截
               │ 未命中 ↓
┌──────────────────────────────────────────┐
│ Layer 2: BANNED_KEYWORDS (8 个关键词)    │
│   - 竞品A / 竞品B                         │
│   - 加微信群 / 加我私人微信                │
│   - 支付宝转账                            │
│   - 其他平台 / 淘宝链接 / 拼多多           │
└──────────────┬───────────────────────────┘
               │ 命中 → 拦截
               │ 未命中 ↓
┌──────────────────────────────────────────┐
│ Layer 3: PRICE_PROMISE_PATTERN           │
│   - 5 折 / 便宜 5000 元 / 立减 3000       │
│   - 保证最低价                            │
└──────────────┬───────────────────────────┘
               │ 命中 → 拦截
               │ 未命中 → 放行进入 LLM
               ▼
        [LLM 生成回复]
               │
               ▼
┌──────────────────────────────────────────┐
│ Layer 4: 输出违规词二次过滤               │
└──────────────┬───────────────────────────┘
               │ 命中 → 替换为兜底话术
               │ 未命中 ↓
┌──────────────────────────────────────────┐
│ Layer 5: 输出价格承诺拦截                 │
└──────────────┬───────────────────────────┘
               │ 命中 → 替换为兜底话术
               │ 未命中 → 发送
               ▼
           最终回复
```

### WeChatBridge（src/lib/wechat/bridge.ts，141 行）

```
┌────────────────────────────────────────────┐
│ WeChatBridge (单例, getWeChatBridge())     │
├────────────────────────────────────────────┤
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │ WangcaiAgent (内部 agent)            │  │
│  │   ├─ conversations: Map<id, msg[]>   │  │
│  │   ├─ identities: Map<id, vector>     │  │
│  │   └─ chat(request) {                 │  │
│  │       1. fastRuleEngine (70% 命中)   │  │
│  │       2. inferDelta + driftIdentity  │  │
│  │       3. compilePersona              │  │
│  │       4. fetch /api/waos/brain       │  │
│  │       5. compileActionPlan           │  │
│  │       6. validatePlan                │  │
│  │       7. 返回 { text: reply }        │  │
│  │     }                                │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  login()    → ClawBot SDK 扫码 (120s 超时) │
│  start()    → 启动消息监听                  │
│  broadcast()→ 沉睡客户群发                  │
│  logout()   → 退出登录                      │
│                                            │
└────────────────────────────────────────────┘
```

### DouyinConnector（src/lib/douyin/connector.ts，91 行）

```
DouyinConnector (接口)
   ▲
   │ implements
   │
MockDouyinConnector (当前实现, 含种子数据)
   │
   │ 预留接入点：
   ├─ 抖音开放平台 API (需企业认证)
   ├─ 抖音网页版 DOM 注入 (Electron BrowserView)
   └─ 抖音私信/评论 webhook (企业号)
```

---

## 🖥️ Electron 层（main + 3 个 preload + sandbox + ui-actuation）

### 主进程职责（electron/main.js，542 行）

```
app.whenReady()
  │
  ├─ 1. startStreamService()  ← 启动 waos-stream (port 3003)
  │     └─ spawn('bun', ['run', 'dev'], { cwd: mini-services/waos-stream })
  │
  ├─ 2. startNextJs()         ← 启动 Next.js
  │     ├─ dev: spawn('bun', ['run', 'dev'])  → http://localhost:3000
  │     └─ prod: spawn('node', ['.next/standalone/server.js'])
  │
  ├─ 3. waitForServer('http://localhost:3000', 60000)
  │     └─ 轮询直到返回 200/302
  │
  ├─ 4. createMainWindow()
  │     ├─ new BrowserWindow({ width: 1440, height: 900 })
  │     ├─ loadURL('http://localhost:3000')
  │     ├─ preload: electron/preload.js (主窗口 preload)
  │     └─ 开发模式自动打开 DevTools
  │
  ├─ 5. 注册 IPC handlers
  │     ├─ 'wechat-login' → 调用 WeChatBridge.login()
  │     ├─ 'douyin-login' → 创建抖音 BrowserView
  │     ├─ 'video-login' → 创建视频号 BrowserView
  │     └─ 'broadcast' → 调用 WeChatBridge.broadcast()
  │
  └─ 6. app.on('window-all-closed') → quit (Windows/Linux)
```

### Sandbox 执行沙箱（electron/sandbox.js，214 行）

```
enqueue(action)
   │
   ▼
┌────────────────────────────┐
│ 执行队列 (串行化)           │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│ checkRateLimit(platform)   │
│  ├─ 微信: 20/min, 2s 间隔  │
│  ├─ 抖音: 15/min, 3s 间隔  │
│  └─ 视频号: 10/min, 4s 间隔│
└────────────┬───────────────┘
             │ 允许
             ▼
┌────────────────────────────┐
│ sleep(minDelay + 0-2s 随机) │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│ withRetry(action, 3 次)    │
│  ├─ try: action.run()      │
│  ├─ catch: sleep(2^i * 2s) │
│  └─ 最后一次失败: throw     │
└────────────┬───────────────┘
             │
             ▼
        resolve/reject
```

### UI Actuation（electron/ui-actuation.js，363 行）

每个平台用一个 BrowserView 加载网页版 + preload 脚本注入 DOM：

```
┌──────────────────────────────────────────────────────────────┐
│ BrowserWindow (主窗口)                                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Next.js UI (http://localhost:3000)                     │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────┐  ┌──────────────────────┐         │
│  │ BrowserView: wechat   │  │ BrowserView: douyin   │  ...    │
│  │  url: wx.qq.com       │  │  url: douyin.com      │         │
│  │  preload: wechat-     │  │  preload: douyin-     │         │
│  │           preload.js  │  │           preload.js  │         │
│  └──────────────────────┘  └──────────────────────┘         │
└──────────────────────────────────────────────────────────────┘

preload 脚本职责:
  - 监听 DOM 变化 (MutationObserver)
  - 提取消息 / 评论
  - 注入输入框内容
  - 触发发送按钮
  - 通过 ipcRenderer 上报主进程
```

### 平台 DOM 选择器配置

```js
// electron/ui-actuation.js
const PLATFORMS = {
  wechat: {
    url: 'https://wx.qq.com/',
    preloadScript: 'wechat-preload.js',
    selectors: {
      chatList: '.chat-list .chat-item',
      activeChat: '.chat-item.active',
      messageList: '.message-list .message',
      inputBox: '.edit-area',
      sendBtn: '.send-btn',
      contactName: '.nickname',
      messageText: '.message-content .text',
      messageSender: '.message-sender',
    },
  },
  douyin: {
    url: 'https://www.douyin.com/',
    preloadScript: 'douyin-preload.js',
    selectors: {
      commentList: '.comment-item',
      commentText: '.comment-text',
      commentUser: '.comment-user .name',
      videoTitle: '.video-title',
      videoPlayCount: '.video-play-count',
      dmButton: '.dm-button',
      dmInput: '.dm-input',
      dmSend: '.dm-send',
    },
  },
  video: {
    url: 'https://channels.weixin.qq.com/',
    preloadScript: 'video-preload.js',
    selectors: { /* 类似 */ },
  },
}
```

> 💡 DOM 选择器可被 **UI 自愈系统** 动态更新，当微信网页版改版时无需发版修复。

---

## 🧪 Mini services 层（doubao-reverse / multi-reverse / waos-stream）

三个独立的 Bun HTTP/WebSocket 服务，作为子进程启动。

### doubao-reverse（豆包 Cookie 逆向）

```
mini-services/doubao-reverse/
├── package.json
└── index.ts            Bun HTTP server (port 9091)

路由:
  POST /v1/chat/completions   (OpenAI 兼容)
    body: { messages, cookie }
    流程:
      1. 使用 Cookie 调用豆包网页接口
      2. 解析流式响应
      3. 转换为 OpenAI 格式返回

调用方:
  - /api/waos/brain (model='doubao')
```

### multi-reverse（多平台 Cookie 逆向）

```
mini-services/multi-reverse/
├── package.json
└── index.ts            Bun HTTP server (port 9092)

路由:
  POST /v1/chat/completions?model=<platform>
    platform: doubao | qianwen | kimi | zhipu
    body: { messages, cookie }
    流程:
      1. 根据 model 选择对应平台逆向逻辑
      2. 使用 Cookie 调用各平台网页接口
      3. 转换为 OpenAI 格式返回

调用方:
  - /api/waos/brain (model='qianwen' | 'kimi' | 'zhipu')
```

### waos-stream（WebSocket 实时推送）

```
mini-services/waos-stream/
├── package.json
├── bun.lock
└── index.ts            socket.io server (port 3003)

事件:
  'message'       客户新消息
  'event'         系统事件 (沙箱执行/安全拦截)
  'metric'        压测指标更新
  'alert'         告警通知
  'connection'    连接状态变化

启动方:
  - Electron main.js 自动拉起 (startStreamService)
  - 开发模式也可独立启动: cd mini-services/waos-stream && bun run dev
```

---

## 💾 数据层（Prisma + SQLite）

### Schema（prisma/schema.prisma）

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")  // file:./custom.db
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Prisma Client 单例（src/lib/db.ts）

```ts
import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient

declare global {
  namespace globalThis {
    var prisma: PrismaClient | undefined
  }
}

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient()
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient()
  }
  prisma = global.prisma
}

export default prisma
```

### 数据库文件

```
db/
└── custom.db    SQLite 数据库文件 (启动时自动创建)
```

> 💡 当前 Prisma schema 较基础（User + Post），主要业务数据存储在 Zustand store（内存）+ localStorage（前端持久化）。如需扩展持久化，可在 schema.prisma 添加 model 后执行 `bun run db:push`。

---

## 🔄 数据流走向

### 场景 1：客户发来微信消息 → 自动回复

```
[客户手机] 微信发送 "C级多少钱"
        │
        ▼
[微信服务器] 推送消息
        │
        ▼
[Electron BrowserView: wx.qq.com]
        │
        ▼
[wechat-preload.js] DOM MutationObserver 捕获
        │ ipcRenderer.send('wechat-message', {...})
        ▼
[electron/main.js] IPC handler
        │
        ▼
[WeChatBridge.chat()] 调用 WangcaiAgent
        │
        ├─ Step 1: fastRuleEngine("C级多少钱")
        │   └─ 命中价格规则 → 直接返回固定话术 (70% 走这)
        │
        └─ Step 2 (未命中): AI 大脑调用
            │
            ├─ inferDelta("C级多少钱") → { intent: +15, value: +10 }
            ├─ driftIdentity → 更新客户身份向量
            ├─ compilePersona → 推荐 Top-3 人设 blend
            │
            ├─ fetch POST /api/waos/brain
            │   │
            │   ├─ 检查缓存 (5min TTL)
            │   ├─ 按优先级轮询: zhipu_api → doubao_docker → ... → zai
            │   ├─ 智谱 GLM-4 API 调用 (内置 Key, 350ms 限流)
            │   └─ 返回 { reply, model: 'zhipu_api', tokens: 53 }
            │
            ├─ safety.filterOutput(reply) 2 层输出过滤
            ├─ compileActionPlan(reply, confidence) → Action DSL
            ├─ validatePlan → 风险分 + 置信度 + 安全检查
            │
            └─ 通过 → sandbox.enqueue(action)
                │
                ├─ checkRateLimit('wechat') 20/min
                ├─ sleep(2000 + Math.random() * 2000) 2-4s 防封
                ├─ wechat-preload.js 注入输入框 + 点击发送
                │
                └─ 成功 → 客户收到回复
```

### 场景 2：视频号评论截流

```
[运营人员] 顶栏点击 "视频获客"
        │
        ▼
[Electron BrowserView: channels.weixin.qq.com]
        │
        ▼
[video-preload.js] 抓取视频列表
        │
        ▼
[ui-actuation.js] 按 videoPlayCount 倒序排序
        │
        ▼
[运营] 选中高播放视频
        │
        ▼
[video-preload.js] 抓取评论列表
        │
        ▼
[前端] 计算意向评分 (intentScore)
   ├─ 询价关键词: +30
   ├─ 换车意向: +25
   ├─ 竞品对比: +20
   └─ 试驾体验: +25
        │
        ▼
[前端] 按意向分排序 → Top-N 进入私信队列
        │
        ▼
[运营] 勾选 + 选择人设 (🎬 运营·陈墨白)
        │
        ▼
[沙箱] enqueue(action) 串行执行
   ├─ checkRateLimit('video') 10/min
   ├─ sleep(4000 + 随机抖动)
   ├─ video-preload.js 私信发送
   └─ 重试 3 次指数退避
```

### 场景 3：压测监控大屏

```
[setInterval] 每 2 分钟触发
        │
        ▼
[前端] fetch GET /api/waos/metrics
        │
        ▼
[/api/waos/metrics] 聚合数据
   ├─ modelStats (AI 大脑统计)
   ├─ sendCounts (沙箱节流计数)
   ├─ wechatBridge 状态
   ├─ EventStream 历史事件
   ├─ 内存 / CPU 占用
   └─ 数据库查询 QPS
        │
        ▼
[前端] updateMetrics(data)
        │
        ▼
[DashboardFullscreen] recharts 重渲染
   ├─ 12 维度 35 项指标卡片
   ├─ 实时折线图
   ├─ 饼图 (模型分布)
   └─ 进度条 (各平台节流)
```

---

## 📊 关键模块代码量

| 文件 | 行数 | 职责 |
|---|---:|---|
| `src/store/useOpsStore.ts` | 2952 | 中央 Zustand store |
| `src/app/api/waos/brain/route.ts` | 465 | AI 大脑多模型降级 |
| `electron/main.js` | 542 | Electron 主进程 |
| `electron/ui-actuation.js` | 363 | BrowserView 平台嵌入 |
| `electron/sandbox.js` | 214 | 执行沙箱 |
| `src/lib/safety.ts` | 144 | 安全护盾 |
| `src/lib/wechat/bridge.ts` | 141 | 微信桥接 |
| `src/lib/identity/kernel.ts` | 127 | Identity Kernel |
| `src/lib/douyin/connector.ts` | 91 | 抖音适配 |
| **业务代码合计** | **5344+** | 远超"界面壳子" |

---

> 🐕 架构设计原则：**分层清晰 / 单一职责 / 可降级 / 可观测**。
> 每一层都有兜底机制，单点失败不会让整个系统崩溃。
