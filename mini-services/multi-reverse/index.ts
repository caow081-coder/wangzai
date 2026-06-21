/**
 * WAOS 内置多模型逆向聚合服务 (port 7446)
 *
 * 核心能力: 多模型轮询降级 — 豆包限流自动切千问/元宝/Kimi/智谱
 */
import { createServer, IncomingMessage, ServerResponse } from 'http'

const PORT = 7446

const cookiesConfig = process.env.MULTI_COOKIES || ''
const cookies: Record<string, string> = {}
for (const part of cookiesConfig.split(';')) {
  const idx = part.indexOf('=')
  if (idx > 0) {
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (name && value) cookies[name] = value
  }
}
if (process.env.DOUBAO_COOKIE && !cookies.doubao) cookies.doubao = process.env.DOUBAO_COOKIE
if (process.env.QIANWEN_COOKIE && !cookies.qianwen) cookies.qianwen = process.env.QIANWEN_COOKIE
if (process.env.YUANBAO_COOKIE && !cookies.yuanbao) cookies.yuanbao = process.env.YUANBAO_COOKIE
if (process.env.KIMI_COOKIE && !cookies.kimi) cookies.kimi = process.env.KIMI_COOKIE
if (process.env.ZHIPU_COOKIE && !cookies.zhipu) cookies.zhipu = process.env.ZHIPU_COOKIE

const MODEL_PRIORITY = ['doubao', 'qianwen', 'yuanbao', 'kimi', 'zhipu'] as const

const modelStats: Record<string, any> = {}
for (const m of [...MODEL_PRIORITY, 'zai']) {
  modelStats[m] = { total: 0, success: 0, fail: 0, rateLimited: 0, rateLimitedUntil: 0, lastError: '' }
}

const stats = { startedAt: Date.now(), total: 0, success: 0, fail: 0, fallbackCount: 0, perModel: modelStats }

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
  })
}

function sendJSON(res: ServerResponse, status: number, body: any) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(body))
}

function isModelAvailable(model: string): boolean {
  const s = modelStats[model]
  if (!s) return false
  if (s.rateLimitedUntil > Date.now()) return false
  if (model !== 'zai' && !cookies[model]) return false
  return true
}

function getNextAvailableModel(preferred?: string): string {
  if (preferred && isModelAvailable(preferred)) return preferred
  for (const m of MODEL_PRIORITY) {
    if (isModelAvailable(m)) return m
  }
  return 'zai'
}

function markRateLimited(model: string, durationMs = 300000) {
  const s = modelStats[model]
  s.rateLimited++
  s.rateLimitedUntil = Date.now() + durationMs
  s.lastError = 'rate limited'
  console.log(`[${model}] 被限流，暂停 ${durationMs / 1000}s`)
}

function markSuccess(model: string) {
  modelStats[model].success++
  modelStats[model].rateLimitedUntil = 0
}

function markFail(model: string, error: string) {
  modelStats[model].fail++
  modelStats[model].lastError = error
  // 连接失败也短暂暂停 60s，避免重复尝试不可达的模型
  if (error.includes('Unable to connect') || error.includes('connect') || error.includes('ECONNREFUSED') || error.includes('ETIMEDOUT')) {
    modelStats[model].rateLimitedUntil = Date.now() + 60000
    console.log(`[${model}] 连接失败，暂停 60s`)
  }
}

interface ChatMessage { role: string; content: string }

