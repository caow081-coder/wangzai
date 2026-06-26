/**
 * WAOS Learning Engine — 学习引擎
 *
 * 方案文档第八层漏洞：
 *   实时学习 = 大错特错。今天客户说"傻逼"，AI 实时学习，明天全废。
 *   正确做法：实时记录 → 夜间训练 → 人工审核 → 上线
 *   类似 Git Commit
 *
 * 方案文档第七层漏洞：
 *   不是看"用了之后成交了"，而是对比"如果当时不用会怎样"
 *   反事实评估（counterfactual evaluation）
 *
 * 核心流程：
 *   1. 每日离线分析昨日对话
 *   2. 提取候选模板
 *   3. 计算效果评分
 *   4. 生成审核建议 → 进入 LearningReview 队列
 *   5. 人工审核通过 → 上线
 */

import { db } from '@/lib/db'
import { compressConversation } from './memory'
import { analyzeActionEffectiveness, type ActionEffectiveness } from './decision-replay'

// ─── 配置常量 ─────────────────────────────────────────
const LEARNING_CONFIG = {
  /** 相似度阈值，超过此值才归入同一聚类 */
  SIMILARITY_THRESHOLD: 0.6,
  /** 模板最低出现次数才建议入库 */
  TEMPLATE_MIN_COUNT: 3,
  /** 模板内容最小字符长度 */
  TEMPLATE_MIN_LENGTH: 5,
  /** 模板内容最大字符长度 */
  TEMPLATE_MAX_LENGTH: 500,
  /** 每轮最多建议条数 */
  MAX_SUGGESTIONS: 10,
  /** 低转化率阈值 */
  LOW_CONVERSION_RATE: 0.1,
  /** 高转化率阈值 */
  HIGH_CONVERSION_RATE: 0.5,
  /** 低转化判断最低使用次数 */
  LOW_CONVERSION_MIN_USES: 5,
  /** 高转化判断最低使用次数 */
  HIGH_CONVERSION_MIN_USES: 3,
  /** 学习模板写入知识库时的 priority */
  KNOWLEDGE_PRIORITY: 30,
} as const

// ─── 类型 ────────────────────────────────────────────
export interface LearningResult {
  newTemplates: TemplateSuggestion[]
  newRules: RuleSuggestion[]
  personaUpdates: PersonaSuggestion[]
  memoryCompressions: number
  errors: string[]
}

export interface TemplateSuggestion {
  content: string
  intent: string
  source: string        // 来源对话ID
  effectEstimate: number // 预估效果 0-100
  reason: string
}

export interface RuleSuggestion {
  playbookKey: string   // intent|stage|action
  currentRate: number
  suggestedRate: number
  reason: string
}

export interface PersonaSuggestion {
  trait: string
  currentBias: number
  suggestedBias: number
  reason: string
}

// ─── 夜间训练主流程 ─────────────────────────────────
/**
 * 每日离线训练（建议 cron 凌晨 3:00 执行）
 */
export async function nightlyTraining(): Promise<LearningResult> {
  const result: LearningResult = {
    newTemplates: [],
    newRules: [],
    personaUpdates: [],
    memoryCompressions: 0,
    errors: [],
  }

  // 子任务之间无依赖，并行执行
  const [templatesResult, rulesResult, compressedResult, personaResult] =
    await Promise.allSettled([
      mineTemplates(),
      optimizePlaybook(),
      compressDailyMemories(),
      suggestPersonaUpdates(),
    ])

  if (templatesResult.status === 'fulfilled') {
    result.newTemplates = templatesResult.value
  } else {
    console.error('[LearningEngine] mineTemplates failed:', templatesResult.reason)
    result.errors.push(`mineTemplates: ${String(templatesResult.reason)}`)
  }

  if (rulesResult.status === 'fulfilled') {
    result.newRules = rulesResult.value
  } else {
    console.error('[LearningEngine] optimizePlaybook failed:', rulesResult.reason)
    result.errors.push(`optimizePlaybook: ${String(rulesResult.reason)}`)
  }

  if (compressedResult.status === 'fulfilled') {
    result.memoryCompressions = compressedResult.value
  } else {
    console.error('[LearningEngine] compressDailyMemories failed:', compressedResult.reason)
    result.errors.push(`compressDailyMemories: ${String(compressedResult.reason)}`)
  }

  if (personaResult.status === 'fulfilled') {
    result.personaUpdates = personaResult.value
  } else {
    console.error('[LearningEngine] suggestPersonaUpdates failed:', personaResult.reason)
    result.errors.push(`suggestPersonaUpdates: ${String(personaResult.reason)}`)
  }

  return result
}

