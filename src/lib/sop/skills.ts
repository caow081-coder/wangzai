/**
 * WAOS SOP 引擎 — Skill 技能实现
 *
 * 12 个原子能力，包装现有 kernel/brain/safety 功能：
 *  - intent_recognition: 意图识别（包装 detectIntent）
 *  - value_evaluation: 商业价值评估（包装 getMultipliers + compilePersona）
 *  - strategy_select: 策略选择（包装 selectStrategy）
 *  - reply_generate: AI 话术生成（调用 /api/waos/brain）
 *  - crm_update: CRM 更新（乐观锁）
 *  - send_message: 发送消息（调用 /api/waos/wechat）
 *  - schedule_followup: 定时跟进（内存定时器）
 *  - human_handoff: 转人工
 *  - knowledge_search: 知识库检索（关键词匹配）
 *  - emotion_analysis: 情绪分析（关键词+上下文，5 类情绪 + 建议）
 *  - competitor_compare: 竞品对比（检测竞品 + RAG 检索 + 硬编码兜底）
 *  - price_calculator: 价格计算器（车型+首付+分期+利率 → 月供）
 */

import { detectIntent, selectStrategy, getMultipliers, compilePersona, matchTemplate, type IdentityVector } from '@/lib/identity/kernel'
import { sanitizeInput, filterOutput } from '@/lib/safety'
import type { Skill, SkillContext, SkillResult, SkillDefinition } from './types'

// 情绪类型字面量联合（供 emotion_analysis 使用）
type EmotionType = 'angry' | 'anxious' | 'excited' | 'satisfied' | 'neutral'

// ─── 工具函数 ─────────────────────────────────────────────
function now() { return Date.now() }

function ok(output: Record<string, unknown>, start: number): SkillResult {
  return { success: true, output, durationMs: now() - start }
}
function fail(error: string, start: number): SkillResult {
  return { success: false, output: {}, error, durationMs: now() - start }
}

// 默认身份向量（新客户）
const DEFAULT_IDENTITY: IdentityVector = { trust: 30, intent: 20, emotion: 50, urgency: 20, resistance: 30, value: 40 }

// ─── 1. intent_recognition 意图识别 ─────────────────────────────────────────────
const intentRecognitionDef: SkillDefinition = {
  id: 'intent_recognition',
  name: '意图识别',
  description: '识别客户消息的意图类型（PRICE/REJECTION/SILENCE_BREAK/GENERAL）+ 置信度 + 紧迫度',
  category: 'recognition',
  inputSchema: { message: 'string' },
  outputSchema: { intent: 'string', confidence: 'number', urgency: 'number', matchedKeywords: 'string[]' },
}

export const intentRecognitionSkill: Skill = {
  definition: intentRecognitionDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const message = ctx.message || ''
      const result = detectIntent(message)
      return ok({
        intent: result.type,
        confidence: result.confidence,
        urgency: result.urgency,
        matchedKeywords: result.matchedKeywords,
      }, start)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '意图识别失败', start)
    }
  },
}

// ─── 2. value_evaluation 商业价值评估 ─────────────────────────────────────────────
const valueEvaluationDef: SkillDefinition = {
  id: 'value_evaluation',
  name: '商业价值评估',
  description: '基于身份向量计算动态乘数（urgency/value/risk/trust）+ 综合价值分',
  category: 'evaluation',
  inputSchema: { identity: 'IdentityVector' },
  outputSchema: { multipliers: 'object', valueScore: 'number', valueLabel: 'string' },
}

export const valueEvaluationSkill: Skill = {
  definition: valueEvaluationDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const identity = ctx.identity || DEFAULT_IDENTITY
      const multipliers = getMultipliers(identity)
      // 综合价值分 = (intent × urgency + value × trust) / 2 × 动态加权
      const baseScore = (identity.intent * multipliers.urgency + identity.value * multipliers.trust) / 2
      const riskAdjusted = baseScore * multipliers.risk
      const valueScore = Math.round(Math.min(100, Math.max(0, riskAdjusted)))
      const valueLabel = valueScore >= 80 ? '高价值' : valueScore >= 50 ? '中价值' : '低价值'
      return ok({ multipliers, valueScore, valueLabel, identity }, start)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '价值评估失败', start)
    }
  },
}

