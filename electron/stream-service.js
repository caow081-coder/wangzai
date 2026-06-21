/**
 * WAOS 内联 Stream Service（生产模式用）
 *
 * 从 mini-services/waos-stream/index.ts 提炼核心逻辑
 * 用 socket.io 提供实时事件流（线索/队列/状态机/LLM调用/Worker心跳）
 *
 * 前端订阅：io('/?XTransformPort=3003')
 */

const { createServer } = require('http')
const { Server } = require('socket.io')

// ─── 模拟数据池 ─────────────────────────────────────────────
const CHANNELS = [
  { source: 'wechat_dm', weight: 0.25, baseIntent: 75 },
  { source: 'comment',   weight: 0.45, baseIntent: 35 },
  { source: 'video',     weight: 0.20, baseIntent: 55 },
  { source: 'douyin',    weight: 0.10, baseIntent: 40 },
]

const USER_NAMES = [
  '林晚秋', '陈墨白', '苏念安', '江月明', '顾倾城', '沈听澜',
  '萧寒', '叶之秋', '陆星辰', '夏未眠', '韩思颜', '楚云深',
]

const SAMPLE_MESSAGES = [
  { text: '这个怎么卖？能便宜点吗？', intent: 90, tags: ['price_sensitive', 'high_intent'] },
  { text: '已三连求链接！', intent: 60, tags: ['product_education'] },
  { text: '请问有现货吗？', intent: 80, tags: ['high_intent'] },
  { text: '看了下还是有点贵', intent: 50, tags: ['price_sensitive'] },
  { text: '朋友推荐过来的', intent: 70, tags: ['high_intent'] },
  { text: 'GLC首付多少', intent: 85, tags: ['high_intent', 'finance'] },
  { text: '试驾怎么约', intent: 75, tags: ['high_intent'] },
  { text: 'E级和5系怎么选', intent: 65, tags: ['comparison'] },
]

const INITIAL_LEADS = [
  { id: 'L001', name: '林晚秋', intent: 88, value: 72, stage: 'hot', source: 'wechat_dm' },
  { id: 'L002', name: '陈墨白', intent: 65, value: 50, stage: 'warm', source: 'comment' },
  { id: 'L003', name: '苏念安', intent: 78, value: 60, stage: 'hot', source: 'video' },
  { id: 'L004', name: '江月明', intent: 45, value: 40, stage: 'cold', source: 'wechat_dm' },
  { id: 'L005', name: '顾倾城', intent: 55, value: 65, stage: 'warm', source: 'douyin' },
  { id: 'L006', name: '沈听澜', intent: 92, value: 85, stage: 'hot', source: 'wechat_dm' },
]

function startStreamServer(PORT = 3003) {
  const httpServer = createServer()
  const io = new Server(httpServer, {
    path: '/',
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  console.log(`[WAOS-Stream] 初始线索: ${INITIAL_LEADS.length}`)

  let emitCount = 0
  let leadCount = INITIAL_LEADS.length
  const hotCount = INITIAL_LEADS.filter(l => l.stage === 'hot').length
  const warmCount = INITIAL_LEADS.filter(l => l.stage === 'warm').length
  const coldCount = INITIAL_LEADS.filter(l => l.stage === 'cold').length

  io.on('connection', (socket) => {
    console.log(`[WAOS-Stream] 客户端连接 (${io.engine.clientsCount} 在线)`)
    socket.emit('initial', { leads: INITIAL_LEADS, hotCount, warmCount, coldCount })
  })

  // 每 8-15 秒推送一条新事件
  function scheduleNext() {
    const delay = 8000 + Math.random() * 7000
    setTimeout(() => {
      emitCount++
      const channel = CHANNELS[Math.floor(Math.random() * CHANNELS.length)]
      const userName = USER_NAMES[Math.floor(Math.random() * USER_NAMES.length)]
      const msg = SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)]
      const intent = Math.min(100, channel.baseIntent + msg.intent * 0.3 + (Math.random() * 20 - 10))

      const event = {
        id: `evt_${Date.now()}_${emitCount}`,
        type: 'new_lead',
        lead: {
          id: `L${100 + emitCount}`,
          name: userName,
          intent: Math.round(intent),
          value: Math.round(40 + Math.random() * 40),
          stage: intent > 70 ? 'hot' : intent > 50 ? 'warm' : 'cold',
          source: channel.source,
        },
        message: msg.text,
        tags: msg.tags,
        timestamp: Date.now(),
      }

      io.emit('event', event)
      leadCount++
      console.log(`[WAOS-Stream] #${emitCount} 推送: ${event.lead.name} (${event.lead.stage})`)

      // Worker 心跳
      if (emitCount % 5 === 0) {
        io.emit('heartbeat', {
          timestamp: Date.now(),
          uptime: emitCount,
          queueDepth: Math.floor(Math.random() * 6),
          hotCount: Math.floor(2 + Math.random() * 4),
          warmCount: Math.floor(3 + Math.random() * 5),
          coldCount: Math.floor(1 + Math.random() * 3),
        })
      }

      scheduleNext()
    }, delay)
  }

  scheduleNext()

  httpServer.listen(PORT, () => {
    console.log(`[WAOS-Stream] Realtime service running on port ${PORT}`)
  })

  return { io, httpServer }
}

module.exports = { startStreamServer }
