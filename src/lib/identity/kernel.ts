/**
 * 旺财 Identity Kernel — 身份核
 *
 * 基于6.21方案: 人设不是"配置"，是"可编译的执行程序"
 *
 * L0: Identity Kernel — 用户身份向量
 * L1: Persona Compiler — 人格编译器(混合人格)
 * L2: Execution Agents — 执行体
 */

export interface IdentityVector {
  trust: number
  intent: number
  emotion: number
  urgency: number
  resistance: number
  value: number
}

export interface PersonaBlend {
  blends: { personaId: string; personaName: string; weight: number }[]
  compiled: {
    warmth: number
    professionalism: number
    pressure: number
    patience: number
    humor: number
    authority: number
    speed: 'slow' | 'medium' | 'fast'
    emojiLevel: number
  }
  strategy: string
  confidence: number
}

export function driftIdentity(current: IdentityVector, delta: Partial<IdentityVector>): IdentityVector {
  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  return {
    trust: clamp(current.trust + (delta.trust || 0)),
    intent: clamp(current.intent + (delta.intent || 0)),
    emotion: clamp(current.emotion + (delta.emotion || 0)),
    urgency: clamp(current.urgency + (delta.urgency || 0)),
    resistance: clamp(current.resistance + (delta.resistance || 0)),
    value: clamp(current.value + (delta.value || 0)),
  }
}

export function inferDelta(message: string): Partial<IdentityVector> {
  const delta: Partial<IdentityVector> = {}
  if (/多少钱|价格|优惠|便宜|划算|贵/.test(message)) { delta.intent = 15; delta.value = 10 }
  if (/想买|换车|考虑|需要|想要|试驾|到店/.test(message)) { delta.intent = 20; delta.urgency = 10; delta.trust = 5 }
  if (/首付|月供|贷款|分期|免息/.test(message)) { delta.value = 15; delta.intent = 10 }
  if (/太贵|不值|算了|不用了|再看看|考虑考虑/.test(message)) { delta.emotion = -15; delta.resistance = 10; delta.urgency = -5 }
  if (/谢谢|好的|不错|喜欢|满意|推荐/.test(message)) { delta.emotion = 15; delta.trust = 10; delta.resistance = -5 }
  if (/宝马|奥迪|雷克萨斯|和.*比|哪个好|对比/.test(message)) { delta.value = -5; delta.intent = 5 }
  return delta
}

export function compilePersona(identity: IdentityVector, personas: any[]): PersonaBlend {
  const { trust, intent, emotion, urgency, resistance, value } = identity
  const scores = personas.map(p => {
    let score = 0
    if (p.role === 'sales' && p.id !== 'closer' && intent > 60 && trust > 50) { score = intent * 0.8 + trust * 0.2 }
    else if (p.role === 'sales' && p.id === 'closer' && intent > 70 && resistance > 50) { score = intent * 0.6 + resistance * 0.3 }
    else if (p.role === 'service' && (emotion < 40 || resistance > 60)) { score = (100 - emotion) * 0.5 + resistance * 0.3 + 30 }
    else if (p.role === 'bd' && value < 50) { score = (100 - value) * 0.4 + 40 }
    else if (p.role === 'marketing' && intent < 40) { score = (100 - intent) * 0.3 + 30 }
    else { score = 30 }
    return { persona: p, score }
  })
  const topK = scores.sort((a, b) => b.score - a.score).slice(0, 3)
  const totalScore = topK.reduce((sum, s) => sum + s.score, 0) || 1
  const blends = topK.map(s => ({ personaId: s.persona.id, personaName: s.persona.shortName, weight: Math.round((s.score / totalScore) * 100) }))
  const getParam = (key: string) => Math.round(blends.reduce((sum, b) => { const p = personas.find(p => p.id === b.personaId); return sum + ((p as any)?.personality?.[key] || 50) * b.weight / 100 }, 0))
  const compiled = {
    warmth: getParam('warmth'), professionalism: getParam('professionalism'), pressure: getParam('pressure'),
    patience: getParam('patience'), humor: getParam('humor'), authority: getParam('authority'),
    speed: urgency > 70 ? 'fast' as const : urgency > 40 ? 'medium' as const : 'slow' as const,
    emojiLevel: Math.round(blends.reduce((sum, b) => { const p = personas.find(p => p.id === b.personaId); return sum + ((p as any)?.tone?.emojiLevel || 2) * b.weight / 100 }, 0)),
  }
  let strategy = '理解需求，温和推荐'
  if (intent > 70 && trust > 60) strategy = '推进试驾邀约，锁定意向'
  else if (intent > 70 && resistance > 50) strategy = '限时优惠+现车稀缺促单'
  else if (emotion < 30) strategy = '情绪安抚+售后关怀'
  else if (value < 40) strategy = '价值重塑+竞品对比'
  else if (intent < 30) strategy = '内容种草+长期培育'
  const confidence = Math.min(0.95, (topK[0]?.score || 0) / 100)
  return { blends, compiled, strategy, confidence }
}

