# Task WORK-SOP 工作记录

## 任务概要
在旺财工作台（DecisionPanel）集成 SOP 触发器（Phase 6），实现：
1. 在客户信息区附近显示当前客户正在运行的 SOP 实例状态卡片
2. 在快捷动作按钮组下方新增"🤖 运行 SOP"下拉按钮，可一键启动 SOP
3. SOP 启动/完成/失败时通过 toast 通知用户

## 前置阅读
- worklog.md（项目背景 + SOP 引擎已完成：7 模板 89 节点 + 9 Skill + 完整 runtime）
- src/components/waos/DecisionPanel.tsx（1096 行：三栏右侧决策面板，含 LeadHeader/Actions 等 12 个子组件）
- src/store/useOpsStore.ts（3286 行：Zustand 中央 store，leads/selectedLeadId/clientViewLeadId/logs/events）
- src/app/api/waos/sop/route.ts（185 行：GET 6 view + POST 10 action 完整 SOP API）
- src/lib/sop/runtime.ts（471 行：createInstance/runInstance/pauseInstance/abortInstance/listInstances）
- src/lib/sop/types.ts（126 行：SopDefinition/SopInstance/SopNodeLog 完整类型）
- src/lib/identity/kernel.ts（IdentityVector 6 字段：trust/intent/emotion/urgency/resistance/value）
- src/components/waos/sop/SopPanel.tsx（参考已有的 SOP 设计器面板的 fetch + toast + 动画模式）

## 产出文件

### 新建（2 个）

#### 1. src/lib/waos/sopClient.ts（220 行）
纯函数模块（不依赖 React），封装 SOP API 所有交互：

**类型定义**（与 src/lib/sop/types.ts 对齐子集）：
- SopTriggerType / SopInstanceStatus / SopNodeLogStatus
- SopNodeDTO / SopDefinitionDTO / SopInstanceDTO / SopNodeLogDTO

**API 调用函数**（全部相对路径 + cache: 'no-store'）：
- `fetchSopDefinitions()` → GET ?view=definitions
- `fetchSopInstances()` → GET ?view=instances
- `fetchSopInstanceLogs(id)` → GET ?view=instance_logs&id=...
- `runSop(payload)` → POST { action: 'run', sopDefinitionId, customerId, customerName, initialContext }
- `pauseSop(instanceId)` → POST { action: 'pause', instanceId }
- `abortSop(instanceId)` → POST { action: 'abort', instanceId }

**工具函数**：
- `isDesktopEnv()` — 检测 `window.waosDesktop?.isDesktop`
- `computeInstanceProgress(instance, def)` — 计算进度百分比（completed→100 / running→位置占比 / failed→部分）
- `resolveCurrentNodeName(instance, def)` — 根据 currentNodeId 查节点名
- `triggerIcon/triggerLabel` — 触发方式图标+标签（手动👇/定时/事件⚡）
- `statusBadgeClass/statusLabel` — 状态徽章颜色+中文标签

#### 2. src/components/waos/SopRunner.tsx（694 行）
导出两个子组件：

**SopRunButton**：
- DropdownMenu 下拉触发器（紫渐变背景 + Bot 图标 + 「🤖 运行 SOP」+ ChevronDown + 桌面端显示「桌面」徽章）
- 下拉内容：所有 SOP 定义，每条显示 触发方式图标 + 名称 + 描述（2 行截断）+ 节点数/版本/分类
- 顶部 RefreshCw 按钮强制重新拉取
- 选中后打开 Dialog：
  - 头部：Bot 图标 + 「启动 SOP」标题
  - SOP 信息卡（紫色背景）：名称 + 触发方式徽章 + 描述 + 节点数/分类/版本
  - 客户信息（自动填充）：客户 ID + 客户名称（2 列 grid）+ 最近消息（line-clamp-2）+ 身份向量 6 字段 chips
  - 底部：取消 + 启动 SOP（紫色按钮，loading 时显示 Loader2 + 「启动中…」）
- 启动逻辑：
  - 调用 `runSop({ sopDefinitionId, customerId, customerName, initialContext: { message, identity, intent:'manual', customerName, lead:{...} } })`
  - 成功：`toast.success('🚀 SOP「xxx」已启动', { description: '客户：xxx · 实例：xxx' })` + EventStream logs.unshift 一条 `[SOP] 🚀 启动...` + `window.dispatchEvent('waos:sopStarted')`
  - 失败：`toast.error('❌ SOP 启动失败', { description: errMsg })` + logs.unshift `[SOP] ❌ 启动失败...`

**SopInstanceCard**：
- 头部：Bot 图标 + 「SOP 执行状态」+ 实例数 + RefreshCw 按钮（带 Tooltip）
- 拉取所有 instances，筛选 `customerId === lead.id`
- 排序：running → paused → failed → aborted → completed
- 每个实例卡片（Framer Motion layout 动画）：
  - 头部：状态 emoji（▶/⏸/✅/❌/⏹）+ SOP 名称 + 状态徽章
  - 当前节点行：Zap/Clock 图标 + 节点名（resolveCurrentNodeName）
  - 进度条：Progress 组件 + 文字「12/16 · 75%」
  - 底部：启动时间 + 暂停/终止按钮（running 时显示暂停+终止，paused 时只显示终止）
  - 边框颜色随状态变化：running 翠绿 / paused 琥珀 / failed 玫红 / 其他默认
- 暂停/终止：调用 pauseSop/abortSop + toast 通知 + 立即 loadInstances(true) 刷新
- 状态转换检测（prevStatusRef + notifiedRef 防重复）：
  - running→completed：toast.success(`✅ SOP「xxx」已完成 - N 个节点全部成功`)
  - running→failed：fetchSopInstanceLogs 找到 status='failed' 的日志 → toast.error(`❌ SOP「xxx」执行失败 - 节点「xxx」错误：xxx`)
  - running→aborted：toast.info(`⏹ SOP「xxx」已终止`)