// ─── 模板挖掘 ───────────────────────────────────────
async function mineTemplates(): Promise<TemplateSuggestion[]> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // 获取昨日所有人工回复（role=human 的消息）
  const humanMessages = await db.message.findMany({
    where: {
      role: 'human',
      timestamp: { gte: yesterday },
    },
    select: { content: true, intentLabel: true, leadId: true },
  })

  if (humanMessages.length === 0) return []

  // 聚类：相同 intent 下，长度相近的回复归为一组
  const groups = new Map<string, { content: string; count: number }[]>()

  for (const msg of humanMessages) {
    const intent = msg.intentLabel || 'GENERAL'
    if (!groups.has(intent)) groups.set(intent, [])

    const existing = groups.get(intent)!.find(g =>
      similarityScore(g.content, msg.content) > LEARNING_CONFIG.SIMILARITY_THRESHOLD
    )

    if (existing) {
      existing.count++
    } else {
      groups.get(intent)!.push({ content: msg.content, count: 1 })
    }
  }

  // 筛选：出现 3 次以上的回复 → 建议为模板
  const suggestions: TemplateSuggestion[] = []

  for (const [intent, msgs] of groups) {
    for (const msg of msgs) {
      if (msg.count >= LEARNING_CONFIG.TEMPLATE_MIN_COUNT && msg.content.length > LEARNING_CONFIG.TEMPLATE_MIN_LENGTH && msg.content.length < LEARNING_CONFIG.TEMPLATE_MAX_LENGTH) {
        suggestions.push({
          content: msg.content,
          intent,
          source: 'daily_training',
          effectEstimate: Math.min(100, msg.count * 20),
          reason: `昨日出现 ${msg.count} 次，建议纳入 [${intent}] 模板库`,
        })
      }
    }
  }

  // 写入审核队列
  for (const s of suggestions.slice(0, LEARNING_CONFIG.MAX_SUGGESTIONS)) {
    await db.learningReview.create({
      data: {
        type: 'template',
        suggestion: JSON.stringify(s),
        source: 'learning_engine',
        status: 'pending',
      },
    })
  }

  return suggestions.slice(0, LEARNING_CONFIG.MAX_SUGGESTIONS)
}

// ─── Playbook 优化 ──────────────────────────────────
async function optimizePlaybook(): Promise<RuleSuggestion[]> {
  const effectiveness = await analyzeActionEffectiveness()
  const suggestions: RuleSuggestion[] = []

  for (const eff of effectiveness) {
    // 转化率 < 10% 的动作 → 建议降权或替换
    if (eff.totalUses >= LEARNING_CONFIG.LOW_CONVERSION_MIN_USES && eff.conversionRate < LEARNING_CONFIG.LOW_CONVERSION_RATE) {
      suggestions.push({
        playbookKey: `${eff.intent}|${eff.stage}|${eff.action}`,
        currentRate: eff.conversionRate,
        suggestedRate: 0,
        reason: `动作 [${eff.action}] 在 [${eff.intent}]/[${eff.stage}] 场景下转化率仅 ${(eff.conversionRate * 100).toFixed(1)}%，建议替换或降权`,
      })
    }

    // 转化率 > 50% 的动作 → 建议提升优先级
    if (eff.totalUses >= LEARNING_CONFIG.HIGH_CONVERSION_MIN_USES && eff.conversionRate > LEARNING_CONFIG.HIGH_CONVERSION_RATE) {
      suggestions.push({
        playbookKey: `${eff.intent}|${eff.stage}|${eff.action}`,
        currentRate: eff.conversionRate,
        suggestedRate: eff.conversionRate,
        reason: `动作 [${eff.action}] 在 [${eff.intent}]/[${eff.stage}] 场景下转化率高达 ${(eff.conversionRate * 100).toFixed(1)}%，建议提升优先级`,
      })
    }
  }

  return suggestions
}