export function fastRuleEngine(message: string): { handled: boolean; reply?: string; reason?: string } {
  if (/多少钱|价格|报价/.test(message) && !/具体|详细/.test(message)) return { handled: true, reply: '您好！车型不同价格也不同，方便告诉我您关注的是哪款吗？C级/GLC/GLE/E级/S级我都能帮您查最新优惠~', reason: 'fast_rule:price' }
  if (/试驾|体验|开一下/.test(message)) return { handled: true, reply: '好的！这周末和下周都有试驾名额，您方便哪天来？我帮您预留~', reason: 'fast_rule:test_drive' }
  if (/保养|维修|售后/.test(message)) return { handled: true, reply: '您的爱车该保养了吗？我帮您查一下保养周期并预约时间~', reason: 'fast_rule:maintenance' }
  if (/^(你好|您好|hi|hello|在吗|在不在)/i.test(message.trim())) return { handled: true, reply: '您好！欢迎咨询~请问有什么可以帮您的？', reason: 'fast_rule:greeting' }
  return { handled: false }
}

export interface ActionStep { op: 'wait' | 'focus' | 'type' | 'send' | 'read' | 'screenshot'; target?: string; text?: string; ms?: number }
export interface ActionPlan { steps: ActionStep[]; riskScore: number; confidence: number }

export function validatePlan(plan: ActionPlan): { valid: boolean; reason?: string } {
  if (plan.riskScore > 0.7) return { valid: false, reason: '风险分过高' }
  if (plan.confidence < 0.5) return { valid: false, reason: '置信度过低' }
  for (const step of plan.steps) {
    if (step.op === 'type' && step.text) {
      if (/支付宝|淘宝|拼多多|5折|立减/.test(step.text)) return { valid: false, reason: '安全护盾拦截' }
    }
  }
  return { valid: true }
}

export function compileActionPlan(aiReply: string, confidence: number): ActionPlan {
  const typingTime = Math.min(5000, aiReply.length * 80)
  return {
    steps: [
      { op: 'wait', ms: 1000 + Math.random() * 2000 },
      { op: 'focus', target: 'input_box' },
      { op: 'type', text: aiReply, ms: typingTime },
      { op: 'wait', ms: 300 + Math.random() * 500 },
      { op: 'send' },
    ],
    riskScore: confidence > 0.8 ? 0.2 : confidence > 0.6 ? 0.4 : 0.6,
    confidence,
  }
}

// ═══════════════════════════════════════════════════════════════
// ─── WAOS-X 4 策略枚举 + 意图识别 + 策略选择 ───────────────────
// ═══════════════════════════════════════════════════════════════
// 设计依据：原 kernel.ts 仅在 compilePersona 末尾用 if-else 字符串
// 策略，难以在 store / API / 决策面板间共享。WAOS-X 方案要求 4 个
// 明确策略枚举 + 意图识别函数，使策略可被前端决策面板直接消费。

// ─── 策略枚举 ─────────────────────────────────────────────
export type StrategyType =
  | 'CLOSE_NOW'           // 强成交策略：意向高+信任高时逼单
  | 'SOFT_RECOVERY'       // 软挽回策略：客户抗拒/情绪低时安抚
  | 'RECONNECT_HOOK'      // 唤醒钩子策略：沉睡客户唤醒
  | 'STANDARD_REPLY'      // 标准回复策略：通用兜底

export interface StrategyDecision {
  type: StrategyType
  name: string            // 中文策略名
  description: string     // 策略说明
  confidence: number      // 置信度 0-1
  triggerReason: string   // 触发原因
  templateHints: string[] // 话术模板提示
}

// ─── 意图枚举 ─────────────────────────────────────────────
export type IntentType =
  | 'PRICE'           // 价格询问
  | 'REJECTION'       // 抗拒拒绝
  | 'SILENCE_BREAK'   // 沉睡唤醒
  | 'GENERAL'         // 通用兜底

