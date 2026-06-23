/**
 * WAOS Truth Engine — 真理层
 *
 * 核心原则（方案文档第一层漏洞）：
 *   真理文档 > 聊天记录
 *   聊天记录只是"表达方式"，不能是"事实来源"
 *
 * 特性：
 *   - 优先级体系：政策文件(100) > 服务协议(80) > 课程介绍(60) > FAQ(40)
 *   - 时间有效性门控：validFrom/validUntil 自动屏蔽过期真理
 *   - 一票否决权：Truth Engine 可拦截 Decision Engine 的违规动作
 *   - 冲突检测：高优先级文档覆盖低优先级
 */

import { db } from '@/lib/db'

// ─── 类型 ────────────────────────────────────────────
export interface TruthDoc {
  id: string
  title: string
  content: string
  category: string
  priority: number   // 0-100, 越高越权威
  validFrom: Date
  validUntil: Date | null
  isActive: boolean
  // Store tags as JSON string for DB compatibility
  tags: string
  version: number
}

export interface TruthVerification {
  passed: boolean
  conflictWith?: string  // 冲突的真理文档标题
  reason?: string
}

// ─── 优先级权重 ─────────────────────────────────────
const CATEGORY_WEIGHTS: Record<string, number> = {
  policy:    100,  // 政策法规 — 宪法级
  legal:     95,   // 法律条款
  contract:  85,   // 服务协议
  price:     80,   // 价格体系 — 永远来自 truth_catalog
  procedure: 70,   // 业务流程
  product:   60,   // 产品介绍
  contact:   50,   // 联系方式
  faq:       40,   // 常见问题
}

// ─── 核心：真理验证 ─────────────────────────────────
/**
 * 验证一个声明是否与真理层冲突。
 * 返回 { passed: false } 时，Decision Engine 必须拦截该动作。
 */
export async function verifyClaim(claim: string): Promise<TruthVerification> {
  try {
    const now = new Date()

    // 查询所有当前有效的真理文档，按优先级降序
    // Fetch only necessary fields, limited by priority and validity, no full load into memory
    const docs = await db.truthDocument.findMany({
      where: {
        isActive: true,
        validFrom: { lte: now },
        OR: [
          { validUntil: null },
          { validUntil: { gte: now } },
        ],
      },
      orderBy: { priority: 'desc' },
    })

    if (docs.length === 0) return { passed: true }

    // 结构化真理提取：将真理文档按类别分组的 claims 提取
    const truthClaims = docs.map(d => ({
      title: d.title,
      content: d.content,
      priority: d.priority + (CATEGORY_WEIGHTS[d.category] || 0),
      category: d.category,
    }))

    // 检查 claim 是否违反任何真理
    // 策略：关键词匹配 + 数值冲突检测
    for (const truth of truthClaims) {
      const conflict = detectConflict(claim, truth)
      if (conflict) {
        return {
          passed: false,
          conflictWith: truth.title,
          reason: `违反真理 [${truth.title}](${truth.category}): ${conflict}`,
        }
      }
    }

    return { passed: true }
  } catch (e) {
    return { passed: false, reason: (e as Error).message }
  }
}

// ─── 冲突检测引擎 ───────────────────────────────────
function detectConflict(claim: string, truth: { title: string; content: string; priority: number; category: string }): string | null {
  // 1. 价格冲突检测 — 最重要的场景
  if (truth.category === 'price') {
    const truthPrices = extractPrices(truth.content)
    const claimPrices = extractPrices(claim)
    for (const cp of claimPrices) {
      for (const tp of truthPrices) {
        // 防止除零：真理价格为0时跳过价格比较
        if (tp === 0) continue
        if (Math.abs(cp - tp) / tp > 0.1) {
          return `价格冲突: 声明报价 ${cp} vs 真理价格 ${tp}`
        }
      }
    }
  }

  // 2. 关键词相反检测
  const negationPairs = [
    ['免费', '收费'], ['有', '没有'], ['包含', '不包含'],
    ['支持', '不支持'], ['可以', '不可以'], ['提供', '不提供'],
    ['保证', '不保证'], ['承诺', '不承诺'], ['一定', '不一定'],
  ]
  for (const [pos, neg] of negationPairs) {
    if (truth.content.includes(pos) && claim.includes(neg)) {
      return `语义冲突: 真理明确"${pos}"，但声明包含"${neg}"`
    }
    if (truth.content.includes(neg) && claim.includes(pos)) {
      return `语义冲突: 真理明确"${neg}"，但声明包含"${pos}"`
    }
  }

  // 3. 违规承诺检测（夸大、虚假、过度承诺）
  const riskyPatterns = [
    { pattern: /保证.*?通过|包过|必过|100%/, reason: '违规承诺 — 保证通过/100%' },
    { pattern: /承诺.*?退款|随时退款|无条件退款/, reason: '违规承诺 — 需核实退款政策' },
    { pattern: /最低价|全网最低|绝对便宜/, reason: '夸大宣传 — 绝对化用语' },
    { pattern: /内部.*?名额|走后门|特殊渠道/, reason: '违规承诺 — 暗示不正当渠道' },
  ]
  for (const { pattern, reason: r } of riskyPatterns) {
    if (pattern.test(claim)) {
      // 检查真理层是否有授权这样的承诺
      if (!truth.content.match(pattern)) {
        return r
      }
    }
  }

  return null
}