// ─── 记忆压缩 ───────────────────────────────────────
async function compressDailyMemories(): Promise<number> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // 获取昨日有对话的所有客户
  const activeLeads = await db.message.findMany({
    where: { timestamp: { gte: yesterday } },
    select: { leadId: true },
    distinct: ['leadId'],
  })

  let compressed = 0
  for (const { leadId } of activeLeads) {
    if (!leadId) continue

    const messages = await db.message.findMany({
      where: { leadId, timestamp: { gte: yesterday } },
      orderBy: { timestamp: 'asc' },
      select: { role: true, content: true, timestamp: true },
    })

    if (messages.length >= 3) {
      await compressConversation(leadId, messages)
      compressed++
    }
  }

  return compressed
}

// ─── 人格更新建议 ───────────────────────────────────
async function suggestPersonaUpdates(): Promise<PersonaSuggestion[]> {
  // 检查人格锚点漂移
  const { checkDrift } = await import('./persona-anchor')
  const drift = checkDrift('default')

  if (drift.level !== 'normal') {
    return [{
      trait: 'overall',
      currentBias: drift.score,
      suggestedBias: 0,
      reason: drift.message + ' — ' + drift.recommendation,
    }]
  }

  return []
}

// ─── 相似度工具（Jaccard Bigram）──────────────────────
function similarityScore(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0

  const bigramsOf = (s: string): Set<string> => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2))
    }
    return set
  }

  const aBigrams = bigramsOf(a)
  const bBigrams = bigramsOf(b)

  if (aBigrams.size === 0 && bBigrams.size === 0) return 1
  if (aBigrams.size === 0 || bBigrams.size === 0) return 0

  let intersection = 0
  for (const bg of aBigrams) {
    if (bBigrams.has(bg)) intersection++
  }

  const union = aBigrams.size + bBigrams.size - intersection
  return intersection / union
}

// ─── 审核批准 ───────────────────────────────────────
export async function approveLearning(id: string): Promise<void> {
  const review = await db.learningReview.findUnique({ where: { id } })
  if (!review || review.status !== 'pending') return

  if (review.type === 'template') {
    const suggestion = JSON.parse(review.suggestion) as TemplateSuggestion
    await db.$transaction([
      db.knowledgeDoc.create({
        data: {
          title: '[学习] ' + suggestion.intent,
          content: suggestion.content,
          category: suggestion.intent,
          keywords: suggestion.intent,
          source: 'learning',
          priority: LEARNING_CONFIG.KNOWLEDGE_PRIORITY,
          effectScore: suggestion.effectEstimate,
        },
      }),
      db.learningReview.update({
        where: { id },
        data: { status: 'approved', reviewedAt: new Date() },
      }),
    ])
  } else {
    await db.learningReview.update({
      where: { id },
      data: { status: 'approved', reviewedAt: new Date() },
    })
  }
}

export async function rejectLearning(id: string): Promise<void> {
  try {
    await db.learningReview.update({
      where: { id },
      data: { status: 'rejected', reviewedAt: new Date() },
    })
  } catch (e) {
    console.error('[LearningEngine] rejectLearning failed:', e)
    throw e
  }
}
