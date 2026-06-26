# SPRINT5 — 性能与 UX 工程师

## 任务概览
Sprint 5 性能优化 + 体验打磨（3 项）

## 完成情况

### 5-1: 首次启动引导 Onboarding ✅
- 新建 `/home/z/my-project/src/components/waos/Onboarding.tsx`（680 行）
- 4 步向导：
  1. 欢迎页：旺财柴犬 logo + 欢迎语 + 3 个特性卡片
  2. AI 大脑配置：智谱 GLM-4 默认可用徽章 + 测试连接按钮（POST `/api/waos/brain/verify`）+ 可选豆包/Kimi Cookie 输入
  3. 人设选择：5 个卡片（苏念安/顾倾城/叶之秋/陈墨白/江月明）+ 渐变头像 + CVR 标签
  4. 完成页：PartyPopper 弹出动画 + 当前人设摘要 + 快捷键提示
- Dialog 全屏弹窗，max-w-3xl，h-88vh
- localStorage `waos_onboarding_completed` 标记完成（含 resetOnboarding / isOnboardingCompleted 导出）
- Framer Motion 步骤切换（x: 24 → 0 滑入）
- 顶部进度指示器（4 个圆点 + 1/4 数字）
- Skip 按钮支持跳过，ESC 也跳过
- 选择人设后调用 `setActivePersona(selectedPersonaId)` 持久化
- 暴露 `resetOnboarding()` 供「设置」中重置 onboarding 调用

### 5-2: 空状态设计 ✅
- 新建 `/home/z/my-project/src/components/waos/EmptyStates.tsx`（240 行）
- 5 个空状态组件 + 1 个通用 `GenericEmpty`：
  1. `NoLeadsEmpty`：🐕 + "还没有客户" + "去视频号" CTA
  2. `NoMessagesEmpty`：💬 + "等待客户第一句话"
  3. `NoSopEmpty`：⚡ + "还没有运行过 SOP" + "创建 SOP" CTA
  4. `NoKnowledgeEmpty`：📚 + "知识库为空" + "导入种子知识" CTA（支持 importing 状态）
  5. `NoCommentsEmpty`：💭 + "暂无评论"
- 通用 `EmptyStateShell` 容器：emoji 插画 + 柔光背景 + Framer Motion 淡入 + compact 模式
- emoji 插画，无图片依赖
- 文字 `text-muted-foreground`，CTA 用 primary 色
- 深色模式自适应
- 替换集成：
  - `DecisionPanel.tsx`：`EmptyState` 函数接收 `hasLeads` + `onGoChannels` props，当 `leads.length === 0` 时使用 `NoLeadsEmpty`，否则保留原"选择客户"提示
  - `KnowledgePanel.tsx`：当 `docs.length === 0 && stats.total === 0` 时使用 `NoKnowledgeEmpty`（CTA 调用原 `handleInitSeed`），仅当前分类为空时显示"查看全部知识"
  - `sop/SopRunLog.tsx`：当 `logs.length === 0` 时使用 `NoSopEmpty compact`，被筛选掉时显示"清除筛选"

### 5-3: 全局快捷键 ✅
- 新建 `/home/z/my-project/src/hooks/waos/useKeyboardShortcuts.ts`（130 行）
- 快捷键支持：
  - `Ctrl/Cmd + K`：打开命令面板（即使输入框也响应）
  - `Ctrl/Cmd + 1`：聊天 tab + toast 提示
  - `Ctrl/Cmd + 2`：朋友圈 tab + toast 提示
  - `Ctrl/Cmd + 3`：视频号 tab + toast 提示
  - `Ctrl/Cmd + 4`：打开设置
  - `Ctrl/Cmd + 5`：SOP 引擎 tab + toast 提示
  - `?`：派发 `waos:toggle-shortcuts-help` 事件（解耦 hook 与组件）
- 与既有 `useKeyboardNav`（J/K/R/Esc/1-3 单键）并存，无重复触发
- 输入框（INPUT/TEXTAREA/contentEditable）内不响应单键 + 数字组合键
- 暴露 `SHORTCUTS` 常量数组 + `toggleShortcutsHelp()` 工具函数
- 新建 `/home/z/my-project/src/components/waos/ShortcutsHelp.tsx`（90 行）
  - 监听 `waos:toggle-shortcuts-help` 事件
  - 分 3 组（导航 / 操作 / 帮助）展示 12 个快捷键
  - 每个快捷键用 `<kbd>` 风格按键展示
  - 底部提示输入框内的限制
- `page.tsx` 接入：
  - 调用 `useKeyboardShortcuts()`（与 `useKeyboardNav()` 并存）
  - 渲染 `<ShortcutsHelp />`
  - Onboarding 通过 `useEffect` 检查 `localStorage.waos_onboarding_completed`，未完成则 2.8s 后（等 Splashscreen 淡出）弹出

## 文件清单
### 新建（4 个）
- `src/components/waos/Onboarding.tsx`
- `src/components/waos/EmptyStates.tsx`
- `src/components/waos/ShortcutsHelp.tsx`
- `src/hooks/waos/useKeyboardShortcuts.ts`

### 修改（4 个）
- `src/app/page.tsx`：导入新组件、useKeyboardShortcuts()、showOnboarding state
- `src/components/waos/DecisionPanel.tsx`：EmptyState 函数扩展 props，集成 NoLeadsEmpty
- `src/components/waos/KnowledgePanel.tsx`：docs 空时优先用 NoKnowledgeEmpty
- `src/components/waos/sop/SopRunLog.tsx`：logs 空时用 NoSopEmpty

## 校验结果
- `npx tsc --noEmit --skipLibCheck`：**EXIT=0**（0 errors）
- `npx eslint <8 个文件>`：**EXIT=0**（0 errors, 0 warnings）
- dev server log：`✓ Compiled in 324ms` + `GET / 200 in 128ms`，无新引入的编译错误

## 设计要点
- 颜色系统：全程使用 emerald/teal（旺财品牌色）+ Tailwind token（`bg-primary`、`text-muted-foreground`），无 indigo/blue
- 深色模式：所有渐变、徽章、kbd 都通过 `dark:` 前缀适配
- 无障碍：所有 Dialog 含 `<DialogTitle className="sr-only">` + `<DialogDescription>`；按钮含 `aria-pressed`；插图含 `aria-hidden`
- 移动端：onboarding 卡片 `grid-cols-1 sm:grid-cols-2`，所有按钮 ≥ 28px 高度（h-7/h-8）

## 未破坏现有功能
- useKeyboardNav（J/K/R/Esc/1-3）原逻辑保留
- DecisionPanel 原"选择客户"提示在有客户时仍显示
- KnowledgePanel 原 stats.total > 0 时仍显示分类空提示
- SopRunLog 原"无匹配日志"提示在有日志被筛选时仍显示