// ─── 豆包 ─────────────────────────────────────────────
async function callDoubao(messages: ChatMessage[], cookie: string, timeout = 30000): Promise<string> {
  const body = JSON.stringify({
    messages: messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' && m.content.startsWith('{')
        ? m.content : JSON.stringify({ text: m.content })
    })),
    model: 'doubao-pro', stream: true,
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch('https://www.doubao.com/samantha/chat/completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/event-stream',
        'Referer': 'https://www.doubao.com/chat/', 'Origin': 'https://www.doubao.com',
      },
      body, signal: controller.signal,
    })
    if (!res.ok) throw new Error(`doubao HTTP ${res.status}`)
    const raw = await res.text()
    let text = '', rateLimited = false
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data:')) continue
      const jsonStr = line.slice(5).trim()
      if (!jsonStr || jsonStr === '[DONE]') continue
      try {
        const obj = JSON.parse(jsonStr)
        if (obj.event_type === 2005) {
          const errData = JSON.parse(obj.event_data)
          if (errData.code === 710022002) { rateLimited = true; break }
          throw new Error(`doubao: ${errData.message}`)
        } else if (obj.event_type === 2001 || obj.event_type === 2002) {
          const msgData = JSON.parse(obj.event_data)
          text += msgData.message || msgData.content || msgData.text || ''
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('doubao')) throw e
      }
    }
    if (rateLimited) throw new Error('RATE_LIMITED')
    return text || '[空回复]'
  } finally { clearTimeout(timer) }
}

// ─── 通义千问 ─────────────────────────────────────────────
async function callQianwen(messages: ChatMessage[], cookie: string, timeout = 30000): Promise<string> {
  const body = JSON.stringify({
    header: { app_id: 'qwen' },
    payload: {
      input: { messages: messages.map(m => ({ role: m.role, content: m.content })) },
      parameters: { temperature: 0.7 },
    },
    stream: true,
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch('https://qwen.aliyun.com/api/completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://qwen.aliyun.com/', 'Origin': 'https://qwen.aliyun.com',
      },
      body, signal: controller.signal,
    })
    if (res.status === 429) throw new Error('RATE_LIMITED')
    if (!res.ok) throw new Error(`qianwen HTTP ${res.status}`)
    const raw = await res.text()
    let text = ''
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data:')) continue
      const jsonStr = line.slice(5).trim()
      if (!jsonStr || jsonStr === '[DONE]') continue
      try {
        const obj = JSON.parse(jsonStr)
        text += obj.content || obj.text || obj.message || obj.choices?.[0]?.delta?.content || ''
      } catch {}
    }
    return text || '[空回复]'
  } finally { clearTimeout(timer) }
}

// ─── 腾讯元宝 ─────────────────────────────────────────────
async function callYuanbao(messages: ChatMessage[], cookie: string, timeout = 30000): Promise<string> {
  const body = JSON.stringify({
    model: 'hunyuan-pro',
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    stream: true,
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch('https://yuanbao.tencent.com/api/chat/online', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://yuanbao.tencent.com/chat', 'Origin': 'https://yuanbao.tencent.com',
      },
      body, signal: controller.signal,
    })
    if (res.status === 429) throw new Error('RATE_LIMITED')
    if (!res.ok) throw new Error(`yuanbao HTTP ${res.status}`)
    const raw = await res.text()
    let text = ''
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data:')) continue
      const jsonStr = line.slice(5).trim()
      if (!jsonStr || jsonStr === '[DONE]') continue
      try {
        const obj = JSON.parse(jsonStr)
        text += obj.content || obj.message || obj.choices?.[0]?.delta?.content || ''
      } catch {}
    }
    return text || '[空回复]'
  } finally { clearTimeout(timer) }
}

