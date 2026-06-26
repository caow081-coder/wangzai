/**
 * WAOS Realtime Stream Service (port 3003)
 *
 * Simulates the production event bus described in the audit:
 *  - Incoming lead events from wechat_dm / comment / video channels
 *  - Scheduler tick events (HOT/WARM/COLD queue transitions)
 *  - State machine transitions
 *  - LLM call results (success / fallback / safety block)
 *  - Worker heartbeat
 *
 * The Next.js frontend subscribes via:
 *   io('/?XTransformPort=3003')
 */

import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3003

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ─────────────────────────────────────────────────────────────
// Simulated data pools
// ─────────────────────────────────────────────────────────────
const CHANNELS = [
  { source: 'wechat_dm', weight: 0.25, baseIntent: 75 },
  { source: 'comment',   weight: 0.45, baseIntent: 35 },
  { source: 'video',     weight: 0.20, baseIntent: 55 },
  { source: 'douyin',    weight: 0.10, baseIntent: 40 },
]

const USER_NAMES = [
  '林晚秋', '陈墨白', '苏念安', '江月明', '顾倾城', '沈听澜',
  '萧寒', '叶之秋', '陆星辰', '夏未眠', '韩思颜', '楚云深',
  '裴知意', '宋怀瑾', '温如言', '宁予安', '卫南风', '薛清欢',
  '杨清如', '钟离明', '冯景行', '黄子衿', '罗梦溪', '邓清辞',
]

const SAMPLE_MESSAGES = [
  { text: '这个怎么卖？能便宜点吗？', intent: 90, tags: ['price_sensitive', 'high_intent'] },
  { text: '已三连求链接！', intent: 60, tags: ['product_education'] },
  { text: '请问有现货吗？', intent: 80, tags: ['high_intent'] },
  { text: '看了下还是有点贵', intent: 50, tags: ['price_sensitive'] },
  { text: '朋友推荐过来的', intent: 70, tags: ['high_intent'] },
  { text: '这个功能怎么用啊', intent: 40, tags: ['product_education'] },
  { text: '有折扣吗？现在有活动吗？', intent: 75, tags: ['discount_seeker', 'price_sensitive'] },
  { text: '之前买过你们家的，质量不错', intent: 85, tags: ['high_intent'] },
  { text: '加个微信细聊', intent: 95, tags: ['high_intent'] },
  { text: '视频号看到你们了，感兴趣', intent: 65, tags: ['product_education'] },
  { text: '已下单，期待发货', intent: 100, tags: ['converted'] },
  { text: '再考虑下，对比一下', intent: 30, tags: ['price_sensitive'] },
  { text: '请问支持七天无理由吗', intent: 55, tags: ['product_education'] },
  { text: '你们和别家比有什么优势', intent: 45, tags: ['price_sensitive'] },
  { text: '帮朋友问的，他也想买', intent: 70, tags: ['high_intent'] },
]