// ─── 3. strategy_select 策略选择 ─────────────────────────────────────────────
const strategySelectDef: SkillDefinition = {
  id: 'strategy_select',
  name: '策略选择',
  description: '基于身份向量+意图选择 4 策略（CLOSE_NOW/SOFT_RECOVERY/RECONNECT_HOOK/STANDARD_REPLY）',
  category: 'evaluation',
  inputSchema: { identity: 'IdentityVector', intent: 'IntentType' },
  outputSchema: { strategy: 'StrategyType', strategyName: 'string', description: 'string', templateHints: 'string[]' },
}

export const strategySelectSkill: Skill = {
  definition: strategySelectDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const identity = ctx.identity || DEFAULT_IDENTITY
      const intent = ctx.intent || 'GENERAL'
      // 用 detectIntent 生成 IntentDetection 对象
      const intentDetection = detectIntent(ctx.message || '')
      const decision = selectStrategy(identity, intentDetection)
      return ok({
        strategy: decision.type,
        strategyName: decision.name,
        description: decision.description,
        templateHints: decision.templateHints,
        confidence: decision.confidence,
      }, start)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '策略选择失败', start)
    }
  },
}

// ─── 4. reply_generate AI 话术生成 ─────────────────────────────────────────────
const replyGenerateDef: SkillDefinition = {
  id: 'reply_generate',
  name: 'AI 话术生成',
  description: '调用 AI 大脑生成话术（先尝试模板匹配，无匹配则走 LLM 多模型降级）',
  category: 'generation',
  inputSchema: { message: 'string', strategy: 'string', intent: 'string', customerId: 'string' },
  outputSchema: { reply: 'string', source: 'template | llm', templateName: 'string?' },
}

export const replyGenerateSkill: Skill = {
  definition: replyGenerateDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const message = ctx.message || ''
      // 先走安全护盾
      const safety = sanitizeInput(message)
      if (!safety.ok) {
        return ok({
          reply: '抱歉，关于这个问题我无法直接回答，请允许我请主管为您解答。',
          source: 'safety_block',
          safetyReason: safety.reason,
        }, start)
      }

      // 1. 先尝试纯模板匹配（0ms，Multi-Speed Pipeline 快速通道）
      const strategy = (ctx.strategy as any) || 'STANDARD_REPLY'
      const intent = (ctx.intent as any) || 'GENERAL'
      const tplResult = matchTemplate(strategy, intent, undefined, {
        车型: (ctx.lead as any)?.carModel,
        客户姓: (ctx.lead as any)?.name?.slice(0, 1),
      })
      // 30% 概率走模板（快速通道），70% 走 LLM（更智能）
      const useTemplate = tplResult.found && Math.random() < 0.3
      if (useTemplate && tplResult.reply) {
        // 输出过滤
        const filtered = filterOutput(tplResult.reply)
        return ok({
          reply: filtered.safe,
          source: 'template',
          templateName: tplResult.template?.description,
        }, start)
      }

      // 2. 走 LLM 多模型降级
      const messages = [
        { role: 'user' as const, content: message },
      ]
      const res = await fetch('http://localhost:3000/api/waos/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model: 'auto', cookies: {} }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      let reply = data.reply || '抱歉，我没听懂，能再说一次吗？'
      // 输出过滤
      const filtered = filterOutput(reply)
      return ok({
        reply: filtered.safe,
        source: 'llm',
        model: data.model,
        tokensUsed: data.tokensUsed,
        latency: data.latency,
        filtered: filtered.filtered,
        filterReason: filtered.reason,
      }, start)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '话术生成失败', start)
    }
  },
}

// ─── 5. crm_update CRM 更新 ─────────────────────────────────────────────
const crmUpdateDef: SkillDefinition = {
  id: 'crm_update',
  name: 'CRM 更新',
  description: '更新线索状态/意向分/标签（乐观锁保护，version 校验）',
  category: 'execution',
  inputSchema: { customerId: 'string', updates: 'object' },
  outputSchema: { success: 'boolean', newVersion: 'number' },
}

