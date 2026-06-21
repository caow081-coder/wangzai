/**
 * WAOS AI 大脑 — 统一多模型逆向聚合 API
 *
 * POST /api/waos/brain
 *   { messages, model?, cookies? }
 *
 * 这是 WAOS 的"灵活大脑"：
 *  - 多模型轮询降级：豆包 → 千问 → Kimi → 智谱 → Z.AI
 *  - 用户在软件内登录各平台后，Cookie 自动存储
 *  - 自动限流追踪 + 冷却恢复
 *  - 统一 OpenAI 兼容接口
 */

import { NextRequest, NextResponse } from 'next/server'
import { getZAI } from '@/lib/zai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL_PRIORITY = ['zhipu_api', 'doubao_docker', 'doubao', 'qianwen', 'kimi', 'zhipu'] as const

// 智谱官方 API Key（内置，无需用户配置）
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || 'a925a9d8f27f4cf39d0db6d087e37c43.qqIwgdjiG0ZZXG7R'

// doubao2api Docker 服务地址（用户启动 Docker 后可用）
const DOUBAO_DOCKER_URL = process.env.DOUBAO_DOCKER_URL || 'http://localhost:9090'

// 请求缓存（相同消息5分钟内不重复调用）
const replyCache = new Map<string, { reply: string; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

// 请求限流（智谱API每秒最多3次）
let lastZhipuCall = 0
const ZHIPU_MIN_INTERVAL = 350  // ms

const modelStats: Record<string, {
  total: number; success: number; fail: number; rateLimited: number;
  rateLimitedUntil: number; lastError: string;
}> = {}

for (const m of [...MODEL_PRIORITY, 'zai']) {
  modelStats[m] = { total: 0, success: 0, fail: 0, rateLimited: 0, rateLimitedUntil: 0, lastError: '' }
}

function isModelAvailable(model: string, hasCookie: boolean): boolean {
  const s = modelStats[model]
  if (!s) return false
  if (s.rateLimitedUntil > Date.now()) return false
  // zhipu_api / doubao_docker / zai 不需要 Cookie
  if (model !== 'zai' && model !== 'zhipu_api' && model !== 'doubao_docker' && !hasCookie) return false
  return true
}

function markRateLimited(model: string, durationMs = 300000) {
  const s = modelStats[model]
  s.rateLimited++
  s.rateLimitedUntil = Date.now() + durationMs
  s.lastError = 'rate limited'
}

function markSuccess(model: string) {
  modelStats[model].success++
  modelStats[model].rateLimitedUntil = 0
}

function markFail(model: string, error: string) {
  modelStats[model].fail++
  modelStats[model].lastError = error
  if (error.includes('Unable to connect') || error.includes('ECONNREFUSED') || error.includes('ETIMEDOUT')) {
    modelStats[model].rateLimitedUntil = Date.now() + 60000
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
  const res = await fetch('https://www.doubao.com/samantha/chat/completion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/event-stream',
      'Referer': 'https://www.doubao.com/chat/', 'Origin': 'https://www.doubao.com',
    },
    body, signal: AbortSignal.timeout(timeout),
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
}

// ─── 千问 ─────────────────────────────────────────────
async function callQianwen(messages: ChatMessage[], cookie: string, timeout = 30000): Promise<string> {
  const body = JSON.stringify({
    header: { app_id: 'qwen' },
    payload: {
      input: { messages: messages.map(m => ({ role: m.role, content: m.content })) },
      parameters: { temperature: 0.7 },
    },
    stream: true,
  })
  const res = await fetch('https://qwen.aliyun.com/api/completion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://qwen.aliyun.com/', 'Origin': 'https://qwen.aliyun.com',
    },
    body, signal: AbortSignal.timeout(timeout),
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
      text += obj.content || obj.text || obj.message || ''
    } catch {}
  }
  return text || '[空回复]'
}

// ─── Kimi ─────────────────────────────────────────────
async function callKimi(messages: ChatMessage[], cookie: string, timeout = 30000): Promise<string> {
  const authMatch = cookie.match(/kimi-auth=([^;]+)/)
  const authToken = authMatch?.[1] || cookie

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
  if (convRes.status === 401) throw new Error('RATE_LIMITED')
  if (!convRes.ok) throw new Error(`kimi create chat HTTP ${convRes.status}`)
  const convData = await convRes.json()
  const convId = convData.id
  if (!convId) throw new Error('kimi: no conversation id')

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
      tts: false, stream: true, use_search: false,
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
      text += obj.content || obj.text || ''
    } catch {}
  }
  return text || '[空回复]'
}

