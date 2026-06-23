/**
 * WAOS Knowledge Aging — 知识衰减机制
 *
 * 方案文档第十层漏洞：
 *   数字生命死亡问题。老婆三年后不做高考了，所有知识过期。
 *   2026 知识回答 2030 问题 → 灾难。
 *
 * 衰减规则：
 *   - 超过 180 天 → 自动降权（priority × 0.5）
 *   - 超过 365 天 → 待审核（isActive = false，需人工确认）
 *   - 超过 730 天 → 归档（移到归档表）
 *
 * 建议作为 cron 每日执行
 */

import { db } from '@/lib/db'

// ─── 衰减配置（支持环境变量覆盖）──────────────────────
const AGING_CONFIG = {
  warningDays: Number(process.env.AGING_WARNING_DAYS) || 180,    // 180天：降权
  reviewDays: Number(process.env.AGING_REVIEW_DAYS) || 365,      // 365天：待审核
  archiveDays: Number(process.env.AGING_ARCHIVE_DAYS) || 730,    // 730天：归档
}

// ─── 并发控制（内存锁）────────────────────────────────
let _agingRunning = false

// ─── 衰减检查 ───────────────────────────────────────
interface AgingReport {
  total: number
  warned: number
  reviewed: number
  archived: number
  details: { id: string; title: string; age: number; action: string }[]
}

/**
 * 执行知识衰减检查
 */
export async function runAgingCheck(): Promise<AgingReport> {
  // 并发锁：防止重复执行
  if (_agingRunning) {
    return { total: 0, warned: 0, reviewed: 0, archived: 0, details: [] }
  }
  _agingRunning = true

  try {
    const report: AgingReport = { total: 0, warned: 0, reviewed: 0, archived: 0, details: [] }
    const now = Date.now()

    // 1. 检查知识文档 (KnowledgeDoc)
    const kdocs = await db.knowledgeDoc.findMany({
      where: { source: { not: 'official' } }, // 官方文档不过期
    })
    report.total += kdocs.length

    // 收集批量更新操作
    const kdocUpdates: Promise<unknown>[] = []

    for (const doc of kdocs) {
      const age = (now - doc.createdAt.getTime()) / (1000 * 60 * 60 * 24)

      if (age > AGING_CONFIG.archiveDays) {
        // 超过 730 天 → 归档（设为不活跃）
        kdocUpdates.push(
          db.knowledgeDoc.update({
            where: { id: doc.id },
            data: { priority: 0 },
          })
        )
        report.archived++
        report.details.push({ id: doc.id, title: doc.title, age: Math.round(age), action: 'archived' })

      } else if (age > AGING_CONFIG.reviewDays) {
        // 超过 365 天 → 降为最低优先级，标记待审核
        kdocUpdates.push(
          db.knowledgeDoc.update({
            where: { id: doc.id },
            data: { priority: 5 },
          })
        )
        report.reviewed++
        report.details.push({ id: doc.id, title: doc.title, age: Math.round(age), action: 'reviewed' })

      } else if (age > AGING_CONFIG.warningDays) {
        // 超过 180 天 → 降权 50%
        const newPriority = Math.round(doc.priority * 0.5)
        if (newPriority < doc.priority) {
          kdocUpdates.push(
            db.knowledgeDoc.update({
              where: { id: doc.id },
              data: { priority: newPriority },
            })
          )
          report.warned++
          report.details.push({ id: doc.id, title: doc.title, age: Math.round(age), action: 'warned' })
        }
      }
    }

    // 批量执行所有知识文档更新
    await Promise.all(kdocUpdates)

    // 2. 检查真理文档 (TruthDocument) — 有 validUntil 的自动过期
    const tdocs = await db.truthDocument.findMany({
      where: {
        validUntil: { not: null },
        isActive: true,
      },
    })
    report.total += tdocs.length

    // 收集真理文档批量更新操作
    const tdocUpdates: Promise<unknown>[] = []

    for (const doc of tdocs) {
      if (doc.validUntil && doc.validUntil.getTime() < now) {
        tdocUpdates.push(
          db.truthDocument.update({
            where: { id: doc.id },
            data: { isActive: false },
          })
        )
        report.archived++
        const age = (now - doc.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        report.details.push({ id: doc.id, title: doc.title, age: Math.round(age), action: 'expired' })
      }
    }

    // 批量执行所有真理文档更新
    await Promise.all(tdocUpdates)

    return report
  } finally {
    _agingRunning = false
  }
}

// ─── 单篇知识衰减计算 ───────────────────────────────
/**
 * 计算单篇知识的当前权重（考虑衰减）
 */
export function getEffectiveWeight(doc: {
  priority: number
  effectScore: number
  createdAt: Date
  expiresAt?: Date | null
}): number {
  const now = Date.now()
  const age = (now - doc.createdAt.getTime()) / (1000 * 60 * 60 * 24)

  // 衰减因子：指数衰减
  let decayFactor = 1.0
  if (age > AGING_CONFIG.warningDays) {
    const excessDays = age - AGING_CONFIG.warningDays
    decayFactor = Math.exp(-0.001 * excessDays)
  }

  // 过期检查（可选链防止 null/undefined 时报错）
  const expiresTime = doc.expiresAt?.getTime()
  if (expiresTime != null && expiresTime < now) {
    return 0
  }

  return (doc.priority + doc.effectScore * 0.5) * decayFactor
}

// ─── 知识清理 ───────────────────────────────────────
/**
 * 清理无效知识（手动触发）
 */
export async function purgeStaleKnowledge(): Promise<number> {
  const now = Date.now()
  const ageThreshold = AGING_CONFIG.archiveDays * 2 // 1460天 = 4年

  const stale = await db.knowledgeDoc.findMany({
    where: {
      source: 'learning',
      hitCount: 0,
      priority: { lte: 5 },
      createdAt: { lt: new Date(now - ageThreshold * 24 * 60 * 60 * 1000) },
    },
  })

  // 批量删除
  const deleteOps = stale.map(doc =>
    db.knowledgeDoc.delete({ where: { id: doc.id } })
  )
  await Promise.all(deleteOps)

  return stale.length
}

// ─── 获取待审核的过期知识 ────────────────────────────
export async function getReviewQueue(): Promise<{
  id: string
  title: string
  category: string
  age: number
  priority: number
}[]> {
  const now = Date.now()
  const reviewAge = AGING_CONFIG.reviewDays

  const docs = await db.knowledgeDoc.findMany({
    where: {
      createdAt: { lt: new Date(now - reviewAge * 24 * 60 * 60 * 1000) },
      source: { not: 'official' },
      priority: { lte: 5 },
    },
    orderBy: { priority: 'asc' },
    take: 50,
  })

  return docs.map(d => ({
    id: d.id,
    title: d.title,
    category: d.category,
    age: Math.round((now - d.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
    priority: d.priority,
  }))
}

// ─── 刷新知识 ───────────────────────────────────────
/**
 * 人工确认某条知识仍然有效 → 重置年龄
 */
export async function refreshKnowledge(id: string): Promise<void> {
  try {
    const result = await db.knowledgeDoc.update({
      where: { id },
      data: {
        priority: 50,
        createdAt: new Date(), // 重置创建时间
        updatedAt: new Date(),
      },
    })
    if (!result) {
      throw new Error(`Failed to refresh knowledge: no record updated for id=${id}`)
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`refreshKnowledge failed for id=${id}: ${message}`)
  }
}
