/**
 * WAOS SOP 引擎 — Runtime 核心引擎
 *
 * 三大组件：
 *  - Trigger: 检测触发条件（手动/自动事件/定时）
 *  - Scheduler: 取下一个节点（DAG 遍历）
 *  - Executor: 执行 Skill + 记录日志
 *
 * 执行流程：
 *   trigger → 创建 instance → scheduler 取节点 → executor 执行 → 更新 context → 循环
 */

import { db } from '@/lib/db'
import { getSkillRegistry } from './registry'
import type { SopDefinition, SopInstance, SopNodeLog, SkillContext, SopNode, SopEdge, InstanceStatus, NodeLogStatus } from './types'

// ─── 内存实例缓存（同步访问用，DB 是持久化）─────────
// AUDIT-SYS: 限制缓存大小，防止长时间运行后 OOM
const MAX_INSTANCES_CACHE = 200
const MAX_NODE_LOGS_CACHE = 200
const instancesCache = new Map<string, SopInstance>()
const nodeLogsCache = new Map<string, SopNodeLog[]>()

// AUDIT-SYS: 实例级互斥锁，防止并发 runInstance 导致状态竞态
const runningInstances = new Set<string>()

// LRU 简易淘汰：插入时若超上限，删除最早的 key
function cacheSet<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number) {
  map.set(key, value)
  if (map.size > maxSize) {
    const firstKey = map.keys().next().value
    if (firstKey !== undefined) map.delete(firstKey as K)
  }
}

// ─── SOP 定义序列化/反序列化 ─────────────────────────────────────────────
export function sopDefinitionFromDb(row: any): SopDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    triggerType: row.triggerType as 'manual' | 'auto_schedule' | 'auto_event',
    triggerCondition: row.triggerCondition ? JSON.parse(row.triggerCondition) : undefined,
    nodes: JSON.parse(row.nodes),
    edges: JSON.parse(row.edges),
    category: row.category,
    isActive: row.isActive,
    version: row.version,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

export function sopInstanceFromDb(row: any): SopInstance {
  return {
    id: row.id,
    sopDefinitionId: row.sopDefinitionId,
    sopName: row.definition?.name || '未知',
    customerId: row.customerId,
    customerName: row.customerName,
    currentNodeId: row.currentNodeId,
    status: row.status as InstanceStatus,
    context: JSON.parse(row.context || '{}'),
    startedAt: row.startedAt.getTime(),
    completedAt: row.completedAt?.getTime() || null,
    updatedAt: row.updatedAt.getTime(),
  }
}

// ─── SOP 定义 CRUD ─────────────────────────────────────────────
export async function createSopDefinition(data: {
  name: string
  description?: string
  triggerType?: string
  triggerCondition?: Record<string, unknown>
  nodes: SopNode[]
  edges: SopEdge[]
  category?: string
}): Promise<SopDefinition> {
  const row = await db.sopDefinition.create({
    data: {
      name: data.name,
      description: data.description || '',
      triggerType: data.triggerType || 'manual',
      triggerCondition: data.triggerCondition ? JSON.stringify(data.triggerCondition) : null,
      nodes: JSON.stringify(data.nodes),
      edges: JSON.stringify(data.edges),
      category: data.category || '默认流程',
      isActive: true,
    },
  })
  return sopDefinitionFromDb(row)
}

export async function updateSopDefinition(id: string, data: Partial<{
  name: string
  description: string
  triggerType: string
  triggerCondition: Record<string, unknown>
  nodes: SopNode[]
  edges: SopEdge[]
  category: string
  isActive: boolean
}>): Promise<SopDefinition | null> {
  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.triggerType !== undefined) updateData.triggerType = data.triggerType
  if (data.triggerCondition !== undefined) updateData.triggerCondition = JSON.stringify(data.triggerCondition)
  if (data.nodes !== undefined) { updateData.nodes = JSON.stringify(data.nodes); updateData.version = { increment: 1 } }
  if (data.edges !== undefined) updateData.edges = JSON.stringify(data.edges)
  if (data.category !== undefined) updateData.category = data.category
  if (data.isActive !== undefined) updateData.isActive = data.isActive

  const row = await db.sopDefinition.update({ where: { id }, data: updateData })
  return sopDefinitionFromDb(row)
}

