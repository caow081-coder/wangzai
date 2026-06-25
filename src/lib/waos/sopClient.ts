/**
 * WAOS SOP 客户端封装 — 工作台触发器用
 *
 * 负责：
 *  - 与 /api/waos/sop API 的所有交互（fetch + 错误处理）
 *  - 类型定义（与 src/lib/sop/types.ts 对齐，但仅取工作台需要的子集）
 *  - 桌面环境探测（window.waosDesktop?.isDesktop）
 *
 * 设计原则：
 *  - 所有 fetch 使用相对路径（Caddy 网关要求）
 *  - 错误统一抛出 Error，由调用方决定如何 toast
 *  - 不依赖 React，纯函数模块，方便复用与测试
 */

'use client'

// ─── 类型定义（与 src/lib/sop/types.ts 对齐子集）─────────────
export type SopTriggerType = 'manual' | 'auto_schedule' | 'auto_event'
export type SopInstanceStatus = 'running' | 'paused' | 'completed' | 'failed' | 'aborted'
export type SopNodeLogStatus = 'success' | 'failed' | 'skipped' | 'running'

export interface SopNodeDTO {
  id: string
  type: 'trigger' | 'skill' | 'condition' | 'wait' | 'notify' | 'end'
  name: string
  skillName?: string
  condition?: { field: string; operator: string; value: unknown }
  waitMs?: number
  notifyMessage?: string
  notifyLevel?: 'info' | 'warn' | 'error'
  endStatus?: 'success' | 'failed' | 'human_handoff'
}

export interface SopDefinitionDTO {
  id: string
  name: string
  description: string
  triggerType: SopTriggerType
  triggerCondition?: Record<string, unknown>
  nodes: SopNodeDTO[]
  edges: { id: string; from: string; to: string; label?: string; condition?: 'yes' | 'no' | 'default' }[]
  category: string
  isActive: boolean
  version: number
  createdAt: number
  updatedAt: number
}

export interface SopInstanceDTO {
  id: string
  sopDefinitionId: string
  sopName: string
  customerId: string
  customerName?: string
  currentNodeId: string | null
  status: SopInstanceStatus
  context: Record<string, unknown>
  startedAt: number
  completedAt: number | null
  updatedAt: number
}

export interface SopNodeLogDTO {
  id: string
  sopInstanceId: string
  nodeId: string
  nodeName: string
  skillName?: string
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  status: SopNodeLogStatus
  errorMessage?: string
  startedAt: number
  completedAt: number | null
  durationMs: number
}

// ─── 桌面环境探测 ────────────────────────────────────────────
/**
 * 检测当前是否运行在旺财桌面端（Electron）。
 * 网页端返回 false，但 SOP API 两侧都能用，仅用于 UI 提示差异。
 */
export function isDesktopEnv(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as any).waosDesktop?.isDesktop)
}

// ─── API 调用 ────────────────────────────────────────────────

/** 拉取所有 SOP 定义（下拉菜单数据源） */
export async function fetchSopDefinitions(): Promise<SopDefinitionDTO[]> {
  const res = await fetch('/api/waos/sop?view=definitions', { cache: 'no-store' })
  if (!res.ok) throw new Error(`拉取 SOP 列表失败: ${res.status}`)
  const data = await res.json()
  return (data.definitions || []) as SopDefinitionDTO[]
}

/** 拉取所有 SOP 实例（用于筛选当前客户的运行中实例） */
export async function fetchSopInstances(): Promise<SopInstanceDTO[]> {
  const res = await fetch('/api/waos/sop?view=instances', { cache: 'no-store' })
  if (!res.ok) throw new Error(`拉取 SOP 实例失败: ${res.status}`)
  const data = await res.json()
  return (data.instances || []) as SopInstanceDTO[]
}