export const crmUpdateSkill: Skill = {
  definition: crmUpdateDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      // 调用 CRM 更新 API
      const updates = ctx.updates || {}
      const res = await fetch('http://localhost:3000/api/waos/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', leadId: ctx.customerId, updates }),
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()
      return ok({
        success: data.success ?? true,
        newVersion: data.newVersion ?? 1,
      }, start)
    } catch (e) {
      // 非阻塞：CRM 更新失败不影响 SOP 继续
      return ok({ success: false, error: e instanceof Error ? e.message : 'CRM 更新失败' }, start)
    }
  },
}

// ─── 6. send_message 发送消息 ─────────────────────────────────────────────
const sendMessageDef: SkillDefinition = {
  id: 'send_message',
  name: '发送消息',
  description: '通过微信/抖音/视频号发送消息（调用 ClawBot / DOM 注入）',
  category: 'execution',
  inputSchema: { customerId: 'string', content: 'string', channel: 'string' },
  outputSchema: { sent: 'boolean', messageId: 'string' },
}

export const sendMessageSkill: Skill = {
  definition: sendMessageDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const content = ctx.reply || ctx.message || ''
      if (!content) return fail('发送内容为空', start)

      // 调用微信发送 API（实际场景由 ClawBot 桥接）
      const res = await fetch('http://localhost:3000/api/waos/wechat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'broadcast', message: content }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json()
      return ok({
        sent: data.success ?? false,
        messageId: `msg_${now()}`,
        channel: 'wechat',
      }, start)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '消息发送失败', start)
    }
  },
}

// ─── 7. schedule_followup 定时跟进 ─────────────────────────────────────────────
const scheduleFollowupDef: SkillDefinition = {
  id: 'schedule_followup',
  name: '定时跟进',
  description: '安排延迟跟进任务（1小时/1天/1周后自动触发）',
  category: 'execution',
  inputSchema: { customerId: 'string', delayMs: 'number', reason: 'string' },
  outputSchema: { taskId: 'string', scheduledAt: 'number' },
}

// 内存定时任务存储（重启后清空，生产环境应持久化到 DB）
const followupTasks = new Map<string, { customerId: string; scheduledAt: number; reason: string; timer: NodeJS.Timeout }>()

export const scheduleFollowupSkill: Skill = {
  definition: scheduleFollowupDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const delayMs = (ctx.delayMs as number) || 24 * 60 * 60 * 1000 // 默认 24 小时
      const reason = (ctx.reason as string) || '定时跟进'
      const taskId = `followup_${now()}_${Math.random().toString(36).slice(2, 8)}`
      const scheduledAt = now() + delayMs

      // 设置定时器（生产环境应持久化 + 用 cron 调度）
      const timer = setTimeout(() => {
        console.log(`[SOP] 定时跟进触发: ${taskId} 客户 ${ctx.customerId} 原因 ${reason}`)
        // TODO: 触发新的 SOP 实例或通知人工
      }, delayMs)

      followupTasks.set(taskId, { customerId: ctx.customerId, scheduledAt, reason, timer })
      return ok({ taskId, scheduledAt, reason }, start)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '定时跟进创建失败', start)
    }
  },
}

export function cancelFollowup(taskId: string): boolean {
  const task = followupTasks.get(taskId)
  if (task) {
    clearTimeout(task.timer)
    followupTasks.delete(taskId)
    return true
  }
  return false
}

export function listFollowups() {
  return Array.from(followupTasks.entries()).map(([id, t]) => ({ id, ...t }))
}

// ─── 8. human_handoff 转人工 ─────────────────────────────────────────────
const humanHandoffDef: SkillDefinition = {
  id: 'human_handoff',
  name: '转人工',
  description: '将客户转给人工销售（标记状态 + 通知 + 暂停 AI 自动回复）',
  category: 'notification',
  inputSchema: { customerId: 'string', reason: 'string' },
  outputSchema: { handoffId: 'string', notified: 'boolean' },
}

export const humanHandoffSkill: Skill = {
  definition: humanHandoffDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const reason = (ctx.reason as string) || '客户主动要求人工'
      const handoffId = `handoff_${now()}`
      // 调用通知 API（实际场景应推送到企业微信/钉钉）
      console.log(`[SOP] 转人工: ${handoffId} 客户 ${ctx.customerId} 原因 ${reason}`)
      return ok({
        handoffId,
        notified: true,
        reason,
        message: `已转人工，原因：${reason}。销售请尽快跟进。`,
      }, start)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '转人工失败', start)
    }
  },
}