const PERSONA_POOL = [
  { id: 'p_consult', name: '顾问型 · 沈听澜', color: '#10b981', cvr: 0.32, capacity: 80, active: 47 },
  { id: 'p_sales',   name: '销售型 · 萧寒',     color: '#f59e0b', cvr: 0.41, capacity: 60, active: 38 },
  { id: 'p_service', name: '服务型 · 叶之秋',   color: '#06b6d4', cvr: 0.18, capacity: 120, active: 67 },
  { id: 'p_closer',  name: '逼单型 · 顾倾城',   color: '#ef4444', cvr: 0.55, capacity: 30, active: 24 },
]

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const rng = () => Math.random()
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]
const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`

function pickChannel() {
  const r = rng()
  let acc = 0
  for (const c of CHANNELS) {
    acc += c.weight
    if (r < acc) return c
  }
  return CHANNELS[0]
}

function calcPriority(
  intent: number,
  value: number,
  stage: string,
  personaFit: number,
  hoursSince: number,
  source: string,
  isSpam: boolean,
  alreadyCustomer: boolean
) {
  // 时间衰减 (半衰期 6 小时)
  const recencyDecay = Math.pow(0.5, hoursSince / 6.0)
  // 归一化
  const normIntent = 1 / (1 + Math.exp(-(intent / 20.0 - 2.5)))
  const normValue = Math.min(value / 100.0, 1.0)
  const stageScores: Record<string, number> = {
    new: 0.2, engaged: 0.4, qualified: 0.6, hot: 0.9, converted: 0.95,
  }
  const normStage = stageScores[stage] ?? 0.1
  // 负向惩罚
  let penalty = 0
  if (isSpam) penalty += 0.5
  if (alreadyCustomer) penalty += 0.3
  // 渠道权重
  const channelW: Record<string, number> = {
    wechat_dm: 1.0, comment: 0.3, video: 0.5, douyin: 0.4,
  }
  const cw = channelW[source] ?? 0.4
  const raw = (0.4 * normIntent + 0.3 * normValue + 0.2 * normStage + 0.1 * personaFit) * cw * recencyDecay - penalty
  return Math.max(0, Math.min(100, raw * 100))
}

function featureBreakdown(intent: number, value: number, stage: string, personaFit: number, hoursSince: number, source: string, isSpam: boolean, alreadyCustomer: boolean) {
  const recencyDecay = Math.pow(0.5, hoursSince / 6.0)
  const normIntent = 1 / (1 + Math.exp(-(intent / 20.0 - 2.5)))
  const normValue = Math.min(value / 100.0, 1.0)
  const stageScores: Record<string, number> = { new: 0.2, engaged: 0.4, qualified: 0.6, hot: 0.9, converted: 0.95 }
  const normStage = stageScores[stage] ?? 0.1
  const channelW: Record<string, number> = { wechat_dm: 1.0, comment: 0.3, video: 0.5, douyin: 0.4 }
  const cw = channelW[source] ?? 0.4
  let penalty = 0
  if (isSpam) penalty += 0.5
  if (alreadyCustomer) penalty += 0.3
  return {
    intent: +(0.4 * normIntent * 100).toFixed(1),
    value: +(0.3 * normValue * 100).toFixed(1),
    stage: +(0.2 * normStage * 100).toFixed(1),
    persona: +(0.1 * personaFit * 100).toFixed(1),
    recency: +(recencyDecay * 100).toFixed(1),
    channel: +(cw * 100).toFixed(1),
    penalty: -(penalty * 100).toFixed(1),
  }
}

// ─────────────────────────────────────────────────────────────
// Live state (in-memory)
// ─────────────────────────────────────────────────────────────
const activeLeads = new Map<string, any>()
const queues = { hot: [] as any[], warm: [] as any[], cold: [] as any[] }
let stats = {
  totalLeads: 0,
  hotCount: 0,
  converted: 0,
  churned: 0,
  llmCalls: 0,
  llmFallback: 0,
  safetyBlocks: 0,
  humanHandoffs: 0,
  eventsProcessed: 0,
}

// Seed some initial leads
function seedInitialLeads() {
  for (let i = 0; i < 6; i++) {
    spawnLead(false)
  }
}

function spawnLead(broadcast = true) {
  const channel = pickChannel()
  const msg = pick(SAMPLE_MESSAGES)
  const persona = pick(PERSONA_POOL)
  const isSpam = rng() < 0.05
  const alreadyCustomer = rng() < 0.1
  const intent = Math.max(0, Math.min(100, channel.baseIntent + (rng() - 0.3) * 40))
  const value = rng() * 100
  const hoursSince = rng() * 12
  const priority = calcPriority(intent, value, 'new', persona.cvr, hoursSince, channel.source, isSpam, alreadyCustomer)
  const features = featureBreakdown(intent, value, 'new', persona.cvr, hoursSince, channel.source, isSpam, alreadyCustomer)
  const id = uid('lead')
  const userName = pick(USER_NAMES)
  const stage = priority >= 80 ? 'hot' : priority >= 50 ? 'qualified' : 'new'
  
  const lead = {
    id,
    externalId: uid(channel.source),
    source: channel.source,
    userExternalId: uid('u'),
    userName,
    userAvatar: null,
    intentScore: +intent.toFixed(1),
    valueScore: +value.toFixed(1),
    priorityScore: +priority.toFixed(1),
    stage,
    personaId: persona.id,
    personaName: persona.name,
    personaColor: persona.color,
    lastMessage: msg.text,
    lastTouchAt: new Date().toISOString(),
    unread: true,
    isSpam,
    alreadyCustomer,
    tags: msg.tags,
    features,
    experimentId: 'exp_persona_v1',
    variant: rng() < 0.5 ? 'control' : 'treatment',
    createdAt: new Date().toISOString(),
    messages: [
      {
        id: uid('msg'),
        role: 'user',
        content: msg.text,
        createdAt: new Date().toISOString(),
      },
    ],
  }
  
  activeLeads.set(id, lead)
  stats.totalLeads++
  if (stage === 'hot') stats.hotCount++
  
  // Route to a queue
  const queueType = priority >= 80 ? 'hot' : priority >= 50 ? 'warm' : 'cold'
  queues[queueType].push({ leadId: id, priority, enqueuedAt: Date.now() })
  queues[queueType].sort((a, b) => b.priority - a.priority)
  
  const event = {
    type: 'lead.created',
    payload: lead,
    traceId: uid('trace'),
    level: 'info',
    ts: Date.now(),
  }
  
  if (broadcast) {
    io.emit('event', event)
    io.emit('log', {
      level: 'info',
      msg: `[STREAM] lead.created  ${lead.userName}  via ${channel.source}  priority=${priority.toFixed(1)}  → ${queueType.toUpperCase()}`,
      ts: Date.now(),
    })
    
    // Maybe trigger a state transition
    setTimeout(() => maybeTransition(lead), 2000 + rng() * 3000)
  }
  
  return lead
}

function maybeTransition(lead: any) {
  const transitions = [
    { from: 'new', to: 'engaged', action: 'engage', prob: 0.8 },
    { from: 'engaged', to: 'qualified', action: 'qualify', prob: 0.5 },
    { from: 'qualified', to: 'hot', action: 'heat', prob: 0.4 },
    { from: 'hot', to: 'converted', action: 'convert', prob: 0.3 },
    { from: 'qualified', to: 'churned', action: 'churn', prob: 0.15 },
  ]
  const t = transitions.find(t => t.from === lead.stage)
  if (t && rng() < t.prob) {
    lead.stage = t.to
    activeLeads.set(lead.id, lead)
    
    if (t.to === 'converted') { stats.converted++; stats.hotCount-- }
    if (t.to === 'churned') stats.churned++
    if (t.to === 'hot') stats.hotCount++
    
    io.emit('event', {
      type: 'state.transition',
      payload: { leadId: lead.id, from: t.from, to: t.to, action: t.action, lead },
      traceId: uid('trace'),
      level: 'info',
      ts: Date.now(),
    })
    io.emit('log', {
      level: t.to === 'converted' ? 'info' : t.to === 'churned' ? 'warn' : 'info',
      msg: `[STATE] ${lead.userName}  ${t.from} → ${t.to}  (${t.action})`,
      ts: Date.now(),
    })
    
    // Schedule an LLM reply for engaged/hot transitions
    if (['engaged', 'hot', 'qualified'].includes(t.to)) {
      setTimeout(() => simulateLlmReply(lead), 1500 + rng() * 2500)
    }
    
    // Continue the chain
    setTimeout(() => maybeTransition(lead), 3000 + rng() * 4000)
  }
}

function simulateLlmReply(lead: any) {
  stats.llmCalls++
  const fallback = rng() < 0.08 // 8% fallback rate
  const safetyBlock = rng() < 0.05 // 5% safety block rate
  
  if (safetyBlock) {
    stats.safetyBlocks++
    io.emit('event', {
      type: 'safety.block',
      payload: { leadId: lead.id, reason: 'AI 输出包含违规词: 价格承诺', original: '我帮你申请一下 5 折优惠' },
      traceId: uid('trace'),
      level: 'warn',
      ts: Date.now(),
    })
    io.emit('log', {
      level: 'warn',
      msg: `[SHIELD] lead=${lead.userName}  AI 输出被安全护盾拦截  reason=价格承诺`,
      ts: Date.now(),
    })
    return
  }
  
  if (fallback) {
    stats.llmFallback++
    stats.humanHandoffs++
    lead.stage = 'blocked'
    activeLeads.set(lead.id, lead)
    io.emit('event', {
      type: 'human.handoff',
      payload: { leadId: lead.id, reason: 'LLM_FALLBACK', lead },
      traceId: uid('trace'),
      level: 'critical',
      ts: Date.now(),
    })
    io.emit('log', {
      level: 'error',
      msg: `[FALLBACK] lead=${lead.userName}  LLM 熔断 → 转人工  reason=LLM_FALLBACK`,
      ts: Date.now(),
    })
    return
  }
  
  const replies: Record<string, string> = {
    engaged: `您好 ${lead.userName}，我是您的专属顾问。看到您对我们的产品感兴趣，方便简单介绍下您的需求吗？`,
    qualified: `根据您的关注点，我觉得 ${pick(['基础版', '专业版', '旗舰版'])} 比较适合您，要我详细说说吗？`,
    hot: `您这边方便加一下微信吗？我帮您申请一个专属优惠，名额有限哦～`,
  }
  const reply = replies[lead.stage] || '感谢您的咨询，我会尽快为您解答。'
  const latency = 400 + Math.floor(rng() * 1200)
  const tokens = 80 + Math.floor(rng() * 200)
  
  const msg = {
    id: uid('msg'),
    role: 'assistant',
    content: reply,
    tokensUsed: tokens,
    latency,
    createdAt: new Date().toISOString(),
  }
  lead.messages.push(msg)
  lead.unread = true
  lead.lastMessage = reply
  activeLeads.set(lead.id, lead)
  
  io.emit('event', {
    type: 'llm.call',
    payload: { leadId: lead.id, msg, lead },
    traceId: uid('trace'),
    level: 'info',
    ts: Date.now(),
  })
  io.emit('log', {
    level: 'info',
    msg: `[LLM] lead=${lead.userName}  persona=${lead.personaName}  tokens=${tokens}  latency=${latency}ms`,
    ts: Date.now(),
  })
}

// ─────────────────────────────────────────────────────────────
// Scheduler tick — every 5 seconds
// ─────────────────────────────────────────────────────────────
function schedulerTick() {
  // Aging: cold queue +2 every tick
  if (queues.cold.length > 0) {
    queues.cold.forEach(t => { t.priority = Math.min(50, t.priority + 2) })
    io.emit('log', {
      level: 'info',
      msg: `[SCHED] aging applied to ${queues.cold.length} cold tasks (+2 each)`,
      ts: Date.now(),
    })
  }
  
  // Dequeue one from each queue (HOT > WARM > COLD)
  const capacity = 3
  let dispatched = 0
  for (const qName of ['hot', 'warm', 'cold']) {
    while (dispatched < capacity && queues[qName].length > 0) {
      const task = queues[qName].shift()
      dispatched++
      stats.eventsProcessed++
      io.emit('event', {
        type: 'dispatch.execute',
        payload: { leadId: task.leadId, queueType: qName, priority: task.priority },
        traceId: uid('trace'),
        level: 'info',
        ts: Date.now(),
      })
      io.emit('log', {
        level: qName === 'hot' ? 'warn' : 'info',
        msg: `[DISPATCH] ${qName.toUpperCase()} → ${task.leadId.slice(0, 12)}  priority=${task.priority.toFixed(1)}`,
        ts: Date.now(),
      })
    }
    if (dispatched >= capacity) break
  }
  
  // Broadcast queue snapshot
  io.emit('queues', {
    hot: queues.hot.length,
    warm: queues.warm.length,
    cold: queues.cold.length,
    hotItems: queues.hot.slice(0, 8),
    warmItems: queues.warm.slice(0, 8),
    coldItems: queues.cold.slice(0, 8),
  })
  
  // Broadcast metrics
  io.emit('metrics', {
    ...stats,
    queueDepth: queues.hot.length + queues.warm.length + queues.cold.length,
    hotQueue: queues.hot.length,
    warmQueue: queues.warm.length,
    coldQueue: queues.cold.length,
    activeLeads: activeLeads.size,
    fallbackRate: stats.llmCalls > 0 ? (stats.llmFallback / stats.llmCalls) * 100 : 0,
    safetyRate: stats.llmCalls > 0 ? (stats.safetyBlocks / stats.llmCalls) * 100 : 0,
    cvr: stats.totalLeads > 0 ? (stats.converted / stats.totalLeads) * 100 : 0,
    ts: Date.now(),
  })
}

// ─────────────────────────────────────────────────────────────
// Worker heartbeat — every 8 seconds
// ─────────────────────────────────────────────────────────────
function workerHeartbeat() {
  const workers = ['worker-1', 'worker-2', 'worker-3']
  workers.forEach(w => {
    io.emit('log', {
      level: 'info',
      msg: `[HEARTBEAT] ${w}  status=alive  processed=${Math.floor(rng() * 50) + 10}  p99=${300 + Math.floor(rng() * 800)}ms`,
      ts: Date.now(),
    })
  })
}

// ─────────────────────────────────────────────────────────────
// Connection handling
// ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WAOS-STREAM] client connected: ${socket.id}`)
  
  // Send initial snapshot
  socket.emit('snapshot', {
    leads: Array.from(activeLeads.values()).slice(0, 50),
    queues: {
      hot: queues.hot.length,
      warm: queues.warm.length,
      cold: queues.cold.length,
      hotItems: queues.hot.slice(0, 8),
      warmItems: queues.warm.slice(0, 8),
      coldItems: queues.cold.slice(0, 8),
    },
    metrics: {
      ...stats,
      queueDepth: queues.hot.length + queues.warm.length + queues.cold.length,
      hotQueue: queues.hot.length,
      warmQueue: queues.warm.length,
      coldQueue: queues.cold.length,
      activeLeads: activeLeads.size,
      fallbackRate: stats.llmCalls > 0 ? (stats.llmFallback / stats.llmCalls) * 100 : 0,
      safetyRate: stats.llmCalls > 0 ? (stats.safetyBlocks / stats.llmCalls) * 100 : 0,
      cvr: stats.totalLeads > 0 ? (stats.converted / stats.totalLeads) * 100 : 0,
    },
    personas: PERSONA_POOL,
  })
  
  socket.emit('log', {
    level: 'info',
    msg: `[SYSTEM] client ${socket.id.slice(0, 8)} connected to WAOS Realtime Stream`,
    ts: Date.now(),
  })
  
  socket.on('client_action', (data) => {
    console.log('[WAOS-STREAM] client_action:', data)
    io.emit('log', {
      level: 'info',
      msg: `[ACTION] ${data.actor || 'operator'}  ${data.action}  target=${data.leadId?.slice(0, 12) || '-'}`,
      ts: Date.now(),
    })
  })
  
  socket.on('spawn_lead', () => {
    spawnLead(true)
  })
  
  socket.on('disconnect', () => {
    console.log(`[WAOS-STREAM] client disconnected: ${socket.id}`)
  })
})

// ─────────────────────────────────────────────────────────────
// Background simulators
// ─────────────────────────────────────────────────────────────
seedInitialLeads()

// New lead arrives every 6-12 seconds
setInterval(() => {
  if (activeLeads.size < 80) spawnLead(true)
}, 7000)

// Scheduler ticks every 5 seconds
setInterval(schedulerTick, 5000)

// Worker heartbeat every 12 seconds
setInterval(workerHeartbeat, 12000)

// Initial tick after 1 second
setTimeout(schedulerTick, 1000)
setTimeout(workerHeartbeat, 2000)

httpServer.listen(PORT, () => {
  console.log(`[WAOS-STREAM] Realtime service running on port ${PORT}`)
  console.log(`[WAOS-STREAM] Initial leads: ${activeLeads.size}`)
  console.log(`[WAOS-STREAM] Queues: hot=${queues.hot.length} warm=${queues.warm.length} cold=${queues.cold.length}`)
})

process.on('SIGTERM', () => {
  console.log('[WAOS-STREAM] SIGTERM received, shutting down...')
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('[WAOS-STREAM] SIGINT received, shutting down...')
  httpServer.close(() => process.exit(0))
})
