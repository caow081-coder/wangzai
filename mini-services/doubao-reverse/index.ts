/**
 * WAOS 内置豆包逆向服务 (port 7445)
 *
 * 直接集成在软件里，无需 Docker。模拟 doubao-2api 的 OpenAI 兼容接口。
 *
 * 功能:
 *  - POST /v1/chat/completions — 聊天（OpenAI 兼容）
 *  - POST /v1/images/generations — 图片生成
 *  - GET /v1/models — 模型列表
 *  - GET /health — 健康检查
 *  - 多账号 Cookie 轮询（环境变量 DOUBAO_COOKIES，逗号分隔）
 *
 * 用法:
 *   DOUBAO_COOKIES="cookie1,cookie2,cookie3" bun index.ts
 *
 * 前端调用:
 *   fetch('/api/waos/llm', { body: { provider: 'doubao', config: { dockerUrl: 'http://localhost:7445', cookie } } })
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Readable } from 'stream'

const PORT = 7445

// ─── 多账号 Cookie 轮询 ─────────────────────────────────────
const cookies = (process.env.DOUBAO_COOKIES || process.env.DOUBAO_COOKIE || '')
  .split(',')
  .map(c => c.trim())
  .filter(Boolean)

let cookieIndex = 0
function getNextCookie(): string {
  if (cookies.length === 0) return ''
  const c = cookies[cookieIndex % cookies.length]
  cookieIndex++
  return c
}

// ─── 请求统计 ─────────────────────────────────────────────
const stats = {
  total: 0,
  success: 0,
  fail: 0,
  fallback: 0,
  cookieRotations: 0,
  startedAt: Date.now(),
}

// ─── 工具函数 ─────────────────────────────────────────────
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
  })
}

function sendJSON(res: ServerResponse, status: number, body: any) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(json)
}

function sendSSE(res: ServerResponse, data: any) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
  res.write(`data: ${JSON.stringify(data)}\n\n`)
  res.end()
}

// ─── 豆包逆向核心 ─────────────────────────────────────────────
interface ChatMessage {
  role: string
  content: string
}

interface ChatRequest {
  model?: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

/**
 * 调用豆包网页版接口
 * 返回 SSE 流式响应，需解析提取文本
 *
 * 关键格式发现:
 *  - messages[].content 必须是 JSON 字符串: "{\"text\":\"消息内容\"}"
 *  - 不能是纯字符串，否则报 invalid character 错误
 */
async function callDoubao(messages: ChatMessage[], cookie: string, timeout = 30000): Promise<{ text: string; raw: string }> {
  const body = JSON.stringify({
    // 豆包要求 content 是 JSON 字符串格式
    messages: messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' && m.content.startsWith('{')
        ? m.content  // 已经是 JSON 字符串
        : JSON.stringify({ text: m.content })  // 包装成 {text: ...} 的 JSON 字符串
    })),
    model: 'doubao-pro',
    stream: true,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch('https://www.doubao.com/samantha/chat/completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/event-stream',
        'Referer': 'https://www.doubao.com/chat/',
        'Origin': 'https://www.doubao.com',
      },
      body,
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`doubao.com returned ${res.status}: ${text.slice(0, 200)}`)
    }

    const raw = await res.text()
    let text = ''

    // 解析 SSE：data: {...}\n\n
    const lines = raw.split('\n')
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const jsonStr = line.slice(5).trim()
        if (!jsonStr || jsonStr === '[DONE]') continue
        try {
          const obj = JSON.parse(jsonStr)
          // 豆包 SSE 事件格式:
          //  - event_type 2005: 错误/限流 (event_data 是 JSON 字符串含 code)
          //  - event_type 2001: AI 回复内容 (event_data 是 JSON 字符串含 message)
          //  - event_type 2003: 结束
          if (obj.event_type === 2005) {
            // 错误事件
            try {
              const errData = JSON.parse(obj.event_data)
              if (errData.code === 710022002) {
                throw new Error('doubao rate limited (710022002): 请稍后重试')
              }
              throw new Error(`doubao error: ${errData.message || JSON.stringify(errData)}`)
            } catch (e) {
              if (e instanceof Error && e.message.includes('doubao')) throw e
            }
          } else if (obj.event_type === 2001 || obj.event_type === 2002) {
            // AI 回复事件
            try {
              const msgData = JSON.parse(obj.event_data)
              text += msgData.message || msgData.content || msgData.text || ''
            } catch {}
          }
        } catch (e) {
          // 错误事件向上抛
          if (e instanceof Error && e.message.includes('doubao')) throw e
        }
      }
    }

    // 检测旧格式错误码（向后兼容）
    if (text.match(/ErrorX:code=|code=\d{9,}/)) {
      throw new Error(`doubao error: ${text.slice(0, 100)}`)
    }

    return { text: text || '[空回复]', raw }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 带多账号轮询的豆包调用
 */
