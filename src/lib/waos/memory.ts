/**
 * WAOS Memory Engine — 记忆压缩引擎
 *
 * 方案文档第二层漏洞：
 *   1万客户 × 100条记忆 = 100万记忆节点，GPT 塞不进去
 *   解决方案：压缩 + 遗忘曲线 + 重要性评分
 *
 * 核心机制：
 *   - 短期记忆：最近 30 天对话原文
 *   - 长期记忆：压缩后的结构化事实（4行 vs 300页）
 *   - 遗忘曲线：score = importance × e^(-λ × days)
 *   - 记忆覆盖：同一事实更新而非新增（孩子560→580）
 *   - 检索时 Top-K：控制 token 成本
 */

import { db } from '@/lib/db'

// ─── 类型 ────────────────────────────────────────────
export interface MemoryFact {
  id: string
  customerId: string
  fact: string
  category: string
  importance: number     // 0-100
  decayFactor: number    // 衰减系数
  confidence: number     // 置信度
  version: number
  lastAccessed: Date
  createdAt: Date
}

export interface ScoredMemory extends MemoryFact {
  score: number          // 综合得分：重要性 × 遗忘 × 相关度
  relevance: number      // 与查询的相关度
  decay: number          // 遗忘系数
}

// ─── 衰减系数配置 ───────────────────────────────────
const DECAY_RATES: Record<string, number> = {
  personal:   0.005,
  education:  0.008,
  finance:    0.015,
  preference: 0.020,
  general:    0.010,
  temporary:  0.050,
}