export async function deleteSopDefinition(id: string): Promise<boolean> {
  await db.sopDefinition.delete({ where: { id } })
  return true
}

export async function getSopDefinition(id: string): Promise<SopDefinition | null> {
  const row = await db.sopDefinition.findUnique({ where: { id } })
  return row ? sopDefinitionFromDb(row) : null
}

export async function listSopDefinitions(category?: string): Promise<SopDefinition[]> {
  const rows = await db.sopDefinition.findMany({
    where: category ? { category } : undefined,
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map(sopDefinitionFromDb)
}

// ─── Trigger: 检测触发条件 ─────────────────────────────────────────────
export async function findMatchingSop(event: {
  intent?: string
  valueScore?: number
  message?: string
}): Promise<SopDefinition | null> {
  const allSops = await listSopDefinitions()
  for (const sop of allSops) {
    if (!sop.isActive) continue
    if (sop.triggerType !== 'auto_event') continue
    if (!sop.triggerCondition) continue
    const cond = sop.triggerCondition
    let matched = true
    if (cond.intent && event.intent !== cond.intent) matched = false
    if (cond.minValue && (event.valueScore || 0) < (cond.minValue as number)) matched = false
    if (cond.messageRegex && event.message) {
      const re = new RegExp(cond.messageRegex as string)
      if (!re.test(event.message)) matched = false
    }
    if (matched) return sop
  }
  return null
}

// ─── 创建执行实例 ─────────────────────────────────────────────
export async function createInstance(
  sopDefinitionId: string,
  customerId: string,
  customerName?: string,
  initialContext?: Partial<SkillContext>
): Promise<SopInstance> {
  const sop = await getSopDefinition(sopDefinitionId)
  if (!sop) throw new Error(`SOP 定义不存在: ${sopDefinitionId}`)

  // 找到 trigger 节点作为起点
  const triggerNode = sop.nodes.find(n => n.type === 'trigger')
  if (!triggerNode) throw new Error('SOP 无触发节点')

  const context: SkillContext = {
    customerId,
    customerName,
    ...initialContext,
  }

  const row = await db.sopInstance.create({
    data: {
      sopDefinitionId,
      customerId,
      currentNodeId: triggerNode.id,
      status: 'running',
      context: JSON.stringify(context),
    },
    include: { definition: true },
  })

  const instance = sopInstanceFromDb(row)
  cacheSet(instancesCache, instance.id, instance, MAX_INSTANCES_CACHE)
  cacheSet(nodeLogsCache, instance.id, [], MAX_NODE_LOGS_CACHE)
  return instance
}

// ─── Scheduler: 取下一个节点 ─────────────────────────────────────────────
function getNextNodes(sop: SopDefinition, currentNodeId: string, conditionResult?: 'yes' | 'no' | 'default'): SopNode[] {
  const edges = sop.edges.filter(e => e.from === currentNodeId)
  if (edges.length === 0) return []

  // 如果有条件结果，优先匹配 condition
  if (conditionResult) {
    const matched = edges.filter(e => e.condition === conditionResult)
    if (matched.length > 0) {
      return matched.map(e => sop.nodes.find(n => n.id === e.to)!).filter(Boolean)
    }
    // 退化到 default
    const defaults = edges.filter(e => e.condition === 'default' || !e.condition)
    if (defaults.length > 0) {
      return defaults.map(e => sop.nodes.find(n => n.id === e.to)!).filter(Boolean)
    }
  }

  // 无条件，取所有连线的目标
  return edges.map(e => sop.nodes.find(n => n.id === e.to)!).filter(Boolean)
}

// ─── Executor: 执行单个节点 ─────────────────────────────────────────────
async function executeNode(
  instance: SopInstance,
  sop: SopDefinition,
  node: SopNode
): Promise<{ nextCondition?: 'yes' | 'no' | 'default'; shouldStop?: boolean; stopStatus?: InstanceStatus }> {
  const logId = `${instance.id}_${node.id}_${Date.now()}`
  const startedAt = Date.now()

  const log: SopNodeLog = {
    id: logId,
    sopInstanceId: instance.id,
    nodeId: node.id,
    nodeName: node.name,
    skillName: node.skillName,
    input: { ...instance.context },
    output: null,
    status: 'running',
    startedAt,
    completedAt: null,
    durationMs: 0,
  }

  const appendLog = (updates: Partial<SopNodeLog>) => {
    Object.assign(log, updates)
    log.completedAt = Date.now()
    log.durationMs = log.completedAt - startedAt
    const logs = nodeLogsCache.get(instance.id) || []
    logs.push(log)
    nodeLogsCache.set(instance.id, logs)
    // 持久化到 DB
    db.sopNodeLog.create({
      data: {
        sopInstanceId: instance.id,
        nodeId: node.id,
        nodeName: node.name,
        skillName: node.skillName || null,
        input: JSON.stringify(log.input),
        output: log.output ? JSON.stringify(log.output) : null,
        status: log.status,
        errorMessage: log.errorMessage || null,
        startedAt: new Date(startedAt),
        completedAt: log.completedAt ? new Date(log.completedAt) : null,
        durationMs: log.durationMs,
      },
    }).catch(e => console.error('[SOP] 日志写入失败:', e))
  }

  try {
    switch (node.type) {
      case 'trigger':
        appendLog({ status: 'success', output: { message: 'SOP 触发' } })
        return { nextCondition: 'default' }

      case 'skill': {
        const registry = getSkillRegistry()
        const skill = node.skillName ? registry.getByName(node.skillName) : undefined
        if (!skill) {
          appendLog({ status: 'failed', errorMessage: `Skill 不存在: ${node.skillName}` })
          return { shouldStop: true, stopStatus: 'failed' }
        }
        // 合并 skillParams 到 context
        if (node.skillParams) {
          Object.assign(instance.context, node.skillParams)
        }
        const result = await skill.execute(instance.context)
        if (result.success) {
          // 将输出合并到 context
          Object.assign(instance.context, result.output)
          // 特殊字段提升
          if (result.output.intent) instance.context.intent = result.output.intent as string
          if (result.output.strategy) instance.context.strategy = result.output.strategy as string
          if (result.output.reply) instance.context.reply = result.output.reply as string
          appendLog({ status: 'success', output: result.output })
          return { nextCondition: 'default' }
        } else {
          appendLog({ status: 'failed', errorMessage: result.error })
          return { shouldStop: true, stopStatus: 'failed' }
        }
      }

      case 'condition': {
        if (!node.condition) {
          appendLog({ status: 'failed', errorMessage: '条件节点缺少 condition 配置' })
          return { shouldStop: true, stopStatus: 'failed' }
        }
        const { field, operator, value } = node.condition
        // 从 context 取字段值（支持点号嵌套，如 identity.value）
        const fieldValue = field.split('.').reduce((obj, key) => (obj as any)?.[key], instance.context)
        // AUDIT-SYS: == / != 比较 null 时，undefined 归一化为 null，避免 "undefined !== null" 误判为 true
        //   场景：模板用 {field:'reply', op:'!=', value:null} 判断"客户回复了?"
        //   修复前：reply 字段从未设置时 fieldValue=undefined，"undefined !== null"→true→误判已回复
        //   修复后：undefined 归一化为 null，"null !== null"→false→正确判断未回复
        let conditionMet = false
        const normField = fieldValue === undefined ? null : fieldValue
        const normValue = value === undefined ? null : value
        switch (operator) {
          case '==': conditionMet = normField === normValue; break
          case '!=': conditionMet = normField !== normValue; break
          case '>=': conditionMet = Number(fieldValue) >= Number(value); break
          case '<=': conditionMet = Number(fieldValue) <= Number(value); break
          case '>': conditionMet = Number(fieldValue) > Number(value); break
          case '<': conditionMet = Number(fieldValue) < Number(value); break
          case 'contains': conditionMet = String(fieldValue || '').includes(String(value)); break
        }
        appendLog({ status: 'success', output: { field, fieldValue: normField, operator, value: normValue, conditionMet } })
        return { nextCondition: conditionMet ? 'yes' : 'no' }
      }

      case 'wait': {
        const waitMs = node.waitMs || 60000
        // AUDIT-SYS: 修复 wait 语义。原实现仅 waitMs<=5000 时 await，>5s 直接跳过破坏 SOP 流程。
        //   新策略：
        //   - waitMs <= 30s: 同步等待（适合演示和短流程）
        //   - waitMs > 30s: 标记实例为 paused，写入 resumeAt，等待外部 cron 调用 resumeInstance 续跑
        //   这样既不阻塞主线程过久，又不会丢失"等待"语义。
        if (waitMs <= 30000) {
          await new Promise(r => setTimeout(r, waitMs))
          appendLog({ status: 'success', output: { waitMs, message: `已等待 ${waitMs / 1000}秒` } })
        } else {
          const resumeAt = Date.now() + waitMs
          appendLog({ status: 'success', output: { waitMs, resumeAt, message: `长等待 ${waitMs / 1000}秒，实例转为 paused，等待外部调度 resumeInstance` } })
          // 标记实例暂停，外部调度器应在 resumeAt 后调用 resumeInstance
          ;(instance.context as any).__resumeAt = resumeAt
          ;(instance.context as any).__waitNodeId = node.id
          return { shouldStop: true, stopStatus: 'paused' as InstanceStatus }
        }
        return { nextCondition: 'default' }
      }

      case 'notify': {
        const message = node.notifyMessage || 'SOP 通知'
        const level = node.notifyLevel || 'info'
        console.log(`[SOP 通知] 实例 ${instance.id} 客户 ${instance.customerId}: ${message}`)
        appendLog({ status: 'success', output: { message, level, notified: true } })
        return { nextCondition: 'default' }
      }

      case 'end': {
        const endStatus = node.endStatus || 'success'
        const instanceStatus: InstanceStatus = endStatus === 'human_handoff' ? 'aborted' : 'completed'
        appendLog({ status: 'success', output: { endStatus, message: `SOP 结束: ${endStatus}` } })
        return { shouldStop: true, stopStatus: instanceStatus }
      }

      default:
        appendLog({ status: 'failed', errorMessage: `未知节点类型: ${node.type}` })
        return { shouldStop: true, stopStatus: 'failed' }
    }
  } catch (e) {
    appendLog({ status: 'failed', errorMessage: e instanceof Error ? e.message : '执行异常' })
    return { shouldStop: true, stopStatus: 'failed' }
  }
}

// ─── 运行 SOP 实例（从头到尾，或到 wait/end）─────────
// AUDIT-SYS: 加实例级互斥锁，防止同一实例并发执行导致 context/状态竞态
export async function runInstance(instanceId: string): Promise<SopInstance> {
  if (runningInstances.has(instanceId)) {
    throw new Error(`实例 ${instanceId} 正在运行中，禁止并发执行`)
  }
  runningInstances.add(instanceId)

  try {
    let instance = instancesCache.get(instanceId)
    if (!instance) {
      const row = await db.sopInstance.findUnique({
        where: { id: instanceId },
        include: { definition: true },
      })
      if (!row) throw new Error(`实例不存在: ${instanceId}`)
      instance = sopInstanceFromDb(row)
      cacheSet(instancesCache, instanceId, instance, MAX_INSTANCES_CACHE)
    }

    const sop = await getSopDefinition(instance.sopDefinitionId)
    if (!sop) throw new Error('SOP 定义已删除')

    let currentNodeId = instance.currentNodeId
    let safetyCounter = 0
    const MAX_NODES = 50 // 防止死循环

    while (currentNodeId && safetyCounter < MAX_NODES) {
      safetyCounter++
      const node = sop.nodes.find(n => n.id === currentNodeId)
      if (!node) break

      // 更新当前节点
      instance.currentNodeId = currentNodeId
      instance.updatedAt = Date.now()

      const { nextCondition, shouldStop, stopStatus } = await executeNode(instance, sop, node)

      // 持久化 context 更新
      await db.sopInstance.update({
        where: { id: instanceId },
        data: {
          currentNodeId,
          context: JSON.stringify(instance.context),
          status: shouldStop ? stopStatus : 'running',
          completedAt: shouldStop && stopStatus !== 'paused' ? new Date() : null,
        },
      })

      if (shouldStop) {
        instance.status = stopStatus || 'failed'
        if (stopStatus !== 'paused') {
          instance.completedAt = Date.now()
        }
        break
      }

      // 取下一个节点
      const nextNodes = getNextNodes(sop, currentNodeId, nextCondition)
      if (nextNodes.length === 0) {
        // 无后续节点，自动完成
        instance.status = 'completed'
        instance.completedAt = Date.now()
        await db.sopInstance.update({
          where: { id: instanceId },
          data: { status: 'completed', completedAt: new Date(), currentNodeId: null },
        })
        break
      }
      currentNodeId = nextNodes[0].id
    }

    if (safetyCounter >= MAX_NODES) {
      instance.status = 'failed'
      await db.sopInstance.update({
        where: { id: instanceId },
        data: { status: 'failed' },
      })
    }

    return instance
  } finally {
    // 确保互斥锁一定释放，即使抛错也不会死锁
    runningInstances.delete(instanceId)
  }
}

// ─── 控制：暂停/恢复/终止 ─────────────────────────────────────────────
export async function pauseInstance(instanceId: string): Promise<void> {
  await db.sopInstance.update({ where: { id: instanceId }, data: { status: 'paused' } })
  const inst = instancesCache.get(instanceId)
  if (inst) inst.status = 'paused'
}

export async function resumeInstance(instanceId: string): Promise<SopInstance> {
  await db.sopInstance.update({ where: { id: instanceId }, data: { status: 'running' } })
  return runInstance(instanceId)
}

export async function abortInstance(instanceId: string): Promise<void> {
  await db.sopInstance.update({ where: { id: instanceId }, data: { status: 'aborted', completedAt: new Date() } })
  const inst = instancesCache.get(instanceId)
  if (inst) { inst.status = 'aborted'; inst.completedAt = Date.now() }
}

// ─── 查询 ─────────────────────────────────────────────
export async function listInstances(limit = 50, status?: InstanceStatus): Promise<SopInstance[]> {
  const rows = await db.sopInstance.findMany({
    where: status ? { status } : undefined,
    include: { definition: true },
    orderBy: { startedAt: 'desc' },
    take: limit,
  })
  return rows.map(sopInstanceFromDb)
}

export async function getInstanceLogs(instanceId: string): Promise<SopNodeLog[]> {
  // 优先从缓存读
  const cached = nodeLogsCache.get(instanceId)
  if (cached && cached.length > 0) return cached
  // 退化到 DB
  const rows = await db.sopNodeLog.findMany({
    where: { sopInstanceId: instanceId },
    orderBy: { startedAt: 'asc' },
  })
  return rows.map((r: any) => ({
    id: r.id,
    sopInstanceId: r.sopInstanceId,
    nodeId: r.nodeId,
    nodeName: r.nodeName || '',
    skillName: r.skillName || undefined,
    input: r.input ? JSON.parse(r.input) : null,
    output: r.output ? JSON.parse(r.output) : null,
    status: r.status as NodeLogStatus,
    errorMessage: r.errorMessage || undefined,
    startedAt: r.startedAt.getTime(),
    completedAt: r.completedAt?.getTime() || null,
    durationMs: r.durationMs,
  }))
}
