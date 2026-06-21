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