// ─── 核心：记忆检索 ─────────────────────────────────
export async function retrieveMemories(
  customerId: string,
  query: string,
  topK = 5
): Promise<ScoredMemory[]> {
  const now = Date.now()
  const memories = await db.memoryLong.findMany({
    where: { customerId },
    orderBy: { importance: 'desc' },
    take: 200,
  })

  if (memories.length === 0) return []

  const scoredPromises = memories.map(async (m) => {
    const daysSinceAccess = (now - m.lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
    const decay = Math.exp(-((m.decayFactor ?? 0.01)) * daysSinceAccess)
    const relevance = computeRelevance(m.fact, query)
    const score = m.importance * decay * relevance

    try {
      await db.memoryLong.update({
        where: { id: m.id },
        data: { lastAccessed: new Date() },
      })
    } catch { /* non-critical */ }

    return {
      id: m.id, customerId: m.customerId, fact: m.fact,
      category: m.category, importance: m.importance,
      decayFactor: m.decayFactor, confidence: m.confidence,
      version: m.version, lastAccessed: m.lastAccessed,
      createdAt: m.createdAt, score, relevance, decay,
    }
  })

  // P0 FIX: await Promise.all before using scored
  const scored = await Promise.all(scoredPromises)

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

// ─── 相关性计算 ─────────────────────────────────────
function computeRelevance(fact: string, query: string): number {
  if (!query) return 0.5

  const factLower = fact.toLowerCase()
  const queryLower = query.toLowerCase()
  let score = 0

  const queryWords = queryLower.split(/\s+/)
  for (const word of queryWords) {
    if (word.length < 2) continue
    if (factLower.includes(word)) {
      score += word.length / factLower.length * 10
    }
  }

  const factBigrams = new Set<string>()
  for (let i = 0; i < factLower.length - 1; i++) factBigrams.add(factLower.slice(i, i + 2))
  const queryBigrams = new Set<string>()
  for (let i = 0; i < queryLower.length - 1; i++) queryBigrams.add(queryLower.slice(i, i + 2))
  let overlap = 0
  for (const bg of Array.from(queryBigrams)) {
    if (factBigrams.has(bg)) overlap++
  }
  const jaccard = overlap / Math.max(1, factBigrams.size + queryBigrams.size - overlap)
  score += jaccard * 5
  return Math.min(1, Math.max(0.1, score / 15))
}

// ─── 记忆压缩 ───────────────────────────────────────
export async function compressConversation(
  customerId: string,
  messages: { role: string; content: string; timestamp: Date }[]
): Promise<string[]> {
  if (!messages?.length) return []
  const facts = extractFacts(messages)
  const savedFacts: string[] = []
  for (const fact of facts) {
    const merged = await upsertMemory(customerId, fact)
    if (merged) savedFacts.push(merged.fact)
  }
  return savedFacts
}

// ─── 事实提取 ───────────────────────────────────────
interface ExtractedFact {
  fact: string
  category: string
  importance: number
}

function extractFacts(messages: { role: string; content: string; timestamp: Date }[]): ExtractedFact[] {
  const facts: ExtractedFact[] = []
  const userTexts = messages.filter(m => m.role === 'user').map(m => m.content)
  const combined = userTexts.join(' ')

  const scoreMatch = combined.match(/(\d{3})\s*分/)
  if (scoreMatch) {
    facts.push({ fact: `客户成绩 ${scoreMatch[1]}分`, category: 'education', importance: 90 })
  }

  const locationMatch = combined.match(/(辽宁|北京|上海|广东|浙江|江苏|山东|河南|湖北|湖南|四川|重庆|天津|河北|山西|内蒙古|吉林|黑龙江|安徽|福建|江西|广西|海南|贵州|云南|西藏|陕西|甘肃|青海|宁夏|新疆)/)
  if (locationMatch) {
    facts.push({ fact: `客户所在地 ${locationMatch[1]}`, category: 'personal', importance: 70 })
  }

  if (/理科/.test(combined)) facts.push({ fact: '客户理科', category: 'education', importance: 75 })
  if (/文科/.test(combined)) facts.push({ fact: '客户文科', category: 'education', importance: 75 })

  const intentMatch = combined.match(/想[报考学读]?\s*([\u4e00-\u9fa5]{2,6})/)
  if (intentMatch) {
    facts.push({ fact: `目标 ${intentMatch[1]}`, category: 'education', importance: 80 })
  }

  if (/孩子|儿子|女儿|小孩/.test(combined)) {
    if (/儿子/.test(combined)) facts.push({ fact: '客户有儿子', category: 'family', importance: 85 })
    else if (/女儿/.test(combined)) facts.push({ fact: '客户有女儿', category: 'family', importance: 85 })
    else facts.push({ fact: '客户有孩子', category: 'family', importance: 80 })
  }

  const budgetMatch = combined.match(/(\d{4,6})\s*[元块]|预算\s*(\d{4,6})/)
  if (budgetMatch) {
    facts.push({ fact: `预算约${budgetMatch[1] || budgetMatch[2]}元`, category: 'finance', importance: 75 })
  }

  return facts
}

// ─── 记忆覆盖（upsert）────────────────────────────────
async function upsertMemory(
  customerId: string,
  fact: ExtractedFact
): Promise<{ fact: string } | null> {
  const existing = await db.memoryLong.findMany({
    where: { customerId, category: fact.category },
  })

  for (const mem of existing) {
    const similarity = computeRelevance(mem.fact, fact.fact)
    if (similarity > 0.6) {
      await db.memoryLong.update({
        where: { id: mem.id },
        data: {
          fact: fact.fact,
          importance: Math.max(mem.importance, fact.importance),
          confidence: Math.min(1, mem.confidence + 0.1),
          version: mem.version + 1,
          lastAccessed: new Date(),
        },
      })
      return { fact: fact.fact }
    }
  }

  await db.memoryLong.create({
    data: {
      customerId, fact: fact.fact, category: fact.category,
      importance: fact.importance,
      decayFactor: DECAY_RATES[fact.category] || 0.01,
      confidence: 0.7,
    },
  })
  return { fact: fact.fact }
}

// ─── 遗忘清理 ───────────────────────────────────────
export async function purgeStaleMemories(threshold = 0.01): Promise<number> {
  const now = Date.now()
  const all = await db.memoryLong.findMany()
  const toDelete: string[] = []
  for (const mem of all) {
    const days = (now - mem.lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
    const score = mem.importance * Math.exp(-mem.decayFactor * days)
    if (score < threshold) toDelete.push(mem.id)
  }
  if (toDelete.length > 0) {
    await db.memoryLong.deleteMany({ where: { id: { in: toDelete } } })
  }
  return toDelete.length
}

// ─── 格式化：注入 Prompt ────────────────────────────
export function formatMemoriesForPrompt(memories: ScoredMemory[]): string {
  if (memories.length === 0) return ''
  const lines = memories.map((m, i) =>
    `${i + 1}. ${m.fact} [重要性:${Math.round(m.importance)} 置信度:${Math.round(m.confidence * 100)}%]`
  )
  return `【客户长期记忆】\n${lines.join('\n')}\n`
}