// ─── Kimi ─────────────────────────────────────────────
// Kimi 需要 Authorization: Bearer 而非 Cookie
// 流程: 1. POST /api/chat 创建会话 → 2. POST /api/chat/{id}/completion 发消息
async function callKimi(messages: ChatMessage[], cookie: string, timeout = 30000): Promise<string> {
  // 从 cookie 中提取 kimi-auth token
  const authMatch = cookie.match(/kimi-auth=([^;]+)/)
  const authToken = authMatch?.[1] || cookie  // 如果没匹配到，整个 cookie 当 token 用

  // 第一步: 创建会话
  const convRes = await fetch('https://kimi.moonshot.cn/api/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://kimi.moonshot.cn/chat',
    },
    body: JSON.stringify({ name: 'WAOS', is_example: false }),
    signal: AbortSignal.timeout(timeout),
  })

  if (convRes.status === 401) throw new Error('RATE_LIMITED')  // token 过期
  if (!convRes.ok) throw new Error(`kimi create chat HTTP ${convRes.status}`)

  const convData = await convRes.json()
  const convId = convData.id
  if (!convId) throw new Error('kimi: no conversation id')

  // 第二步: 发送消息（SSE 流）
  const msgRes = await fetch(`https://kimi.moonshot.cn/api/chat/${convId}/completion`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': `https://kimi.moonshot.cn/chat/${convId}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      prompt: messages[messages.length - 1]?.content || '',
      tts: false,
      stream: true,
      use_search: false,
    }),
    signal: AbortSignal.timeout(timeout),
  })

  if (!msgRes.ok) throw new Error(`kimi completion HTTP ${msgRes.status}`)

  const raw = await msgRes.text()
  let text = ''
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue
    const jsonStr = line.slice(5).trim()
    if (!jsonStr || jsonStr === '[DONE]') continue
    try {
      const obj = JSON.parse(jsonStr)
      text += obj.content || obj.text || obj.choices?.[0]?.delta?.content || ''
    } catch {}
  }
  return text || '[空回复]'
}

// ─── 智谱清言 ─────────────────────────────────────────────
async function callZhipu(messages: ChatMessage[], cookie: string, timeout = 30000): Promise<string> {
  const body = JSON.stringify({
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    model: 'GLM-5', stream: true,
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch('https://chatglm.cn/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://chatglm.cn/', 'Origin': 'https://chatglm.cn',
      },
      body, signal: controller.signal,
    })
    if (res.status === 429) throw new Error('RATE_LIMITED')
    if (!res.ok) throw new Error(`zhipu HTTP ${res.status}`)
    const raw = await res.text()
    let text = ''
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data:')) continue
      const jsonStr = line.slice(5).trim()
      if (!jsonStr || jsonStr === '[DONE]') continue
      try {
        const obj = JSON.parse(jsonStr)
        text += obj.content || obj.text || obj.message || obj.choices?.[0]?.delta?.content || ''
      } catch {}
    }
    return text || '[空回复]'
  } finally { clearTimeout(timer) }
}

const modelCallers: Record<string, (msgs: ChatMessage[], cookie: string) => Promise<string>> = {
  doubao: callDoubao, qianwen: callQianwen, yuanbao: callYuanbao, kimi: callKimi, zhipu: callZhipu,
}

