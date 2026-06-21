# Task ID: 6-B · full-stack-developer

## 任务：实现 4 策略枚举 + 事件总线信号系统

## 前置阅读
1. `worklog.md` — 项目历史与现状（5344+ 行业务代码，非界面壳子）
2. `src/lib/identity/kernel.ts`（127 行原文）— Identity Kernel + Persona Compiler
3. `src/store/useOpsStore.ts`（前 100 行 + 1540-1740 行 + 2540-2640 行）— store 类型与 sendClientMessage / generateReplySuggestions

## 关键决策
1. **detectIntent 与 inferDelta 解耦**：原 inferDelta 负责对身份向量做漂移；新增 detectIntent 仅做单条消息意图分类，职责独立避免相互污染。
2. **IdentityVector 构造启发式**：lead 中无 trust/emotion/resistance 字段，从 alreadyCustomer / intentScore 派生（trust = alreadyCustomer?70:40, emotion = intent>50?60:40, resistance = 100-intent）。
3. **EventBus payload 用 `unknown`** 而非 `any`，强制消费方做类型断言，符合 TS strict。
4. **emit 单点异常隔离**：forEach + try-catch 包裹每个 listener，避免单点崩溃污染其他订阅者；console.error 仅记日志不抛。
5. **sendClientMessage 注入 5 个关键节点**：收到消息 → 防打架拦截 → 输入拦截 → 输出拦截 → AI 回复后。不破坏原有逻辑，只追加 emit 调用。
6. **`setTimeout(emitStatusUpdate('ready'), 800)`** 让 UI 状态机完成 typing → ready 过渡，避免状态跳变丢失动画。
7. **_resetEventBusForTest** 测试专用钩子单独导出（下划线前缀表意），生产环境不应调用。
8. **INTENT_KEYWORDS 用 Record<Exclude<IntentType, 'GENERAL'>, RegExp>** — 类型系统强约束关键词字典必须覆盖所有非兜底意图。

## 产出
- `src/lib/identity/kernel.ts`：+263 行（127 → 389），新增 StrategyType / StrategyDecision / IntentType / IntentDetection / detectIntent / selectStrategy / EventType / AiStatus / WaosEvent / EventBus / getEventBus / _resetEventBusForTest
- `src/store/useOpsStore.ts`：+166 行（2952 → 3118），新增 `@/lib/identity/kernel` import，sendClientMessage 5 个关键节点接入 EventBus

## 验证
- `bun run lint`：0 errors, 4 warnings（均为既存，与本次改动无关）
- `npx tsc --noEmit`：本次新增代码无 TS 错误（既有 WeChatClient.tsx unknown / store 第 2020/3090 行 createdAt undefined 错误为前序 Task 遗留）
- dev server `GET / 200 in 431ms (compile: 401ms)` — kernel.ts + store 改动通过 Next.js 编译并正常渲染

## 下一步建议（给后续 agent）
- `selectStrategy` 返回的 `templateHints` 可被 DecisionPanel 消费，作为快速回复按钮选项
- `EventBus.on('new_bubble', ...)` 可在 WeChatClient 顶部订阅实现"气泡淡入动画"
- `EventBus.on('status_update', ...)` 可驱动 TopBar 的 AI 状态指示灯（thinking 黄 / typing 绿 / blocked 红）
- `detectIntent` 目前纯关键词，可后续接 LLM 做语义级意图分类（保留 fallback 链）
