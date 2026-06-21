# UI-COMPACT — 顶栏精简 + 右侧紧凑化

**Task ID**: UI-COMPACT  
**Agent**: full-stack-developer  
**Date**: 2026-06-21  
**Status**: ✅ Completed

## 用户原始需求

> "还有右边最上面的那么多功能按钮跟系统设置有什么区别搞那么多是什么意思？还有大模型对接跟大脑逆向扫码不是一个功能吗，不能放一起？还有右边的客户分析界面上面的不太经凑，上下留白太多了"

## 改动文件清单

| 文件 | 改动类型 | 行数变化 |
|------|---------|---------|
| `src/components/waos/TopBar.tsx` | 重写 | 333 → 312 |
| `src/components/waos/BrainSettings.tsx` | 重写（3-tab） | 541 → 502 |
| `src/components/waos/DecisionPanel.tsx` | 多处 MultiEdit + 加 CollapsibleSection | 1097 → 1110 |
| `src/components/waos/SettingsDialog.tsx` | 加 6 大模块快捷入口 | 292 → 313 |
| `src/components/waos/SopRunner.tsx` | SopInstanceCard 只显示活动实例 | 695 → 697 |

## TopBar.tsx 精简方案

### 删除项
- `MODULE_TABS` 数组（6 个数字快捷键：定时任务/AI设置/全渠道/客户跟进/效果分析/系统设置）
- 顶栏主题三按钮组（自动/浅色/深色）

### 合并项
- "AI 大脑" + "大模型对接" → 统一 AI 大脑按钮，打开 3-tab BrainSettings Dialog
- "浅色/深色" 两按钮 → 单按钮循环切换（light → dark → auto → light），图标 Sun/Moon/Monitor

### 新增项
- 人设菜单底部"编辑当前人设"入口（Pencil 图标，调用 openPersonaEditor）

### 最终顶栏元素（11 个，从左到右）
1. 旺财 logo
2. 多微信号切换
3. 人设切换（含编辑入口）
4. 焦点三态（自动跟进/置顶/勿扰）
5. flex-1 占位
6. 实时指标（线索/HOT/队列）
7. 搜索按钮
8. 连接状态点
9. 微信连接（三合一）
10. AI 大脑（统一入口）
11. 通知
12. 主题切换（单按钮循环）
13. 全局熔断
14. 设置（齿轮 — 6 模块入口收进 Dialog）

## BrainSettings.tsx 3-tab 结构

- **Tab1 模型配置**：5 个模型（豆包/千问/Kimi/智谱/Z.AI）+ 手动 Cookie 编辑/测试/清除
- **Tab2 逆向登录**：4 个 loginUrl 模型 + 扫码登录（桌面端全自动/Web 端半自动）+ 自动检测
- **Tab3 测试统计**：降级链总览 + 一键测试 + 单模型测试结果

## DecisionPanel.tsx 紧凑化对照表

| Section | 改前 | 改后 |
|---------|------|------|
| MonitorBar | py-2.5 / text-[20px] / text-[9px] | py-1.5 / text-[14px] / text-[10px] |
| StressMonitorPanel | py-2 / text-[11px] / pb-2 | py-1.5 / text-[10px] / pb-1.5 |
| LeadHeader | p-4 / w-12 / text-[16px] / 意向分+标签分行 | p-3 / w-10 / text-[14px] / 同栏 flex-wrap |
| SalesCopilot | 大数字 + 3 字段竖排 | 4 字段 1 行 4 列横排 |
| LeadFormSection | 4 字段竖排 space-y-2.5 | grid-cols-4 gap-1.5 1 行 4 列 |
| Predictions | p-4 / p-2.5 / text-[18px] | p-3 / p-2 / text-[16px] |
| Actions | grid-cols-2 大按钮 h-10 | 一行 4 个 h-8 小图标按钮 |
| ReplySuggestions | p-4 / mb-3 / p-2.5 | p-3 / mb-2 / p-2 |
| CustomerMemory | p-4 常显 | CollapsibleSection 默认折叠 |
| WhyDecision | p-4 常显 | CollapsibleSection 默认折叠 |
| StateMachine | p-4 常显 | CollapsibleSection 默认折叠 |
| PersonaCard | p-4 常显 | CollapsibleSection 默认折叠（编辑按钮 stopPropagation） |

## SopInstanceCard 改动

- 原 `if (instances.length === 0) return null`
- 改为：仅展示 running/paused 实例 `activeInstances.filter(i => i.status === 'running' || i.status === 'paused')`
- 已完成/失败的实例通过事件流查看，不占决策面板空间

## SettingsDialog.tsx 改动

顶部新增"模块快捷入口" section（3x2 grid），6 个按钮：
- 定时任务 (Flame) → ProDrawer tab 'scheduler'
- AI设置 (Bot) → ProDrawer tab 'ai'
- 全渠道 (Radio) → ProDrawer tab 'channel'
- 客户跟进 (Clock) → ProDrawer tab 'lifecycle'
- 效果分析 (TrendingUp) → ProDrawer tab 'attribution'
- 系统设置 (Lock) → ProDrawer tab 'infra'

点击逻辑：close SettingsDialog → openProDrawer → 延后 50ms 派发 `waos:proTab` 事件 + toast 通知

## 技术细节

### CollapsibleSection 通用组件

```tsx
function CollapsibleSection({
  icon, title, badge, defaultOpen = false, children,
}: {
  icon: React.ReactNode
  title: string
  badge?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  // Framer Motion height: 0 → auto 动画
}
```

### 主题循环切换

```tsx
const THEME_CYCLE = ['light', 'dark', 'auto'] as const
const cycleTheme = () => {
  const idx = THEME_CYCLE.indexOf(theme)
  const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
  updateSettings({ theme: next })
  toast.info(`主题切换：${THEME_LABEL[next]}`)
}
const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
```

### Lint 结果

`bun run lint` 通过：**0 errors, 4 warnings**（均为 unused eslint-disable directive，无害）

## 给后续 agent 的提示

1. **顶栏不要再加按钮**：当前 11 个元素已经接近容量极限，再加请用 DropdownMenu 形式
2. **长尾信息默认折叠**：CustomerMemory/WhyDecision/StateMachine/PersonaCard 默认折叠，新增同类 section 也用 CollapsibleSection
3. **6 模块入口在设置 Dialog**：不要再加回顶栏
4. **AI 大脑是统一入口**：不要再加"大模型对接"独立按钮
5. **PersonaCard 内的编辑按钮**：onClick 必须 `e.stopPropagation()`，否则会触发 CollapsibleSection 折叠
