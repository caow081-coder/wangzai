# Task ID: 6-A — 防双端打架系统

**Agent**: full-stack-developer
**日期**: 2026-06-21
**任务**: 实现 WAOS-X 防双端打架物理防御（人工接管警告 + AI 静默窗口 + 红色拦截气泡）

---

## 改动文件清单

| 文件 | 变化 | 新增行数 |
|------|------|---------|
| `src/store/useOpsStore.ts` | 2952 → 3118 行 | +166 |
| `src/components/waos/WeChatClient.tsx` | 849 → 919 行 | +70 |
| **合计** | | **+236** |

---

## 关键接口（供后续 agent 复用）

### Store 状态

```typescript
// useOpsStore.ts
takeoverWarning: {
  active: boolean          // 是否正在显示黄色横幅
  leadId: string | null    // 哪个线索触发
  reason: string           // 原因
  triggeredAt: number      // 触发时间戳（Date.now()）
} | null
```

### Store 方法

```typescript
// 检查 10 秒静默窗口，返回 AI 是否允许回复
checkAntiCollision: (leadId: string) => boolean
// 逻辑：从后往前找最后一条 assistant/ai 消息，距今 < 10000ms 返回 false，>= 10s 返回 true
// 兼容 ts(number) / createdAt(ISO string) / timestamp 三种时间戳字段

// 显示黄色横幅，5 秒后自动清除（仅清除本次触发，不覆盖后续新触发）
showTakeoverWarning: (leadId: string, reason: string) => void

// 立即清除横幅（手动关闭按钮用）
clearTakeoverWarning: () => void
``### LeadMessage 新增字段

```typescript
blocked?: boolean           // 是否被拦截（防打架静默 / 安全护盾拦截）
blockedReason?: string      // 拦截原因（气泡下方小字显示）
```

---

## 防打架接入点

`sendClientMessage` 方法中，人类延迟之后、AI 大脑调用之前：

```typescript
// 防双端打架检查（在调用 AI 大脑前）
const canReply = get().checkAntiCollision(lead.id)
if (!canReply) {
  get().showTakeoverWarning(lead.id, '检测到人工正在回复，AI 已静默 10 秒')
  // 保存用户消息 + 追加 blocked 标记消息（红色气泡）
  // 清 draft/sending/typing
  return  // 不调用 AI 大脑
}
```

---

## UI 组件

### TakeoverBanner（WeChatClient.tsx 第 404-438 行）

- 位置：ChatWindow 内 GhostCard 下方、消息区上方
- 显示条件：`takeoverWarning.active && takeoverWarning.leadId === 当前 leadId`
- 动画：Framer Motion 从顶部滑入（height 0→auto, opacity 0→1, y -8→0, 220ms easeOut）
- 样式：`bg-amber-500/15 border-y border-amber-500/40 text-amber-700 dark:text-amber-400 px-4 py-2 text-xs flex items-center gap-2`
- 内容：⚠️ AlertTriangle 图标 + "检测到您正在手动回复，AI 已暂停 10 秒 · {reason}" + X 手动关闭按钮

### PCMessageBubble 红色拦截分支（WeChatClient.tsx 第 447-486 行）

- 触发条件：`msg.blocked || msg.safetyFiltered`
- 样式：`border-2 border-red-500 bg-red-50 dark:bg-red-950/30`
- 左侧红色竖条：`absolute left-0 top-0 bottom-0 w-1 bg-red-500`
- "🚫 已拦截" 标签：`text-[10px] font-semibold text-red-600`
- 头像改为 🚫 emoji + 红色渐变背景
- 拦截原因（blockedReason || safetyReason）小字 + Shield 图标显示在气泡下方

---

## 验证结果

- `bun run lint`：0 errors, 5 warnings（5 个 warning 全为其它文件预存的 "Unused eslint-disable directive"，与本次改动无关）
- dev server：`✓ Compiled in 257ms` + `GET / 200` 正常
- 未破坏现有功能：sendClientMessage 原流程在防打架未触发时完全不变

---

## 关键决策记录

1. **静默窗口 10s + 横幅 5s 自动清除**：严格按 spec 要求
2. **拦截时仍保存用户消息**：避免操作者输入丢失（不破坏现有功能），同时追加 blocked 标记消息让红色气泡有内容展示
3. **showTakeoverWarning 用 triggeredAt 闭包判断**：避免快速连续触发时新横幅被旧定时器误清
4. **safetyFiltered 与 blocked 统一走红色拦截分支**：简化视觉层级，原琥珀色内联提示已移除
5. **时间戳兼容 3 种字段**：ts(number) / createdAt(ISO string) / timestamp，复用既有 Invalid Date 修复模式