export interface IntentDetection {
  type: IntentType
  confidence: number   // 置信度 0-100
  urgency: number      // 紧迫度 0-100
  matchedKeywords: string[]
}

// 意图关键词词典（与 inferDelta 解耦，inferDelta 负责 identity 漂移，
// detectIntent 负责单条消息分类，两者职责独立）
const INTENT_KEYWORDS: Record<Exclude<IntentType, 'GENERAL'>, RegExp> = {
  PRICE: /多少钱|价格|优惠|便宜|划算|贵|首付|月供|贷款|分期/g,
  REJECTION: /太贵|不值|算了|不用了|再看看|考虑考虑|不想买/g,
  SILENCE_BREAK: /好久不见|最近怎么样|在吗|在不在|最近忙吗|许久不见/g,
}

/**
 * 意图识别 — 根据单条消息文本判断 4 类意图
 *
 * 算法：
 *  - 顺序匹配 PRICE → REJECTION → SILENCE_BREAK，命中即返回
 *  - confidence = 命中关键词数 × 30，上限 95
 *  - urgency 按意图类型设定基线 + 关键词数加权
 *  - 全部未命中 → GENERAL 兜底
 */
export function detectIntent(message: string): IntentDetection {
  const text = message || ''

  for (const t of ['PRICE', 'REJECTION', 'SILENCE_BREAK'] as const) {
    const regex = new RegExp(INTENT_KEYWORDS[t].source, 'g')
    const matches = text.match(regex) || []
    if (matches.length > 0) {
      const unique = Array.from(new Set(matches))
      const confidence = Math.min(95, unique.length * 30)
      const urgencyBase: Record<typeof t, number> = {
        PRICE: 60,
        REJECTION: 30,
        SILENCE_BREAK: 20,
      }
      const urgency = Math.min(100, urgencyBase[t] + unique.length * 10)
      return { type: t, confidence, urgency, matchedKeywords: unique }
    }
  }

  return { type: 'GENERAL', confidence: 30, urgency: 30, matchedKeywords: [] }
}

/**
 * 策略选择 — 根据身份向量 + 意图决定本轮应走哪个策略
 *
 * 决策树（优先级从高到低）：
 *  1. CLOSE_NOW      — intent=PRICE + identity.intent>70 + identity.trust>60
 *  2. SOFT_RECOVERY  — intent=REJECTION 或 identity.emotion<30 或 identity.resistance>60
 *  3. RECONNECT_HOOK — intent=SILENCE_BREAK
 *  4. STANDARD_REPLY — 其他兜底
 *
 * 每个策略返回中文 name + description + templateHints（话术方向提示）
 */
export function selectStrategy(identity: IdentityVector, intent: IntentDetection): StrategyDecision {
  // 1. CLOSE_NOW — 三条件齐备，逼单
  if (intent.type === 'PRICE' && identity.intent > 70 && identity.trust > 60) {
    return {
      type: 'CLOSE_NOW',
      name: '强成交策略',
      description: '客户意向+信任双高，主动推进试驾/下单，锁定名额',
      confidence: 0.92,
      triggerReason: `PRICE意图(conf=${intent.confidence}) + intent=${identity.intent} + trust=${identity.trust}`,
      templateHints: [
        '提及今日限时优惠 / 现车稀缺',
        '主动邀约试驾时间段',
        '强调赠品/礼包仅本周末保留',
      ],
    }
  }

  // 2. SOFT_RECOVERY — 客户抗拒/情绪低，安抚
  if (intent.type === 'REJECTION' || identity.emotion < 30 || identity.resistance > 60) {
    const reason = intent.type === 'REJECTION'
      ? `REJECTION意图(conf=${intent.confidence})`
      : identity.emotion < 30
        ? `emotion=${identity.emotion}（情绪低）`
        : `resistance=${identity.resistance}（抗拒高）`
    return {
      type: 'SOFT_RECOVERY',
      name: '软挽回策略',
      description: '客户抗拒或情绪低，先安抚再重塑价值，避免硬推',
      confidence: 0.85,
      triggerReason: reason,
      templateHints: [
        '先共情（理解您的谨慎）',
        '不急于报价，转而确认顾虑点',
        '提供真实用户反馈 / 案例对比',
      ],
    }
  }

  // 3. RECONNECT_HOOK — 沉睡唤醒
  if (intent.type === 'SILENCE_BREAK') {
    return {
      type: 'RECONNECT_HOOK',
      name: '唤醒钩子策略',
      description: '沉睡客户主动联系，用轻量钩子重新激活兴趣',
      confidence: 0.78,
      triggerReason: `SILENCE_BREAK意图(conf=${intent.confidence})`,
      templateHints: [
        '提及上次咨询车型的新动态',
        '附近期活动/优惠软钩子',
        '低压力开放式提问引导回应',
      ],
    }
  }

  // 4. STANDARD_REPLY — 通用兜底
  return {
    type: 'STANDARD_REPLY',
    name: '标准回复策略',
    description: '无明确意图信号，按人设默认语气回复，继续挖掘需求',
    confidence: 0.6,
    triggerReason: `GENERAL意图 + intent=${identity.intent} trust=${identity.trust}`,
    templateHints: [
      '确认客户关注的具体车型/配置',
      '提供一段通用价值介绍',
      '抛出开放式问题（用车场景/预算区间）',
    ],
  }
}

