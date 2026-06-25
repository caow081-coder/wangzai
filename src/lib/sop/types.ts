/**
 * WAOS SOP 引擎 — 类型定义
 *
 * 对齐 WAOS-X SOP 引擎设计：
 *  - Skill: 原子能力（可复用）
 *  - SOP: 有序编排（节点+连线 DAG）
 *  - Instance: 执行实例（状态追踪）
 *
 * 节点类型：trigger / skill / condition / wait / notify / end
 */

// ─── Skill 类型 ─────────────────────────────────────────────
export type SkillCategory = 'recognition' | 'evaluation' | 'generation' | 'execution' | 'notification'

export interface SkillDefinition {
  id: string
  name: string
  description: string
  category: SkillCategory
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

export interface SkillContext {
  customerId: string
  message?: string
  lead?: Record<string, unknown>
  identity?: { trust: number; intent: number; emotion: number; urgency: number; resistance: number; value: number }
  intent?: string
  intentConfidence?: number
  strategy?: string
  reply?: string
  [key: string]: unknown
}

export interface SkillResult {
  success: boolean
  output: Record<string, unknown>
  error?: string
  durationMs: number
}

export interface Skill {
  definition: SkillDefinition
  execute(context: SkillContext): Promise<SkillResult>
}

// ─── SOP 节点类型 ─────────────────────────────────────────────
export type NodeType = 'trigger' | 'skill' | 'condition' | 'wait' | 'notify' | 'end'

export interface SopNode {
  id: string
  type: NodeType
  name: string
  skillName?: string
  skillParams?: Record<string, unknown>
  condition?: {
    field: string
    operator: '==' | '!=' | '>=' | '<=' | '>' | '<' | 'contains'
    value: unknown
  }
  waitMs?: number
  notifyMessage?: string
  notifyLevel?: 'info' | 'warn' | 'error'
  endStatus?: 'success' | 'failed' | 'human_handoff'
  position?: { x: number; y: number }
}

export interface SopEdge {
  id: string
  from: string
  to: string
  label?: string
  condition?: 'yes' | 'no' | 'default'
}

export interface SopDefinition {
  id: string
  name: string
  description: string
  triggerType: 'manual' | 'auto_schedule' | 'auto_event'
  triggerCondition?: Record<string, unknown>
  nodes: SopNode[]
  edges: SopEdge[]
  category: string
  isActive: boolean
  version: number
  createdAt: number
  updatedAt: number
}

// ─── SOP 执行实例 ─────────────────────────────────────────────
export type InstanceStatus = 'running' | 'paused' | 'completed' | 'failed' | 'aborted'

export interface SopInstance {
  id: string
  sopDefinitionId: string
  sopName: string
  customerId: string
  customerName?: string
  currentNodeId: string | null
  status: InstanceStatus
  context: SkillContext
  startedAt: number
  completedAt: number | null
  updatedAt: number
}

// ─── SOP 节点执行日志 ─────────────────────────────────────────────
export type NodeLogStatus = 'success' | 'failed' | 'skipped' | 'running'

export interface SopNodeLog {
  id: string
  sopInstanceId: string
  nodeId: string
  nodeName: string
  skillName?: string
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  status: NodeLogStatus
  errorMessage?: string
  startedAt: number
  completedAt: number | null
  durationMs: number
}