// ─── 智谱 ─────────────────────────────────────────────
async function callZhipu(messages: ChatMessage[], cookie: string, timeout = 30000): Promise<string> {
  const tokenMatch = cookie.match(/chatglm_token=([^;]+)/)
  const token = tokenMatch?.[1] || ''
  const body = JSON.stringify({
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    model: 'GLM-5', stream: true,
  })
  const res = await fetch('https://chatglm.cn/api/chat/completion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://chatglm.cn/', 'Origin': 'https://chatglm.cn',
    },
    body, signal: AbortSignal.timeout(timeout),
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
      text += obj.content || obj.text || obj.message || ''
    } catch {}
  }
  return text || '[空回复]'
}

// ─── 豆包 Docker (doubao2api) ─────────────────────────────
// 通过 doubao2api Docker 服务调用豆包，OpenAI 兼容接口
async function callDoubaoDocker(messages: ChatMessage[], _cookie: string, timeout = 30000): Promise<string> {
  // 先检查 Docker 服务是否运行
  try {
    const healthRes = await fetch(`${DOUBAO_DOCKER_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!healthRes.ok) throw new Error(`doubao_docker health ${healthRes.status}`)
  } catch {
    throw new Error('doubao_docker 服务未启动')
  }

  // OpenAI 兼容接口调用
  const res = await fetch(`${DOUBAO_DOCKER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // doubao2api 用 Cookie 或 session 作为认证
      'Authorization': `Bearer ${_cookie || 'default'}`,
    },
    body: JSON.stringify({
      model: 'doubao-pro',
      messages: messages.map(m => ({
        role: m.role === 'lead' ? 'user' : m.role === 'ai' ? 'assistant' : m.role,
        content: m.content,
      })),
      stream: false,
      temperature: 0.7,
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(timeout),
  })

  if (res.status === 429) throw new Error('RATE_LIMITED')
  if (!res.ok) throw new Error(`doubao_docker HTTP ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || '[空回复]'
}

// ─── 智谱官方 API（内置 Key，无需 Cookie）─────────────────────
async function callZhipuApi(messages: ChatMessage[], _cookie: string, timeout = 30000): Promise<string> {
  // 限流: 确保请求间隔
  const now = Date.now()
  const elapsed = now - lastZhipuCall
  if (elapsed < ZHIPU_MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, ZHIPU_MIN_INTERVAL - elapsed))
  }
  lastZhipuCall = Date.now()

  const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ZHIPU_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'glm-4-flash',
      messages: messages.map(m => ({ role: m.role === 'lead' ? 'user' : m.role === 'ai' ? 'assistant' : m.role, content: m.content })),
      stream: false,
      temperature: 0.7,
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(timeout),
  })
  if (res.status === 429) throw new Error('RATE_LIMITED')
  if (!res.ok) throw new Error(`zhipu_api HTTP ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || '[空回复]'
}

const modelCallers: Record<string, (msgs: ChatMessage[], cookie: string) => Promise<string>> = {
  zhipu_api: callZhipuApi, doubao_docker: callDoubaoDocker, doubao: callDoubao, qianwen: callQianwen, kimi: callKimi, zhipu: callZhipu,
}

// ─── 多模型降级 ─────────────────────────────────────────────
async function callWithFallback(
  messages: ChatMessage[],
  cookies: Record<string, string>,
  preferredModel?: string
): Promise<{ text: string; model: string; fallbacks: string[] }> {
  const tried: string[] = []

  let currentModel: string
  if (preferredModel && preferredModel !== 'auto' && isModelAvailable(preferredModel, !!cookies[preferredModel])) {
    currentModel = preferredModel
  } else {
    currentModel = 'zai'
    for (const m of MODEL_PRIORITY) {
      if (isModelAvailable(m, !!cookies[m])) { currentModel = m; break }
    }
  }

  while (true) {
    tried.push(currentModel)
    modelStats[currentModel].total++

    try {
      if (currentModel === 'zai') {
        const zai = await getZAI()
        const completion = await zai.chat.completions.create({
          messages: messages as any,
          thinking: { type: 'disabled' },
        })
        const text = completion.choices?.[0]?.message?.content || ''
        if (!text) throw new Error('zai empty reply')
        markSuccess('zai')
        return { text, model: 'zai', fallbacks: tried }
      }

      // zhipu_api / doubao_docker / zai 不需要 Cookie
      const cookie = (currentModel === 'zhipu_api' || currentModel === 'doubao_docker') ? 'builtin' : cookies[currentModel]
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

      console.error(`[BRAIN] ${currentModel} 失败: ${errMsg.slice(0, 60)}`)

      let next = 'zai'
      for (const m of MODEL_PRIORITY) {
        if (isModelAvailable(m, !!cookies[m]) && !tried.includes(m)) { next = m; break }
      }
      if ((next === currentModel || tried.includes(next)) && !tried.includes('zai')) {
        next = 'zai'
      }
      if (tried.includes(next)) {
        throw new Error(`ALL_MODELS_FAILED: tried ${tried.join(', ')}`)
      }
      if (tried.length >= 6) throw new Error('TOO_MANY_FALLBACKS')

      currentModel = next
      await new Promise(r => setTimeout(r, 300))
    }
  }
}

// ─── API 路由 ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { messages, model = 'auto', cookies = {} } = body

  if (!messages?.length) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  }

  const startedAt = Date.now()

  // 缓存检查: 相同消息5分钟内不重复调用
  const lastMsg = messages[messages.length - 1]?.content || ''
  const cacheKey = `${model}:${lastMsg.slice(0, 100)}`
  const cached = replyCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({
      reply: cached.reply,
      model: 'cache',
      fallback_chain: ['cache'],
      fallback_count: 0,
      latency: 1,
      tokensUsed: Math.ceil(cached.reply.length / 4),
      cached: true,
    })
  }

  try {
    const result = await callWithFallback(messages, cookies, model)

    // 写入缓存
    if (lastMsg.length > 5) {
      replyCache.set(cacheKey, { reply: result.text, ts: Date.now() })
      // 清理过期缓存
      if (replyCache.size > 100) {
        for (const [k, v] of replyCache) {
          if (Date.now() - v.ts > CACHE_TTL) replyCache.delete(k)
        }
      }
    }

    return NextResponse.json({
      reply: result.text,
      model: result.model,
      fallback_chain: result.fallbacks,
      fallback_count: result.fallbacks.length - 1,
      latency: Date.now() - startedAt,
      tokensUsed: Math.ceil(result.text.length / 4),
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({
      error: errMsg,
      latency: Date.now() - startedAt,
      tried_models: [...MODEL_PRIORITY, 'zai'],
    }, { status: 502 })
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'WAOS AI 大脑 — 多模型逆向聚合',
    description: '智谱API(内置) → 豆包Docker → 豆包Cookie → 千问 → Kimi → 智谱Cookie → Z.AI 自动降级',
    models: MODEL_PRIORITY.map(m => ({
      id: m,
      name: { zhipu_api: '智谱GLM-4 (内置API)', doubao_docker: '豆包Docker (doubao2api)', doubao: '豆包(Cookie逆向)', qianwen: '通义千问', kimi: 'Kimi', zhipu: '智谱清言(Cookie)' }[m],
      loginUrl: {
        zhipu_api: null, doubao_docker: null, doubao: 'https://www.doubao.com/', qianwen: 'https://qwen.aliyun.com/', kimi: 'https://kimi.moonshot.cn/', zhipu: 'https://chatglm.cn/',
      }[m],
      cookieHint: {
        zhipu_api: '无需配置，内置 API Key 开箱即用', doubao_docker: '需启动 doubao2api Docker (端口9090)，扫码登录后自动可用', doubao: '登录豆包 → F12 → Application → Cookies → 复制全部', qianwen: '登录千问 → F12 → Cookies → 复制', kimi: '登录 Kimi → F12 → Cookies → 复制 kimi-auth', zhipu: '登录智谱 → F12 → Cookies → 复制 chatglm_token',
      }[m],
    })),
    zai: { id: 'zai', name: 'Z.AI 内置', loginUrl: null, desc: '兜底模型，无需配置' },
    stats: modelStats,
    cacheSize: replyCache.size,
    doubaoDockerUrl: DOUBAO_DOCKER_URL,
  })
}
