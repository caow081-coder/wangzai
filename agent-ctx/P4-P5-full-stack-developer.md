# Task P4-P5: CRM表格 version 列 + 动态线索表单 4 字段

**Agent**: full-stack-developer
**Task ID**: P4-P5
**对齐模块**: WAOS-X 模块7（动态线索表单）+ 模块8（CRM 表格 + 乐观锁）

## 前置阅读
- `worklog.md`（项目背景 + 前序 P1 完成情况）
- `src/components/waos/ProDrawer.tsx`（控制台 11 个 tab + 6 大模块面板）
- `src/components/waos/DecisionPanel.tsx`（右侧决策面板 8 个子组件，含 SalesCopilot）
- `src/store/useOpsStore.ts` Lead 接口（66-91 行，无 version 字段）+ SEED_LEADS（6 条种子）
- `prisma/schema.prisma` Lead model（50 行有 version 字段，但 store 层未对齐）

## P4 完成情况（模块8：CRM 表格 + 乐观锁）

### 改动 1：useOpsStore Lead 接口 + 种子数据
- Lead 接口新增 `version: number` + `leadForm?: LeadForm` 两个字段
- 新增 `LeadForm` 接口导出（车型/预算/情绪/家庭 4 字段）
- 6 条 SEED_LEADS 全部补齐 version（L001=3, L002=1, L003=2, L004=1, L005=1, L006=5）和 leadForm

### 改动 2：useOpsStore 新增 testOptimisticLock 方法
- 签名：`(leadId: string) => Promise<{ success, conflict, message, oldVersion, newVersion }>`
- 实现：350ms 模拟 IO 延迟 → 读 lead → 若 version=1 推进 stage + version+1（成功）；若 version>1 模拟过期 version-1 更新（冲突，不修改字段）
- stage 推进顺序：new → engaged → qualified → hot → converted；warm/cold 兜底映射
- 每次写审计日志（`crm.optimistic_lock.success` / `crm.optimistic_lock.conflict`）+ EventBus emitLogMsg + emitUpdateLeads

### 改动 3：useOpsStore 新增 updateLeadForm 方法
- 签名：`(leadId: string, partial: Partial<LeadForm>) => void`
- 实现：合并旧 leadForm + partial → 写回 + version+1 → 审计日志 + EventBus 信号
- 每次编辑视为一次乐观写，version+1（与 Prisma 乐观锁语义对齐）

### 改动 4：ProDrawer 新增 CRM 线索 tab + CrmPanel 组件
- Panel type 加 'crm'，TABS 加 `{ id: 'crm', label: 'CRM 线索', icon: Database, module: '8', desc: '线索表 + 乐观锁' }`
- 路由：`{panel === 'crm' && <CrmPanel />}`
- CrmPanel 完整实现：
  * ModuleIntro 模块8 介绍
  * shadcn/ui Table 5 列：姓名 / 意向分 / 价值分 / 状态 / 版本号
  * 行可点击选中（高亮 + selectLead 联动）
  * version 列用 Badge 显示，颜色递增：v1 灰 / v2 蓝 / v3 绿 / v4+ 橙（VersionBadge 组件）
  * 状态列用 StageBadge（9 个状态中文 label + 配色）
  * 意向/价值分用 ScoreBadge（≥80 rose / ≥60 amber / ≥40 sky / 其他 muted）
  * 乐观锁测试按钮（Loader2 spinner + Zap icon，disabled 状态保护）
  * 冲突/成功提示：红色 border-rose / 绿色 border-emerald，含 CheckCircle2/AlertTriangle icon + 详细版本号信息

## P5 完成情况（模块7：动态线索表单 4 字段）

### 改动 5：DecisionPanel 新增 LeadFormSection 组件
- 位置：插入到 SalesCopilot 与 Predictions 之间，使用 `key={lead.id}` 强制 remount 避免跨线索状态残留
- 4 字段完整实现：
  * **意向车型**：Select，10 选项（C级/GLC/GLE/E级/S级/GLC Coupe/EQE/迈巴赫/AMG/其他）+ Car icon
  * **预算范围**：Select，5 选项（30万以下~120万以上）+ Wallet icon
  * **情绪状态**：Slider 0-100 + emoji 指示（😡愤怒 / 😠不满 / 😐平静 / 🙂满意 / 🤩兴奋）+ Smile icon
    - onValueChange 只更新本地视觉，onValueCommit 才提交 store + 触发闪烁（避免拖动产生多次 version+1）
    - 底部 3 个 emoji 锚点（愤怒 / 平静 / 兴奋）
  * **家庭情况**：Select，5 选项（单身/情侣/小家庭三口/二孩家庭/三代同堂）+ Home icon
- 顶部 header：Tag icon + 标题 + "4 字段 · 实时回填" + 当前版本号 vX
- 底部 AnimatePresence 提示条："已回填，版本号 +1 → vX"（绿色，flex 展开/收起动画）

