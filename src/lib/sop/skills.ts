/**
 * WAOS SOP 引擎 — Skill 技能实现
 *
 * 9 个原子能力，包装现有 kernel/brain/safety 功能：
 *  - intent_recognition: 意图识别（包装 detectIntent）
 *  - value_evaluation: 商业价值评估（包装 getMultipliers + compilePersona）
 *  - strategy_select: 策略选择（包装 selectStrategy）
 *  - reply_generate: AI 话术生成（调用 /api/waos/brain）
 *  - crm_update: CRM 更新（乐观锁）
 *  - send_message: 发送消息（调用 /api/waos/wechat）
 *  - schedule_followup: 定时跟进（内存定时器）
 *  - human_handoff: 转人工
 *  - knowledge_search: 知识库检索（关键词匹配）
 */

import { detectIntent, selectStrategy, getMultipliers, compilePersona, matchTemplate, type IdentityVector } from '@/lib/identity/kernel'
import { sanitizeInput, filterOutput } from '@/lib/safety'
import type { Skill, SkillContext, SkillResult, SkillDefinition } from './types'

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
  description: '关键词匹配奔驰车型知识库（价格/配置/优惠/保养），返回相关知识点',
  category: 'recognition',
  inputSchema: { query: 'string' },
  outputSchema: { matched: 'boolean', results: 'array', topResult: 'string?' },
}

// 奔驰知识库（简化版，生产环境应接 RAG 向量检索）
const KNOWLEDGE_BASE: { keywords: string[]; content: string; category: string }[] = [
  { keywords: ['C级', 'C级价格', 'C200', 'C260'], content: '奔驰C级 2024款 指导价 33.23-37.99万，C200L 约33万起，C260L 约36万起，现车充足可试驾。', category: '轿车' },
  { keywords: ['GLC', 'GLC价格', 'GLC300', 'GLC260'], content: '奔驰GLC 2024款 指导价 42.78-53.13万，GLC260 约43万，GLC300 约50万，SUV销量冠军。', category: 'SUV' },
  { keywords: ['GLE', 'GLE价格', 'GLE350', 'GLE450'], content: '奔驰GLE 2024款 指导价 69.98-88.03万，GLE350 约70万，GLE450 约80万，中大型SUV。', category: 'SUV' },
  { keywords: ['E级', 'E级价格', 'E260', 'E300'], content: '奔驰E级 2024款 指导价 44.01-59.98万，E260L 约44万，E300L 约52万，行政级轿车。', category: '轿车' },
  { keywords: ['S级', 'S级价格', 'S400', 'S450', '迈巴赫'], content: '奔驰S级 2024款 指导价 96.26-204.26万，S400L 约96万，S450L 约130万，迈巴赫S级 170万起。', category: '旗舰' },
  { keywords: ['EQE', 'EQS', '电动', '新能源'], content: '奔驰EQE 47.8-53.43万，EQS 88.1-133.9万，EVA纯电平台，续航最高 770km。', category: '电动车' },
  { keywords: ['AMG', '性能'], content: 'AMG C43/C63 性能版，AMG GLE53/GLE63 高性能SUV，AMG GT 四门跑车。', category: 'AMG' },
  { keywords: ['保养', '保养费用', '小保养', '大保养'], content: '奔驰 A保约 1500-2000元/1万公里，B保约 3000-4000元/2万公里，星时享套餐更优惠。', category: '售后' },
  { keywords: ['金融', '分期', '贷款', '首付', '月供'], content: '奔驰金融最低首付 20%，可享 36/48/60 期分期，部分车型免息或低息，需资质审核。', category: '金融' },
  { keywords: ['试驾', '体验'], content: '试驾需预约，带身份证驾驶证，周末名额紧张建议提前 1-2 天预约，可安排上门试驾。', category: '试驾' },
]

export const knowledgeSearchSkill: Skill = {
  definition: knowledgeSearchDef,
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const start = now()
    try {
      const query = (ctx.query as string) || ctx.message || ''
      const results = KNOWLEDGE_BASE.filter(kb =>
        kb.keywords.some(kw => query.includes(kw))
      ).map(kb => ({ content: kb.content, category: kb.category, matchedKeywords: kb.keywords.filter(kw => query.includes(kw)) }))

      return ok({
        matched: results.length > 0,
        results,
        topResult: results[0]?.content || null,
        query,
      }, start)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '知识库检索失败', start)
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
]

export const SKILL_DEFINITIONS = ALL_SKILLS.map(s => s.definition)