// ─── 9. knowledge_search 知识库检索 ─────────────────────────────────────────────
const knowledgeSearchDef: SkillDefinition = {
  id: 'knowledge_search',
  name: '知识库检索',
  description: 'RAG 向量检索奔驰知识库（TF-IDF + 余弦相似度），返回 top-K 相关文档',
  category: 'recognition',
  inputSchema: { query: 'string' },
  outputSchema: { matched: 'boolean', results: 'array', topResult: 'string?' },
}

export const knowledgeSearchSkill: Skill = {
  definition: knowledgeSearchDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const query = (ctx.query as string) || ctx.message || ''
      if (!query.trim()) return ok({ matched: false, results: [], topResult: null, query }, start)

      // 调用真实 RAG API（TF-IDF 向量检索）
      const res = await fetch('http://localhost:3000/api/waos/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', query, topK: 5 }),
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()

      if (!data.results || data.results.length === 0) {
        return ok({ matched: false, results: [], topResult: null, query }, start)
      }

      const results = data.results.map((r: any) => ({
        title: r.doc.title,
        content: r.doc.content,
        category: r.doc.category,
        score: Math.round(r.score * 100) / 100,
        matchedKeywords: r.matchedKeywords,
      }))

      return ok({
        matched: true,
        results,
        topResult: results[0]?.content || null,
        topTitle: results[0]?.title || null,
        query,
        totalFound: data.count,
      }, start)
    } catch (e) {
      // RAG API 不可用时，退化到硬编码知识库（保证 SOP 不中断）
      console.warn('[SOP] RAG API 不可用，退化到硬编码知识库:', e instanceof Error ? e.message : e)
      const query = (ctx.query as string) || ctx.message || ''
      const fallback = KNOWLEDGE_BASE.filter(kb => kb.keywords.some(kw => query.includes(kw)))
        .map(kb => ({ title: kb.keywords[0], content: kb.content, category: kb.category, matchedKeywords: kb.keywords.filter(kw => query.includes(kw)) }))
      return ok({
        matched: fallback.length > 0,
        results: fallback,
        topResult: fallback[0]?.content || null,
        query,
        fallback: true,
      }, start)
    }
  },
}

// 硬编码知识库（RAG API 不可用时的降级方案）
const KNOWLEDGE_BASE: { keywords: string[]; content: string; category: string }[] = [
  { keywords: ['C级', 'C200', 'C260'], content: '奔驰C级 2024款 33.23-37.99万，C200L 约33万，C260L 约36万。', category: '轿车' },
  { keywords: ['GLC', 'GLC300', 'GLC260'], content: '奔驰GLC 2024款 42.78-53.13万，GLC260 约43万，GLC300 约50万。', category: 'SUV' },
  { keywords: ['GLE', 'GLE350', 'GLE450'], content: '奔驰GLE 2024款 69.98-88.03万，GLE350 约70万，GLE450 约80万。', category: 'SUV' },
  { keywords: ['E级', 'E260', 'E300'], content: '奔驰E级 2024款 44.01-59.98万，E260L 约44万，E300L 约52万。', category: '轿车' },
  { keywords: ['S级', 'S400', 'S450', '迈巴赫'], content: '奔驰S级 96.26-204.26万，迈巴赫S级 170万起。', category: '旗舰' },
]

// ─── 10. emotion_analysis 情绪分析 ─────────────────────────────────────────────
const emotionAnalysisDef: SkillDefinition = {
  id: 'emotion_analysis',
  name: '情绪分析',
  description: '分析客户消息的情绪状态（愤怒/焦虑/期待/满意/中性），返回情绪分值 + 应对建议',
  category: 'recognition',
  inputSchema: { message: 'string', identity: 'IdentityVector?' },
  outputSchema: { emotion: 'string', score: 'number', suggestion: 'string', matchedKeywords: 'string[]' },
}