/** 拉取某 SOP 实例的节点执行日志（用于失败时定位错误节点） */
export async function fetchSopInstanceLogs(instanceId: string): Promise<SopNodeLogDTO[]> {
  const res = await fetch(`/api/waos/sop?view=instance_logs&id=${encodeURIComponent(instanceId)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`拉取 SOP 日志失败: ${res.status}`)
  const data = await res.json()
  return (data.logs || []) as SopNodeLogDTO[]
}

export interface RunSopPayload {
  sopDefinitionId: string
  customerId: string
  customerName?: string
  initialContext?: Record<string, unknown>
}

/** 启动 SOP（异步运行，立即返回 instance） */
export async function runSop(payload: RunSopPayload): Promise<SopInstanceDTO> {
  const res = await fetch('/api/waos/sop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'run', ...payload }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `启动 SOP 失败: ${res.status}`)
  }
  const data = await res.json()
  return data.instance as SopInstanceDTO
}

/** 暂停 SOP 实例 */
export async function pauseSop(instanceId: string): Promise<void> {
  const res = await fetch('/api/waos/sop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'pause', instanceId }),
  })
  if (!res.ok) throw new Error(`暂停 SOP 失败: ${res.status}`)
}

/** 终止 SOP 实例 */
export async function abortSop(instanceId: string): Promise<void> {
  const res = await fetch('/api/waos/sop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'abort', instanceId }),
  })
  if (!res.ok) throw new Error(`终止 SOP 失败: ${res.status}`)
}

// ─── 工具函数 ────────────────────────────────────────────────

/**
 * 根据实例 + 定义计算进度百分比。
 *  - completed → 100
 *  - running/paused → 当前节点在定义节点列表中的位置占比
 *  - failed/aborted → 最后已知位置占比（不补满）
 */
export function computeInstanceProgress(
  instance: SopInstanceDTO,
  definition: SopDefinitionDTO | undefined,
): { completed: number; total: number; percent: number } {
  if (instance.status === 'completed') {
    const total = definition?.nodes.length || 1
    return { completed: total, total, percent: 100 }
  }
  if (!definition) return { completed: 0, total: 0, percent: 0 }

  const total = definition.nodes.length || 1
  if (!instance.currentNodeId) {
    return { completed: 0, total, percent: 0 }
  }
  const idx = definition.nodes.findIndex(n => n.id === instance.currentNodeId)
  const completed = idx < 0 ? 0 : idx
  const percent = Math.round((completed / total) * 100)
  return { completed, total, percent }
}

/** 根据 currentNodeId 在定义中查找节点名（找不到回退 nodeId） */
export function resolveCurrentNodeName(
  instance: SopInstanceDTO,
  definition: SopDefinitionDTO | undefined,
): string {
  if (!instance.currentNodeId) return '已结束'
  if (!definition) return instance.currentNodeId
  const node = definition.nodes.find(n => n.id === instance.currentNodeId)
  return node?.name || instance.currentNodeId
}

/** 触发方式 → 图标 emoji */
export function triggerIcon(triggerType: SopTriggerType): string {
  return triggerType === 'manual' ? '👇' : '⚡'
}

/** 触发方式 → 中文标签 */
export function triggerLabel(triggerType: SopTriggerType): string {
  return triggerType === 'manual' ? '手动' : triggerType === 'auto_schedule' ? '定时' : '事件'
}

/** 实例状态 → 徽章颜色 class */
export function statusBadgeClass(status: SopInstanceStatus): string {
  switch (status) {
    case 'running':   return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    case 'paused':    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    case 'completed': return 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
    case 'failed':    return 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
    case 'aborted':   return 'bg-muted text-muted-foreground'
    default:          return 'bg-muted text-muted-foreground'
  }
}

/** 实例状态 → 中文标签 */
export function statusLabel(status: SopInstanceStatus): string {
  return { running: '运行中', paused: '已暂停', completed: '已完成', failed: '失败', aborted: '已终止' }[status] || status
}