async function callWithFallback(messages: ChatMessage[], preferredModel?: string): Promise<{ text: string; model: string; fallbacks: string[] }> {
  const tried: string[] = []
  let currentModel = preferredModel && isModelAvailable(preferredModel) ? preferredModel : getNextAvailableModel()

  while (true) {
    tried.push(currentModel)
    modelStats[currentModel].total++

    try {
      if (currentModel === 'zai') {
        // Z.AI 兜底 — 调用主程序的 /api/waos/llm
        const zaiRes = await fetch('http://localhost:3000/api/waos/llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'zai',
            messages: messages.map(m => ({ role: m.role, content: m.content })),
          }),
          signal: AbortSignal.timeout(30000),
        })
        if (!zaiRes.ok) throw new Error(`zai HTTP ${zaiRes.status}`)
        const zaiData = await zaiRes.json()
        const text = zaiData.reply || ''
        if (!text) throw new Error('zai empty reply')
        markSuccess(currentModel)
        return { text, model: 'zai', fallbacks: tried }
      }
      const cookie = cookies[currentModel]
      if (!cookie) throw new Error('NO_COOKIE')
      const caller = modelCallers[currentModel]
      if (!caller) throw new Error('UNKNOWN_MODEL')

      const text = await caller(messages, cookie)
      markSuccess(currentModel)
      return { text, model: currentModel, fallbacks: tried }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown'
      if (errMsg === 'RATE_LIMITED') markRateLimited(currentModel, 300000)
      else markFail(currentModel, errMsg)

      console.log(`[${currentModel}] 失败: ${errMsg.slice(0, 60)}, 尝试下一个...`)

      const next = getNextAvailableModel()
      if (next === currentModel || tried.includes(next)) {
        throw new Error(`ALL_MODELS_FAILED: tried ${tried.join(', ')}`)
      }
      if (tried.length >= 6) throw new Error(`TOO_MANY_FALLBACKS`)

      currentModel = next
      stats.fallbackCount++
      await new Promise(r => setTimeout(r, 500))
    }
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    return res.end()
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const path = url.pathname

  if (path === '/health' && req.method === 'GET') {
    const modelStatus: any = {}
    for (const m of [...MODEL_PRIORITY, 'zai']) {
      modelStatus[m] = {
        available: isModelAvailable(m), hasCookie: !!cookies[m],
        rateLimitedUntil: modelStats[m].rateLimitedUntil > 0 ? new Date(modelStats[m].rateLimitedUntil).toISOString() : null,
        ...modelStats[m],
      }
    }
    return sendJSON(res, 200, {
      status: 'ok', service: 'WAOS Multi-Model Reverse Aggregator', port: PORT,
      uptime: Math.floor((Date.now() - stats.startedAt) / 1000),
      cookies: Object.keys(cookies).length, models: modelStatus, stats,
    })
  }

  if (path === '/v1/models' && req.method === 'GET') {
    return sendJSON(res, 200, {
      object: 'list',
      data: [
        { id: 'auto', object: 'model', desc: '自动选择可用模型' },
        ...MODEL_PRIORITY.map(m => ({ id: m, object: 'model', available: isModelAvailable(m), hasCookie: !!cookies[m] })),
      ],
    })
  }

  if (path === '/v1/chat/completions' && req.method === 'POST') {
    stats.total++
    const bodyStr = await readBody(req)
    let chatReq: any
    try { chatReq = JSON.parse(bodyStr) } catch { return sendJSON(res, 400, { error: 'Invalid JSON' }) }
    if (!chatReq.messages?.length) return sendJSON(res, 400, { error: 'messages required' })

    const preferred = chatReq.model && chatReq.model !== 'auto' ? chatReq.model : undefined

    try {
      const result = await callWithFallback(chatReq.messages, preferred)
      stats.success++
      return sendJSON(res, 200, {
        id: `chatcmpl-${Date.now()}`, object: 'chat.completion',
        created: Math.floor(Date.now() / 1000), model: result.model,
        choices: [{ index: 0, message: { role: 'assistant', content: result.text }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: Math.ceil(JSON.stringify(chatReq.messages).length / 4),
          completion_tokens: Math.ceil(result.text.length / 4),
          total_tokens: Math.ceil((JSON.stringify(chatReq.messages).length + result.text.length) / 4),
        },
        meta: { used_model: result.model, fallback_chain: result.fallbacks, fallback_count: result.fallbacks.length - 1 },
      })
    } catch (err) {
      stats.fail++
      return sendJSON(res, 502, {
        error: `All models failed: ${err instanceof Error ? err.message : 'unknown'}`,
        tried_models: [...MODEL_PRIORITY, 'zai'], stats,
      })
    }
  }

  sendJSON(res, 404, { error: `Not found: ${path}` })
})

server.listen(PORT, () => {
  console.log(`[MULTI-REVERSE] 多模型逆向聚合服务 running on port ${PORT}`)
  console.log(`[MULTI-REVERSE] 已加载 Cookie: ${Object.keys(cookies).join(', ') || '(无)'}`)
  console.log(`[MULTI-REVERSE] 模型优先级: ${[...MODEL_PRIORITY, 'zai'].join(' → ')}`)
  console.log(`[MULTI-REVERSE] 健康检查: http://localhost:${PORT}/health`)
  if (Object.keys(cookies).length === 0) {
    console.warn(`[MULTI-REVERSE] ⚠️ 无 Cookie！设置 MULTI_COOKIES 环境变量`)
    console.warn(`[MULTI-REVERSE]    格式: doubao=cookie1;qianwen=cookie2;kimi=cookie3`)
  }
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))