// 情绪关键词词典（按优先级排序：愤怒 > 满意 > 焦虑 > 期待）
// score 设计：每类对应一个分数区间，命中关键词数越多情绪越强烈
//  - angry:     30 → 0  （越愤怒分越低）
//  - satisfied: 70 → 100（越满意分越高）
//  - anxious:   30 → 50 （越焦虑分越高）
//  - excited:   50 → 70 （越期待分越高）
//  - neutral:   50
const EMOTION_KEYWORDS: {
  type: Exclude<EmotionType, 'neutral'>
  keywords: string[]
  base: number
  step: number
  min: number
  max: number
  descending: boolean  // true=匹配越多分越低（愤怒），false=匹配越多分越高
}[] = [
  { type: 'angry',     keywords: ['生气', '投诉', '骗子', '退款', '差评', '无语', '离谱'], base: 30, step: 10, min: 0,  max: 30,  descending: true  },
  { type: 'satisfied', keywords: ['谢谢', '满意', '不错', '推荐', '好评'],                base: 70, step: 10, min: 70, max: 100, descending: false },
  { type: 'anxious',   keywords: ['着急', '马上', '今天', '能不能快点', '还有多久'],        base: 30, step: 10, min: 30, max: 50,  descending: false },
  { type: 'excited',   keywords: ['期待', '想要', '喜欢', '什么时候能'],                    base: 50, step: 10, min: 50, max: 70,  descending: false },
]

// 情绪对应的销售建议（suggestion）
const EMOTION_SUGGESTIONS: Record<EmotionType, string> = {
  angry:     '客户情绪激动，建议立即安抚+转人工',
  anxious:   '客户着急，加快响应+给出明确时间',
  excited:   '客户期待，推进试驾邀约',
  satisfied: '客户满意，引导转介绍',
  neutral:   '客户平静，正常沟通',
}

export const emotionAnalysisSkill: Skill = {
  definition: emotionAnalysisDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const message = (ctx.message || '').toLowerCase()
      const identity = ctx.identity

      // 1. 关键词匹配（按优先级，命中第一个即停止）
      let emotion: EmotionType = 'neutral'
      let score = 50
      let matchedKeywords: string[] = []

      for (const def of EMOTION_KEYWORDS) {
        const hits = def.keywords.filter(kw => message.includes(kw.toLowerCase()))
        if (hits.length > 0) {
          // 第一个命中关键词已经落入 base（避免 0 命中时仍计入）
          const intensity = hits.length - 1
          score = def.descending
            ? Math.max(def.min, def.base - intensity * def.step)
            : Math.min(def.max, def.base + intensity * def.step)
          emotion = def.type
          matchedKeywords = hits
          break
        }
      }

      // 2. 上下文调整：当关键词未命中时，用 identity.emotion 软判断
      if (emotion === 'neutral' && identity) {
        if (identity.emotion < 30) {
          emotion = 'angry'
          score = 25
          matchedKeywords.push(`identity.emotion=${identity.emotion}`)
        } else if (identity.emotion > 75) {
          emotion = 'satisfied'
          score = 80
          matchedKeywords.push(`identity.emotion=${identity.emotion}`)
        }
      }

      return ok({
        emotion,
        score,
        suggestion: EMOTION_SUGGESTIONS[emotion],
        matchedKeywords,
        identityEmotion: identity?.emotion ?? null,
      }, start)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '情绪分析失败', start)
    }
  },
}

// ─── 11. competitor_compare 竞品对比 ─────────────────────────────────────────────
const competitorCompareDef: SkillDefinition = {
  id: 'competitor_compare',
  name: '竞品对比',
  description: '检测客户提及的竞品（宝马/奥迪/雷克萨斯/特斯拉），调用 RAG 知识库检索并生成对比话术',
  category: 'recognition',
  inputSchema: { message: 'string' },
  outputSchema: {
    competitor: 'string',
    ourModel: 'string',
    advantages: 'string[]',
    disadvantages: 'string[]',
    suggestedPitch: 'string',
  },
}