// ═══════════════════════════════════════════════════════════════
// ─── 事件总线信号系统（EventBus） ──────────────────────────────
// ═══════════════════════════════════════════════════════════════
// 用途：在 store / 决策面板 / 事件流 / 拦截器之间广播 6 类信号
//  - status_update  AI 状态更新（就绪/决策中/打字中/拦截）
//  - new_bubble     新气泡渲染
//  - update_leads   线索更新
//  - show_takeover  防打架横幅
//  - log_msg        系统日志
//  - safety_block   安全拦截
//
// 设计原则：
//  - 单例（getEventBus），全局共享同一实例
//  - 监听器返回 unsubscribe 函数，避免内存泄漏
//  - emit 内部 try-catch 单个 listener，单点崩溃不影响其他

export type EventType =
  | 'status_update'      // AI 状态更新（就绪/决策中/打字中/拦截）
  | 'new_bubble'         // 新气泡渲染
  | 'update_leads'       // 线索更新
  | 'show_takeover'      // 防打架横幅
  | 'log_msg'            // 系统日志
  | 'safety_block'       // 安全拦截

export type AiStatus = 'ready' | 'thinking' | 'typing' | 'blocked'

export interface WaosEvent {
  type: EventType
  payload: unknown
  timestamp: number
}

type EventListener = (event: WaosEvent) => void

export class EventBus {
  private listeners: Map<EventType, Set<EventListener>> = new Map()

  /** 订阅某类事件，返回取消订阅函数 */
  on(type: EventType, listener: EventListener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
    return () => {
      this.listeners.get(type)?.delete(listener)
    }
  }

  /** 取消某类事件全部监听（用于热重载/重置） */
  offAll(type: EventType): void {
    this.listeners.get(type)?.clear()
  }

  /** 广播事件，单 listener 异常不影响其他 */
  emit(type: EventType, payload: unknown): void {
    const event: WaosEvent = { type, payload, timestamp: Date.now() }
    const set = this.listeners.get(type)
    if (!set || set.size === 0) return
    set.forEach(l => {
      try {
        l(event)
      } catch (e) {
        // 单点 listener 崩溃不污染其他订阅者
        console.error('[EventBus] listener error:', e)
      }
    })
  }

  // ─── 便捷 emit 方法 ───────────────────────────────────────

  emitStatusUpdate(status: AiStatus): void {
    this.emit('status_update', { status })
  }

  emitNewBubble(leadId: string, role: string, content: string): void {
    this.emit('new_bubble', { leadId, role, content })
  }

  emitUpdateLeads(): void {
    this.emit('update_leads', {})
  }

  emitShowTakeover(leadId: string, reason: string): void {
    this.emit('show_takeover', { leadId, reason })
  }

  emitLogMsg(level: 'info' | 'warn' | 'error', message: string): void {
    this.emit('log_msg', { level, message })
  }

  emitSafetyBlock(reason: string, content: string): void {
    this.emit('safety_block', { reason, content })
  }
}

// 单例：模块级缓存，确保 store / API / 决策面板共享同一实例
let eventBusInstance: EventBus | null = null

export function getEventBus(): EventBus {
  if (!eventBusInstance) eventBusInstance = new EventBus()
  return eventBusInstance
}

/** 测试专用：重置单例（生产环境不应调用） */
export function _resetEventBusForTest(): void {
  eventBusInstance = null
}