### 改动 6：Framer Motion 绿色高亮闪烁
- 每个字段 motion.div 包裹，animate 控制 backgroundColor
- flash 状态用 Record<keyof LeadForm, number>（时间戳）追踪每字段独立闪烁
- 闪烁动画：emerald/30 → emerald/10 → emerald/30 → transparent，2 秒，4 关键帧 easeInOut
- 2 秒后 setTimeout 自动清零（用 ref 管理 timer，切换字段时清旧 timer 避免竞态）
- 卸载时 cleanup-only useEffect 清理所有未触发 timer（无 setState，避免 react-hooks/set-state-in-effect 反模式 lint 错误）

## 验证
- `bun run lint`：**0 errors, 4 warnings**（4 个全是既存无关警告：BrainSettings/Splashscreen/TopBar 的 Unused eslint-disable）
- `npx tsc --noEmit`：本次新增代码 **0 TS 错误**（22 个总数全部为前序 Task 遗留：route.ts Prisma 类型不匹配 / WeChatClient.tsx unknown 类型 / LeadJourney.tsx createdAt undefined / store 2054+3257 行 createdAt undefined，与本次改动无关）
- `curl http://localhost:3000/`：HTTP 200 (0.36s)
- dev.log：`✓ Compiled in 230ms` + `GET / 200` 正常

## 产出文件清单
| 文件 | 改动 | 行数变化 |
|---|---|---|
| `src/store/useOpsStore.ts` | Lead 接口加 version + leadForm + LeadForm 导出 + 6 SEED_LEADS 补齐 + 2 方法签名 + 2 方法实现 | 3118 → 3285（**+167**）|
| `src/components/waos/ProDrawer.tsx` | 新增 CRM tab + CrmPanel 组件 + VersionBadge/ScoreBadge/StageBadge 3 helper | 959 → 1170（**+211**）|
| `src/components/waos/DecisionPanel.tsx` | 新增 LeadFormSection 组件 + Framer Motion + Select/Slider/Label 导入 + emotionEmoji/emotionLabel helper + key remount | 858 → 1086（**+228**）|
| `agent-ctx/P4-P5-full-stack-developer.md` | 本工作记录 | 新建 |
| **合计** | | **+606 行** |

## 关键决策
1. **version 字段在 Lead 接口为必填**（非 optional）：与 Prisma schema `version Int @default(1)` 对齐，6 条种子全部补齐，避免 `lead.version ?? 1` 防御式写法
2. **乐观锁语义**：v1 时直接成功推进（模拟首次无冲突），v2+ 模拟 v-1 过期更新失败（模拟 Prisma `where:{id,version}` 命中 0 行的真实语义），不修改字段直接返回冲突
3. **stage 推进顺序**：new → engaged → qualified → hot → converted，warm/cold 兜底映射到 hot/warm，避免阻塞
4. **LeadFormSection key remount**：用 `key={lead.id}` 而非 useEffect 同步状态，规避 react-hooks/set-state-in-effect 反模式 lint 错误（React 19/Next 16 严格）
5. **Slider onValueCommit 而非 onValueChange**：拖动一次产生 N 次 onValueChange，若每次都更新 store 会产生 N 次 version+1；改用本地 state + onValueCommit 提交，单次拖动只产生 1 次 version+1
6. **闪烁动画用 4 关键帧**：emerald/30 → emerald/10 → emerald/30 → transparent，模拟"闪烁"效果（中点变暗再亮起再淡出），比单次淡出更符合"闪烁"语义
7. **version Badge 颜色递增**：v1 灰（初次）/ v2 蓝（更新过）/ v3 绿（稳定）/ v4+ 橙（高频修改），运营一眼看出哪些线索被频繁操作
8. **审计日志 traceId 前缀**：olk_（optimistic_lock）/ lf_（lead_form），与既有 audit 条目格式一致，便于在 AuditPanel 中筛选
9. **EventBus 信号**：emitLogMsg 签名是 (level, message)，emitUpdateLeads 无参；本次按既有签名调用，未破坏接口
10. **Cleanup-only useEffect**：仅清理 timer，不在 effect body 调用 setState，符合 React 19 推荐实践

## 后续可消费点
- `useOpsStore(s => s.testOptimisticLock)` 可被其它面板（如 InfraPanel 的"分布式锁"section）调用做演示
- `useOpsStore(s => s.updateLeadForm)` 可被未来 AI 自动填表功能调用（如 LLM 推断车型/预算/情绪/家庭后自动写入）
- `Lead.version` 字段已与 Prisma schema 对齐，未来接入真实数据库时 ORM 层无需改造
- `LeadFormSection` 的 4 字段值可被 SalesCopilot 用于策略选择（如预算 30 万以下 → 推 C 级话术）