// 竞品关键词 → 我方车型映射表（含硬编码优劣势 + 推荐话术，RAG 不可用时兜底）
interface CompetitorEntry {
  pattern: RegExp
  competitor: string
  ourModel: string
  advantages: string[]      // 我方优势
  disadvantages: string[]   // 我方劣势（客观承认，建立信任）
  pitch: string             // 推荐话术
}
const COMPETITOR_MAP: CompetitorEntry[] = [
  {
    pattern: /X3|宝马X3/i,
    competitor: '宝马X3',
    ourModel: 'GLC',
    advantages: ['内饰豪华感强', '轴距2977mm空间宽敞', '9AT变速箱平顺', '终端价格略低性价比高'],
    disadvantages: ['操控感稍弱于X3', '品牌运动属性不如宝马'],
    pitch: 'GLC和X3我都熟，GLC内饰豪华、空间宽敞更适合家用，X3操控好一些。同价位GLC配置更丰富，要不周末来店里面两台车都看看？',
  },
  {
    pattern: /5系|宝马5系/i,
    competitor: '宝马5系',
    ourModel: 'E级',
    advantages: ['后排豪华行政气场', '内饰设计领先一代', 'MBUX智能交互系统', '商务属性更强'],
    disadvantages: ['操控感稍弱', '科技感包装略保守'],
    pitch: 'E级和5系都是行政级标杆，E级后排豪华感、内饰设计更胜一筹，5系操控和科技感突出。商务接待多的话E级气场更足，您主要用车场景是？',
  },
  {
    pattern: /X5|宝马X5/i,
    competitor: '宝马X5',
    ourModel: 'GLE',
    advantages: ['舒适性更高', '7座可选', '空气悬挂', '隔音出色'],
    disadvantages: ['运动感不如X5', '操控略弱'],
    pitch: 'GLE和X5都中大型SUV，GLE舒适度更高、可选7座，X5运动感更强。家用+商务接待GLE更合适，您家人多吗？需要7座吗？',
  },
  {
    pattern: /3系|宝马3系/i,
    competitor: '宝马3系',
    ourModel: 'C级',
    advantages: ['设计年轻运动', '内饰豪华感领先', 'ISG轻混动力平顺', '油耗更低'],
    disadvantages: ['操控标杆稍弱', '运动定位不如3系'],
    pitch: 'C级和3系都是入门豪华标杆，C级设计年轻、内饰豪华，3系操控是标杆。日常代步C级更舒适省油，您更看重操控还是豪华感？',
  },
  {
    pattern: /Model\s*S|特斯拉Model\s*S/i,
    competitor: '特斯拉Model S',
    ourModel: 'EQE',
    advantages: ['豪华感强', '内饰用料扎实', 'NVH静谧性出色', '奔驰服务网络完善'],
    disadvantages: ['科技感稍弱', '续航不及Model S'],
    pitch: 'EQE和Model S都是高端纯电，EQE豪华感、静谧性、服务网络更好，Model S科技领先、续航更长。看重豪华品质和售后，EQE更适合您。',
  },
  {
    pattern: /A4|奥迪A4/i,
    competitor: '奥迪A4L',
    ourModel: 'C级',
    advantages: ['内饰豪华感领先', '设计更年轻', '动力平顺', '品牌调性更时尚'],
    disadvantages: ['终端优惠可能不及A4L', '四驱系统不如quattro'],
    pitch: 'C级和A4L都是入门豪华，C级内饰豪华、设计年轻，A4L终端优惠大、四驱系统强。如果您重视内饰和品牌调性，C级更对味。',
  },
  {
    pattern: /A6|奥迪A6/i,
    competitor: '奥迪A6L',
    ourModel: 'E级',
    advantages: ['后排豪华', '内饰设计领先', '行政气场更足'],
    disadvantages: ['终端优惠不及A6L', '科技配置略保守'],
    pitch: 'E级和A6L都是行政级，E级后排豪华、内饰设计领先，A6L终端优惠大、四驱稳定。商务接待E级气场更足。',
  },
  {
    pattern: /Q5|奥迪Q5/i,
    competitor: '奥迪Q5L',
    ourModel: 'GLC',
    advantages: ['内饰豪华', '空间宽敞', '9AT平顺'],
    disadvantages: ['终端优惠不及Q5L', '四驱不如quattro'],
    pitch: 'GLC和Q5L都中型SUV，GLC内饰豪华、空间大，Q5L终端优惠大、四驱强。看重豪华和空间选GLC，看重性价比选Q5L。',
  },
  {
    pattern: /雷克萨斯|Lexus|RX|ES/i,
    competitor: '雷克萨斯',
    ourModel: 'GLE',
    advantages: ['豪华感更强', '动力更充沛', '终端有优惠', '配置丰富'],
    disadvantages: ['混动省油性稍弱', '保值率雷克萨斯略高'],
    pitch: 'GLE和雷克萨斯RX都中大型SUV，GLE豪华感、动力更强，雷克萨斯混动省油、保值率高。看重豪华和动力选GLE，看重省油保值选雷克萨斯。',
  },
  {
    pattern: /特斯拉|Tesla|Model\s*3/i,
    competitor: '特斯拉',
    ourModel: 'EQE',
    advantages: ['豪华感强', '服务网络完善', 'NVH静谧性出色', '售后体系成熟'],
    disadvantages: ['科技感稍弱', '续航不及特斯拉'],
    pitch: 'EQE和特斯拉都是纯电，EQE豪华感、静谧性、服务网络更好，特斯拉科技领先、续航长。看重豪华品质选EQE。',
  },
]

