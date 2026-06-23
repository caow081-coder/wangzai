/**
 * WAOS Decision Replay Engine — 决策回放引擎
 *
 * 方案文档第九层漏洞（最值钱的一层）：
 *   客户成交 → 系统自动分析"为什么成交" → 生成成交路径 → 训练成交剧本
 *   未来不是"回复客户"，而是"复制成交路径"
 *
 * 核心功能：
 *   1. 记录每次决策（DecisionLog）
 *   2. 分析成交路径（从初次接触到成交的完整决策链）
 *   3. 生成成交剧本（可复制的决策模式）
 *   4. 计算动作效果（哪个动作带来转化）
 */

import { db } from '@/lib/db'

// ─── 类型 ────────────────────────────────────────────
export interface DecisionRecord {
  customerId: string
  intent: string | null
  stage: string | null
  personaMix: string | null
  action: string
  templateId: string | null
  replyContent: string | null
  result: string | null
  confidence: number
  latency: number
  tokensUsed: number
}

export interface ConversionPath {
  customerId: string
  steps: ConversionStep[]
  totalDays: number
  result: 'won' | 'lost' | 'ongoing'
}

export interface ConversionStep {
  day: number
  intent: string | null
  stage: string | null
  action: string
  templateId: string | null
  replyContent: string | null
  result: string | null
  timestamp: Date
}

export interface ActionEffectiveness {
  intent: string
  stage: string
  action: string
  templateId: string | null
  totalUses: number
  conversions: number    // 使用该动作后最终成交的次数
  conversionRate: number // 转化率
  avgConfidence: number
}

// ─── 记录决策 ───────────────────────────────────────
export async function logDecision(record: DecisionRecord): Promise<void> {
  await db.decisionLog.create({
    data: {
      customerId: record.customerId,
      intent: record.intent,
      stage: record.stage,
      personaMix: record.personaMix,
      action: record.action,
      templateId: record.templateId,
      replyContent: record.replyContent,
      result: record.result,
      confidence: record.confidence,
      latency: record.latency,
      tokensUsed: record.tokensUsed,
    },
  })
}

// ─── 分析成交路径 ───────────────────────────────────
/**
 * 回溯一个客户的完整决策链：从第一次接触到最后结果
 */
export async function analyzeConversionPath(customerId: string): Promise<ConversionPath | null> {
  const logs = await db.decisionLog.findMany({
    where: { customerId },
    orderBy: { createdAt: 'asc' },
  })

  if (logs.length === 0) return null

  const firstDate = logs[0].createdAt
  const lastDate = logs[logs.length - 1].createdAt
  const totalDays = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))

  // 判断最终结果
  const lastLog = logs[logs.length - 1]
  let result: 'won' | 'lost' | 'ongoing' = 'ongoing'
  if (lastLog.result === 'converted' || lastLog.result === 'won') result = 'won'
  else if (lastLog.result === 'lost' || lastLog.result === 'rejected') result = 'lost'

  const steps: ConversionStep[] = logs.map((log, i) => ({
    day: i === 0 ? 0 : Math.ceil((log.createdAt.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)),
    intent: log.intent,
    stage: log.stage,
    action: log.action,
    templateId: log.templateId,
    replyContent: log.replyContent,
    result: log.result,
    timestamp: log.createdAt,
  }))

  return { customerId, steps, totalDays, result }
}

// ─── 生成成交剧本 ───────────────────────────────────
/**
 * 分析所有成交客户的行为模式，提取可复制的"成交剧本"
 */
export async function generatePlaybook(): Promise<ConversionPath[]> {
  // 获取所有成交的客户
  const wonLogs = await db.decisionLog.findMany({
    where: { result: { in: ['converted', 'won'] } },
    select: { customerId: true },
    distinct: ['customerId'],
  })

  const wonCustomerIds = Array.from(new Set(wonLogs.map(l => l.customerId)))

  const paths: ConversionPath[] = []
  for (const cid of wonCustomerIds.slice(0, 50)) { // 限50个防过载
    const path = await analyzeConversionPath(cid)
    if (path) paths.push(path)
  }

  return paths
}

// ─── 动作效果分析 ───────────────────────────────────
/**
 * 计算每个动作（intent+stage+action 组合）的转化效果
 * 核心指标：使用次数、成交次数、转化率
 */
export async function analyzeActionEffectiveness(): Promise<ActionEffectiveness[]> {
  const logs = await db.decisionLog.findMany({
    orderBy: { createdAt: 'asc' },
  })

  // 先找出所有成交的客户
  const wonCustomers = new Set<string>()
  for (const log of logs) {
    if (log.result === 'converted' || log.result === 'won') {
      wonCustomers.add(log.customerId)
    }
  }

  // 按 intent+stage+action+templateId 分组统计
  const groups = new Map<string, { total: number; conversions: number; confidences: number[] }>()

  for (const log of logs) {
    const key = `${log.intent || 'unknown'}|${log.stage || 'unknown'}|${log.action}|${log.templateId || 'none'}`
    if (!groups.has(key)) {
      groups.set(key, { total: 0, conversions: 0, confidences: [] })
    }
    const g = groups.get(key)!
    g.total++
    g.confidences.push(log.confidence)
    if (wonCustomers.has(log.customerId)) {
      g.conversions++
    }
  }

  return Array.from(groups.entries()).map(([key, g]) => {
    const [intent, stage, action, templateId] = key.split('|')
    return {
      intent,
      stage,
      action,
      templateId: templateId === 'none' ? null : templateId,
      totalUses: g.total,
      conversions: g.conversions,
      conversionRate: g.total > 0 ? g.conversions / g.total : 0,
      avgConfidence: g.confidences.reduce((a, b) => a + b, 0) / g.confidences.length,
    }
  }).sort((a, b) => b.conversionRate - a.conversionRate)
}

// ─── 反事实评估 ─────────────────────────────────────
/**
 * 方案文档要求：不是看"用了之后成交了"，而是对
 * 比"如果当时不用这个模板，而是用旧模板，成交概率会是多少"
 *
 * 简化实现：比较同 intent+stage 下不同 action 的转化率差异
 */
export async function counterfactualAnalysis(intent: string, stage: string): Promise<{
  actions: { action: string; templateId: string | null; rate: number; lift: number }[]
  baseline: number
}> {
  const all = await analyzeActionEffectiveness()
  const relevant = all.filter(a => a.intent === intent && a.stage === stage)

  if (relevant.length === 0) return { actions: [], baseline: 0 }

  // 基线 = 所有动作的平均转化率
  const baseline = relevant.reduce((sum, a) => sum + a.conversionRate, 0) / relevant.length

  return {
    actions: relevant.map(a => ({
      action: a.action,
      templateId: a.templateId,
      rate: a.conversionRate,
      lift: baseline > 0 ? (a.conversionRate - baseline) / baseline : 0,
    })),
    baseline,
  }
}

// ─── 决策路径摘要（注入 AI prompt）─────────────────
export function formatConversionPath(path: ConversionPath): string {
  if (!path || path.steps.length === 0) return ''

  const lines = [
    '【成交路径回放】',
    '总天数: ' + path.totalDays + '天  结果: ' + (path.result === 'won' ? '✓ 成交' : path.result === 'lost' ? '✗ 流失' : '进行中'),
    '',
  ]

  for (const step of path.steps) {
    const dayStr = step.day === 0 ? 'Day 1' : 'Day ' + (step.day + 1)
    lines.push(dayStr + ' [' + (step.intent || '?') + '] ' + step.action + (step.templateId ? ' (模板:' + step.templateId + ')' : ''))
  }

  return lines.join('\n')
}