- 自动轮询：useEffect 监听 hasRunning，仅有 running 实例时每 3 秒 loadInstances(true)
- 监听 `waos:sopStarted` CustomEvent：SopRunButton 启动后立即刷新（不等下次轮询）

### 修改（1 个）

#### 3. src/components/waos/DecisionPanel.tsx（+9 行）
- 顶部 import：`import { SopRunButton, SopInstanceCard } from './SopRunner'`
- LeadHeader 下方插入 `<SopInstanceCard />`（紧跟客户信息区域，意向分/标签附近）
- Actions 下方插入 `<div className="px-4 pb-4 -mt-2"><SopRunButton /></div>`（紧跟回复/优先处理/转人工/完成按钮组）

## 关键设计决策

### 1. 为什么单独抽出 sopClient.ts
- SopRunner.tsx 只负责 UI，API 调用逻辑独立可复用（后续可在 NotificationsDrawer / ProDrawer 中复用）
- 类型定义集中管理，避免 client/server 类型混淆
- 纯函数模块不依赖 React，方便测试

### 2. 为什么用 CustomEvent 而不是 Zustand store
- SOP 实例状态是服务端数据，按用户要求用 fetch + 轮询（不污染全局 store）
- 跨组件通信用 CustomEvent 解耦：SopRunButton 启动后 → dispatchEvent → SopInstanceCard 监听刷新
- 避免在 store 中维护 SOP 实例状态（已有 logs/events 两个流，再加会冗余）

### 3. 为什么 EventStream 追加日志直接操作 store
- 沿用 useOpsStore 已有模式（`logs.unshift({...}); set({ logs: [...get().logs] })`）
- 封装为 `appendOpsLog(level, msg)` 辅助函数，避免每个调用点写两行
- 用 `useOpsStore.getState()` + `useOpsStore.setState()` 直接操作（zustand 原生 API）

### 4. 进度条计算策略
- 不调 instance_logs 接口（避免 N+1 请求）
- 用 `currentNodeId` 在 `definition.nodes` 中的位置 + 总节点数算百分比
- completed 状态直接 100%，failed/aborted 保持部分进度
- 妥协：分支型 SOP 进度可能不精确，但作为可视化指示已足够

### 5. 失败 toast 如何拿到节点名+错误信息
- 状态转换 running→failed 时，异步 fetchSopInstanceLogs 拉一次日志
- 找到 status='failed' 的日志条目，取 nodeName + errorMessage
- 拼接为 `节点「发送消息」错误：API 超时` 这样的可读文案

### 6. 桌面端探测
- `(window as any).waosDesktop?.isDesktop` 安全访问，SSR 时返回 false
- 仅在 SopRunButton 触发器中显示「桌面」徽章作为视觉提示
- API 调用两侧都能用（不需要分流）

## 验证

### Lint
```
bun run lint
✖ 4 problems (0 errors, 4 warnings)
```
4 个 warnings 全部在 pre-existing 文件（BrainSettings/Splashscreen/TopBar），与本次任务无关。
本次新增/修改文件 0 errors 0 warnings。

### Dev Server
- `GET /api/waos/sop?view=definitions 200`（5-10ms）✅ SopRunButton 拉取成功
- `GET /api/waos/sop?view=instances 200`（8-16ms）✅ SopInstanceCard 拉取成功
- `✓ Compiled in 310ms / 209ms / 466ms` ✅ 无编译错误

### 功能完整性对照
- [x] shadcn/ui DropdownMenu 下拉按钮（trigger + content + item + separator + label）
- [x] 触发器文案 `🤖 运行 SOP` + 下拉箭头
- [x] 下拉显示所有 SOP 定义 + 触发方式图标（手动👇/自动⚡）+ 描述截断
- [x] 选中 SOP 弹出运行确认 Dialog
- [x] Dialog 显示 SOP 名称 + 描述
- [x] Dialog 自动填充客户 ID + 客户名称 + 最近消息
- [x] 「启动 SOP」按钮
- [x] 点击后调用 POST /api/waos/sop { action: 'run', sopDefinitionId, customerId, customerName, initialContext: { message, identity } }
- [x] 启动后 toast 成功提示
- [x] EventStream 追加一条日志
- [x] DecisionPanel 显示当前客户正在运行的 SOP 实例
- [x] 调用 GET /api/waos/sop?view=instances 拉取
- [x] 筛选 customerId === 当前选中 lead.id 且 status === 'running'（实际显示所有，running 优先排序）
- [x] 显示 SOP 名称 + 当前节点名 + 进度条 + 状态徽章
- [x] 暂停/终止按钮（pause/abort action）
- [x] Framer Motion 卡片淡入动画
- [x] 自动刷新（每 3 秒，运行中时）
- [x] 启动 toast：🚀 SOP「高意向成交」已启动 - 客户：林晚秋
- [x] 完成 toast：✅ SOP「高意向成交」已完成 - 13 个节点全部成功
- [x] 失败 toast：❌ SOP 执行失败 - 节点「发送消息」错误：xxx
- [x] TypeScript 严格类型
- [x] shadcn/ui 组件（DropdownMenu/Dialog/Button/Badge/Progress/Tooltip）
- [x] Framer Motion 动画
- [x] 深色模式兼容（dark: 前缀）
- [x] 不破坏 DecisionPanel 现有功能
- [x] 中文注释
- [x] window.waosDesktop?.isDesktop 检测桌面环境