export const competitorCompareSkill: Skill = {
  definition: competitorCompareDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const message = ctx.message || ''

      // 1. 检测竞品关键词（按数组顺序，命中第一个即返回）
      const matched = COMPETITOR_MAP.find(c => c.pattern.test(message))
      if (!matched) {
        return ok({
          detected: false,
          competitor: '',
          ourModel: '',
          advantages: [],
          disadvantages: [],
          suggestedPitch: '',
        }, start)
      }

      // 2. 调用 RAG 知识库搜索对比信息（10s 超时保护）
      let ragTitle: string | null = null
      let ragContent: string | null = null
      try {
        const res = await fetch('http://localhost:3000/api/waos/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'search',
            query: `${matched.ourModel} vs ${matched.competitor} 对比`,
            topK: 3,
          }),
          signal: AbortSignal.timeout(10000),
        })
        const data = await res.json()
        if (data.results && data.results.length > 0) {
          ragTitle = data.results[0].doc.title || null
          ragContent = data.results[0].doc.content || null
        }
      } catch (e) {
        // RAG 不可用，降级到硬编码（不中断 SOP）
        console.warn('[SOP] 竞品对比 RAG 不可用，使用硬编码兜底:', e instanceof Error ? e.message : e)
      }

      // 3. 生成最终话术（RAG 内容作为补充材料附在硬编码话术后）
      const suggestedPitch = ragContent
        ? `${matched.pitch}\n\n（参考资料：${ragContent.slice(0, 120)}${ragContent.length > 120 ? '...' : ''}）`
        : matched.pitch

      return ok({
        detected: true,
        competitor: matched.competitor,
        ourModel: matched.ourModel,
        advantages: matched.advantages,
        disadvantages: matched.disadvantages,
        suggestedPitch,
        ragSource: ragTitle,
      }, start)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '竞品对比失败', start)
    }
  },
}

// ─── 12. price_calculator 价格计算器 ─────────────────────────────────────────────
const priceCalculatorDef: SkillDefinition = {
  id: 'price_calculator',
  name: '价格计算器',
  description: '根据车型+首付比例+分期数+利率计算月供（裸车价/首付/贷款额/月供/总利息）',
  category: 'evaluation',
  inputSchema: {
    carModel: 'string',
    downPaymentRatio: 'number',  // 0.2-0.5
    months: 'number',            // 36/48/60
    interestRate: 'number',      // 0-0.05（年化）
  },
  outputSchema: {
    carModel: 'string',
    price: 'number',
    downPayment: 'number',
    loanAmount: 'number',
    monthlyPayment: 'number',
    totalInterest: 'number',
    months: 'number',
    breakdown: 'string',
  },
}

// 车型价格字典（单位：万元）— 范围 + 中位价
interface CarPriceEntry { min: number; max: number; mid: number; label: string }
const CAR_PRICE_DICT: Record<string, CarPriceEntry> = {
  'C级':     { min: 33,  max: 38,  mid: 35.5, label: '奔驰C级'   },
  'GLC':     { min: 42,  max: 53,  mid: 47.5, label: '奔驰GLC'   },
  'GLE':     { min: 70,  max: 88,  mid: 79,   label: '奔驰GLE'   },
  'E级':     { min: 44,  max: 60,  mid: 52,   label: '奔驰E级'   },
  'S级':     { min: 96,  max: 204, mid: 150,  label: '奔驰S级'   },
  'EQE':     { min: 47,  max: 53,  mid: 50,   label: '奔驰EQE'   },
  'AMG C63': { min: 80,  max: 100, mid: 90,   label: 'AMG C63'   },
}