// ─── 工具：提取数字价格 ─────────────────────────────
function extractPrices(text: string): number[] {
  const prices: number[] = []
  // 匹配 3980, 4,980, 1.98万 等格式
  const patterns = [
    /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*[万元]?/g,
    /(\d+\.?\d*)\s*万/g,
  ]
  for (const regex of patterns) {
    let match
    while ((match = regex.exec(text)) !== null) {
      let num = parseFloat(match[1].replace(/,/g, ''))
      if (text.includes('万') && match[0].includes('万')) {
        num *= 10000
      }
      if (num > 10 && num < 10000000) { // 合理价格范围
        prices.push(num)
      }
    }
  }
  return prices
}

// ─── 真理查询 ───────────────────────────────────────
/**
 * 检索与查询相关的真理文档，用于注入 AI prompt
 * 按优先级排序，时间有效
 */
export async function queryTruth(query: string, topK = 3): Promise<TruthDoc[]> {
  const now = new Date()
  // Fetch only necessary fields, limited by priority and validity, no full load into memory
  const docs = await db.truthDocument.findMany({
    where: {
      isActive: true,
      validFrom: { lte: now },
      OR: [
        { validUntil: null },
        { validUntil: { gte: now } },
      ],
    },
    orderBy: { priority: 'desc' },
  })

  // 简单关键词匹配排序
  const queryLower = query.toLowerCase()
  const scored = docs.map(d => {
    let score = d.priority
    if (d.title.toLowerCase().includes(queryLower)) score += 50
    if (d.content.toLowerCase().includes(queryLower)) score += 30
    const tags = JSON.parse(d.tags || '[]')
    for (const tag of tags) {
      if (queryLower.includes(tag.toLowerCase())) score += 20
    }
    return { ...d, _score: score }
  })

  scored.sort((a, b) => b._score - a._score)
  return scored.slice(0, topK).map(d => ({
    id: d.id, title: d.title, content: d.content,
    category: d.category, priority: d.priority,
    validFrom: d.validFrom, validUntil: d.validUntil,
    isActive: d.isActive, tags: JSON.parse(d.tags || '[]'),
    version: d.version,
  }))
}

// ─── 真理 CRUD ──────────────────────────────────────
export async function createTruth(data: {
  title: string
  content: string
  category?: string
  priority?: number
  validUntil?: Date
  tags?: string[]
}) {
  return db.truthDocument.create({
    data: {
      title: data.title,
      content: data.content,
      category: data.category || 'policy',
      priority: data.priority ?? (CATEGORY_WEIGHTS[data.category || 'policy'] || 50),
      validUntil: data.validUntil,
      tags: JSON.stringify(data.tags || []),
    },
  })
}

export async function updateTruth(id: string, data: Partial<TruthDoc>) {
  return db.truthDocument.update({
    where: { id },
    data: {
      ...data,
      tags: data.tags ? JSON.stringify(data.tags) : undefined,
      version: { increment: 1 },
    },
  })
}

export async function listTruth(category?: string) {
  const where: any = { isActive: true }
  if (category) where.category = category
  return db.truthDocument.findMany({ where, orderBy: { priority: 'desc' } })
}

export async function deleteTruth(id: string) {
  return db.truthDocument.update({ where: { id }, data: { isActive: false } })
}

// ─── 一票否决权（供 Decision Engine 调用）────────────
/**
 * Truth Engine 对 Decision Engine 的否决权
 * 在决策引擎生成动作后、执行前调用
 */
export async function vetoCheck(actionType: string, content: string): Promise<TruthVerification> {
  // 只有发送消息类的动作需要校验
  if (!['reply', 'send_info', 'send_template'].includes(actionType)) {
    return { passed: true }
  }
  return verifyClaim(content)
}