async function callDoubaoWithRotation(messages: ChatMessage[], userCookie?: string, timeout?: number) {
  // 优先用用户传入的 cookie
  const cookieList = userCookie ? [userCookie, ...cookies] : cookies

  if (cookieList.length === 0) {
    throw new Error('No cookie available. Set DOUBAO_COOKIES env or pass cookie in request.')
  }

  let lastError: Error | null = null
  for (let i = 0; i < cookieList.length; i++) {
    const cookie = cookieList[i]
    try {
      const result = await callDoubao(messages, cookie, timeout)
      stats.success++
      if (i > 0) stats.cookieRotations++
      return result
    } catch (err) {
      lastError = err as Error
      stats.fail++
      console.error(`[doubao-reverse] Cookie ${i + 1}/${cookieList.length} failed: ${(err as Error).message.slice(0, 80)}`)
      // 继续尝试下一个 cookie
    }
  }
  throw lastError || new Error('All cookies failed')
}

// ─── HTTP 路由 ─────────────────────────────────────────────
const server = createServer(async (req, res) => {
  // CORS preflight
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

  // ─── 健康检查 ───────────────────────────────────────────
  if (path === '/health' && req.method === 'GET') {
    return sendJSON(res, 200, {
      status: 'ok',
      service: 'WAOS Built-in Doubao Reverse',
      port: PORT,
      cookies: cookies.length,
      uptime: Math.floor((Date.now() - stats.startedAt) / 1000),
      stats,
    })
  }

  // ─── 模型列表 ───────────────────────────────────────────
  if (path === '/v1/models' && req.method === 'GET') {
    return sendJSON(res, 200, {
      object: 'list',
      data: [
        { id: 'doubao-pro', object: 'model', created: Date.now(), owned_by: 'doubao' },
        { id: 'doubao-lite', object: 'model', created: Date.now(), owned_by: 'doubao' },
      ],
    })
  }

  // ─── 聊天 ───────────────────────────────────────────
  if (path === '/v1/chat/completions' && req.method === 'POST') {
    stats.total++
    const bodyStr = await readBody(req)
    let chatReq: ChatRequest
    try {
      chatReq = JSON.parse(bodyStr)
    } catch {
      return sendJSON(res, 400, { error: 'Invalid JSON' })
    }

    if (!chatReq.messages || !Array.isArray(chatReq.messages) || chatReq.messages.length === 0) {
      return sendJSON(res, 400, { error: 'messages required' })
    }

    // 从 Authorization header 提取 cookie（doubao-2api 兼容）
    const authHeader = req.headers.authorization || ''
    const userCookie = authHeader.replace('Bearer ', '').trim() || undefined

    try {
      const result = await callDoubaoWithRotation(chatReq.messages, userCookie, chatReq.max_tokens ? 60000 : 30000)

      // OpenAI 兼容响应
      const response = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: chatReq.model || 'doubao-pro',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: result.text },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: Math.ceil(JSON.stringify(chatReq.messages).length / 4),
          completion_tokens: Math.ceil(result.text.length / 4),
          total_tokens: Math.ceil((JSON.stringify(chatReq.messages).length + result.text.length) / 4),
        },
      }

      if (chatReq.stream) {
        return sendSSE(res, {
          ...response,
          choices: [{ ...response.choices[0], delta: { content: result.text }, finish_reason: 'stop' }],
        })
      }
      return sendJSON(res, 200, response)
    } catch (err) {
      stats.fail++
      const errMsg = err instanceof Error ? err.message : 'unknown'
      return sendJSON(res, 502, {
        error: `Doubao reverse failed: ${errMsg}`,
        hint: 'Cookie 可能过期。获取方式: 登录 doubao.com → F12 → Network → 复制 Cookie',
        stats,
      })
    }
  }

  // ─── 图片生成（占位）───────────────────────────────────
  if (path === '/v1/images/generations' && req.method === 'POST') {
    return sendJSON(res, 501, {
      error: 'Image generation not implemented in built-in reverse. Use Docker doubao2api for images.',
    })
  }

  // ─── 404 ───────────────────────────────────────────
  sendJSON(res, 404, { error: `Not found: ${path}` })
})

server.listen(PORT, () => {
  console.log(`[DOUBAO-REVERSE] 内置豆包逆向服务 running on port ${PORT}`)
  console.log(`[DOUBAO-REVERSE] 已加载 ${cookies.length} 个 Cookie`)
  console.log(`[DOUBAO-REVERSE] 健康检查: http://localhost:${PORT}/health`)
  console.log(`[DOUBAO-REVERSE] 聊天接口: POST http://localhost:${PORT}/v1/chat/completions`)
  if (cookies.length === 0) {
    console.warn(`[DOUBAO-REVERSE] ⚠️ 无 Cookie！设置 DOUBAO_COOKIES 环境变量或请求时传入`)
  }
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))