export const priceCalculatorSkill: Skill = {
  definition: priceCalculatorDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const carModelRaw = (ctx.carModel as string) || ''
      const downPaymentRatio = (ctx.downPaymentRatio as number) ?? 0.3
      const months = (ctx.months as number) ?? 36
      const interestRate = (ctx.interestRate as number) ?? 0.0299  // 默认 2.99%

      // 1. 校验车型（支持模糊匹配，如 "C260L" → "C级"）
      let priceInfo: CarPriceEntry | undefined = CAR_PRICE_DICT[carModelRaw]
      if (!priceInfo) {
        const key = Object.keys(CAR_PRICE_DICT).find(k => carModelRaw.includes(k))
        priceInfo = key ? CAR_PRICE_DICT[key] : undefined
      }
      if (!priceInfo) {
        return fail(
          `未知车型: ${carModelRaw}，支持的车型: ${Object.keys(CAR_PRICE_DICT).join('/')}`,
          start,
        )
      }

      // 2. 校验首付比例（0.2-0.5）
      if (downPaymentRatio < 0.2 || downPaymentRatio > 0.5) {
        return fail(`首付比例必须在 0.2-0.5 之间，当前: ${downPaymentRatio}`, start)
      }

      // 3. 校验分期数（36/48/60）
      if (![36, 48, 60].includes(months)) {
        return fail(`分期数必须为 36/48/60，当前: ${months}`, start)
      }

      // 4. 校验利率（0-5%）
      if (interestRate < 0 || interestRate > 0.05) {
        return fail(`年利率必须在 0-5% 之间，当前: ${(interestRate * 100).toFixed(2)}%`, start)
      }

      // 5. 计算（简化等额本息近似：月供 = 贷款额 × (1 + 利率 × 年数) / 期数）
      const priceWan = priceInfo.mid                                              // 裸车价（万元）
      const downPaymentWan = +(priceWan * downPaymentRatio).toFixed(2)            // 首付（万元）
      const loanAmountWan = +(priceWan - downPaymentWan).toFixed(2)               // 贷款额（万元）
      const years = months / 12                                                   // 年数
      const totalInterestWan = +(loanAmountWan * interestRate * years).toFixed(2) // 总利息（万元）
      const monthlyPaymentWan = +(loanAmountWan * (1 + interestRate * years) / months).toFixed(4)
      const monthlyPaymentYuan = Math.round(monthlyPaymentWan * 10000)           // 月供（元）

      // 6. 生成中文明细文案
      const breakdown = `${priceInfo.label} 裸车 ${priceWan}万，首付 ${Math.round(downPaymentRatio * 100)}% = ${downPaymentWan}万，贷款 ${loanAmountWan}万，${months}期月供 ${monthlyPaymentYuan}元，总利息 ${totalInterestWan}万`

      return ok({
        carModel: priceInfo.label,
        price: priceWan,
        priceRange: `${priceInfo.min}-${priceInfo.max}万`,
        downPayment: downPaymentWan,
        downPaymentRatio,
        loanAmount: loanAmountWan,
        monthlyPayment: monthlyPaymentYuan,
        monthlyPaymentWan,
        totalInterest: totalInterestWan,
        months,
        interestRate,
        years,
        breakdown,
      }, start)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '价格计算失败', start)
    }
  },
}

// ─── 所有 Skill 导出列表 ─────────────────────────────────────────────
export const ALL_SKILLS: Skill[] = [
  intentRecognitionSkill,
  valueEvaluationSkill,
  strategySelectSkill,
  replyGenerateSkill,
  crmUpdateSkill,
  sendMessageSkill,
  scheduleFollowupSkill,
  humanHandoffSkill,
  knowledgeSearchSkill,
  emotionAnalysisSkill,
  competitorCompareSkill,
  priceCalculatorSkill,
]

export const SKILL_DEFINITIONS = ALL_SKILLS.map(s => s.definition)
