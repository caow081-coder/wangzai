/**
 * WAOS LLM Provider — 统一大模型对接 API
 *
 * POST /api/waos/llm
 *   { provider, messages, config }
 *
 * 支持的 provider 类型:
 *  1. zai        — Z.AI SDK（内置，无需Key）
 *  2. openai     — OpenAI兼容API（需apiUrl+apiKey+model）
 *  3. ollama     — Ollama本地模型（需localUrl+model）
 *  4. proxy      — 本地代理（需proxyUrl）
 *  5. doubao     — 豆包逆向（需cookie/token）
 *  6. qianwen    — 千问逆向（需cookie/token）
 *  7. kimi       — Kimi逆向（需cookie）
 *  8. groq       — Groq免费API（需apiKey）
 *
 * 打包后用户可在设置面板配置自己的Key和URL。
 */

import { NextRequest, NextResponse } from 'next/server'
import { getZAI } from '@/lib/zai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface LLMRequest {
  provider: string
  messages: { role: string; content: string }[]
  config?: {
    apiUrl?: string
    apiKey?: string
    model?: string
    localUrl?: string
    proxyUrl?: string
    dockerUrl?: string  // 豆包 Docker 逆向服务地址（如 http://localhost:7445）
    reverseType?: string
    cookie?: string
    maxTokens?: number
    temperature?: number
    timeout?: number
  }
}

export async function POST(req: NextRequest) {
  let body: LLMRequest & { providerId?: string }
  try {
    body = (await req.json()) as LLMRequest & { providerId?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  // 兼容 provider / providerId 两种字段名（防御式编程）
  const provider = body?.provider || body?.providerId
  const { messages, config = {} } = body || {}

  if (!provider) {
    return NextResponse.json({ error: 'provider required (or providerId)' }, { status: 400 })
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  }

  const startedAt = Date.now()

  try {
    let reply = ''
    let tokensUsed = 0

    switch (provider) {
      // ─── Z.AI 内置（无需Key）──────────────────────────────
      case 'zai': {
        const zai = await getZAI()
        const completion = await zai.chat.completions.create({
          messages: messages as any,
          thinking: { type: 'disabled' },
        })
        reply = completion.choices?.[0]?.message?.content || ''
        tokensUsed = Math.ceil(reply.length / 4)
        break
      }

      // ─── OpenAI 兼容 API（OpenAI/智谱/通义/DeepSeek等）────
      case 'openai': {
        if (!config.apiUrl || !config.apiKey) {
          return NextResponse.json({ error: 'apiUrl and apiKey required for openai provider' }, { status: 400 })
        }
        const res = await fetch(`${config.apiUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model || 'gpt-4o-mini',
            messages,
            max_tokens: config.maxTokens || 1024,
            temperature: config.temperature ?? 0.7,
          }),
          signal: AbortSignal.timeout(config.timeout || 30000),
        })
        if (!res.ok) {
          const errText = await res.text()
          return NextResponse.json({ error: `API ${res.status}: ${errText.slice(0, 200)}` }, { status: 502 })
        }
        const data = await res.json()
        reply = data.choices?.[0]?.message?.content || ''
        tokensUsed = data.usage?.total_tokens || Math.ceil(reply.length / 4)
        break
      }

      // ─── Ollama 本地模型 ──────────────────────────────────
      case 'ollama': {
        if (!config.localUrl) {
          return NextResponse.json({ error: 'localUrl required for ollama provider' }, { status: 400 })
        }
        try {
          const res = await fetch(`${config.localUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: config.model || 'qwen2:7b',
              messages,
              stream: false,
              options: { temperature: config.temperature ?? 0.7 },
            }),
            signal: AbortSignal.timeout(config.timeout || 60000),
          })
          if (!res.ok) {
            return NextResponse.json({ error: `Ollama ${res.status}` }, { status: 502 })
          }
          const data = await res.json()
          reply = data.message?.content || ''
          tokensUsed = data.eval_count || Math.ceil(reply.length / 4)
          break
        } catch (err) {
          return NextResponse.json({
            error: `Ollama 连接失败: ${err instanceof Error ? err.message : 'unknown'}`,
            hint: '请确认 Ollama 已启动并监听 ' + config.localUrl,
          }, { status: 502 })
        }
      }

      // ─── 本地代理 ─────────────────────────────────────────
      case 'proxy': {
        if (!config.proxyUrl) {
          return NextResponse.json({ error: 'proxyUrl required' }, { status: 400 })
        }
        try {
          const res = await fetch(`${config.proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
            },
            body: JSON.stringify({
              model: config.model || 'default',
              messages,
              max_tokens: config.maxTokens || 1024,
              temperature: config.temperature ?? 0.7,
            }),
            signal: AbortSignal.timeout(config.timeout || 30000),
          })
          if (!res.ok) {
            return NextResponse.json({ error: `Proxy ${res.status}` }, { status: 502 })
          }
          const data = await res.json()
          reply = data.choices?.[0]?.message?.content || ''
          tokensUsed = data.usage?.total_tokens || Math.ceil(reply.length / 4)
          break
        } catch (err) {
          return NextResponse.json({
            error: `代理连接失败: ${err instanceof Error ? err.message : 'unknown'}`,
            hint: '请确认代理服务已启动并监听 ' + config.proxyUrl,
          }, { status: 502 })
        }
      }

      // ─── Groq 免费 API（超快，推荐）─────────────────────
      case 'groq': {
        if (!config.apiKey) {
          return NextResponse.json({ error: 'apiKey required for groq (免费申请: console.groq.com)' }, { status: 400 })
        }
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model || 'llama-3.3-70b-versatile',
            messages,
            max_tokens: config.maxTokens || 1024,
            temperature: config.temperature ?? 0.7,
          }),
          signal: AbortSignal.timeout(config.timeout || 30000),
        })
        if (!res.ok) {
          return NextResponse.json({ error: `Groq ${res.status}` }, { status: 502 })
        }
        const data = await res.json()
        reply = data.choices?.[0]?.message?.content || ''
        tokensUsed = data.usage?.total_tokens || 0
        break
      }

      // ─── 豆包逆向（需cookie，参考GitHub: doubao-api）────
      case 'doubao': {
        if (!config.cookie) {
          return NextResponse.json({
            error: 'cookie required for doubao reverse. 获取方式: 登录 doubao.com → F12 → Network → 复制 Cookie',
            hint: '参考项目: github.com/Devo9X/doubao-api 或 github.com/Vinlic/doubao-reverse',
          }, { status: 400 })
        }

        // 豆包逆向有三种模式：
        //  A) Docker doubao-2api 服务（推荐，稳定）— config.dockerUrl 指向本地 7445 端口
        //  B) 直连 doubao.com（不稳定，SSE 流式 + 反爬）
        //  C) 降级到 Z.AI（兜底）

        // 模式 A: Docker 逆向服务（优先）
        if (config.dockerUrl || config.apiUrl) {
          const endpoint = config.dockerUrl || config.apiUrl
          try {
            const dRes = await fetch(`${endpoint}/v1/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.cookie}`,  // doubao-2api 用 Cookie 当 key
              },
              body: JSON.stringify({
                model: config.model || 'doubao-pro',
                messages,
                stream: false,
              }),
              signal: AbortSignal.timeout(config.timeout || 15000),
            })
            if (dRes.ok) {
              const dData = await dRes.json()
              reply = dData.choices?.[0]?.message?.content || ''
              tokensUsed = dData.usage?.total_tokens || Math.ceil(reply.length / 4)
              break  // 成功，不走降级
            }
          } catch {
            // Docker 服务未启动，继续走直连/降级
          }
        }

        // 模式 B: 直连 doubao.com（不稳定，仅作尝试）
        let directSuccess = false
        try {
          const res = await fetch('https://www.doubao.com/samantha/chat/completion', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': config.cookie,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            body: JSON.stringify({
              messages: messages.map(m => ({ role: m.role, content: m.content })),
              model: 'doubao-pro',
            }),
            signal: AbortSignal.timeout(config.timeout || 10000),
          })

          if (res.ok) {
            // ⚠️ doubao.com 返回 SSE 流式响应（event: gateway...），不是 JSON
            const contentType = res.headers.get('content-type') || ''
            const text = await res.text()

            if (contentType.includes('text/event-stream') || text.startsWith('event:')) {
              // SSE 格式：提取 data: 行中的 content
              const lines = text.split('\n')
              const dataLines = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trim())
              let rawReply = ''
              for (const line of dataLines) {
                try {
                  const obj = JSON.parse(line)
                  if (obj.message || obj.content || obj.event_data?.content) {
                    rawReply += obj.message || obj.content || obj.event_data?.content || ''
                  }
                } catch { /* 跳过非 JSON 行 */ }
              }
              // 检测豆包错误码（ErrorX:code= 或 code=710012000 等）
              if (rawReply && !rawReply.match(/ErrorX:code=|^code=\d+|stable=t$/)) {
                reply = rawReply
                directSuccess = true
                tokensUsed = Math.ceil(reply.length / 4)
              }
            } else {
              // 普通 JSON 响应
              try {
                const data = JSON.parse(text)
                reply = data.message || data.content || data.choices?.[0]?.message?.content || ''
                if (reply && !reply.match(/ErrorX:code=|code=\d{9,}/)) {
                  directSuccess = true
                  tokensUsed = Math.ceil(reply.length / 4)
                }
              } catch { /* JSON 解析失败，走降级 */ }
            }
          }
        } catch {
          // 直连超时/网络错误，走降级
        }

        // 模式 C: 降级到 Z.AI
        if (!directSuccess) {
          const zai = await getZAI()
          const completion = await zai.chat.completions.create({ messages: messages as any, thinking: { type: 'disabled' } })
          reply = completion.choices?.[0]?.message?.content || ''
          tokensUsed = Math.ceil(reply.length / 4)
          return NextResponse.json({
            reply, tokensUsed, latency: Date.now() - startedAt,
            provider: 'zai',
            warning: '豆包逆向未对接（需启动 Docker doubao-2api 或提供有效 Cookie）。已降级到 Z.AI 内置模型。',
            hint: '生产建议: docker compose 启动 lza6/doubao-2api:latest，config.dockerUrl=http://localhost:7445',
          })
        }
        break
      }

      // ─── Kimi 逆向（需cookie，参考: github.com/LLM-Red-Team）──
      case 'kimi': {
        if (!config.cookie) {
          return NextResponse.json({
            error: 'cookie required for kimi reverse. 登录 kimi.moonshot.cn → F12 → 复制 Cookie',
            hint: 'Kimi 免费且支持长上下文(128K)，适合长对话。参考: github.com/LLM-Red-Team/kimi-free-api',
          }, { status: 400 })
        }
        // 模拟Kimi逆向
        const zai = await getZAI()
        const completion = await zai.chat.completions.create({ messages: messages as any, thinking: { type: 'disabled' } })
        reply = completion.choices?.[0]?.message?.content || ''
        tokensUsed = Math.ceil(reply.length / 4)
        return NextResponse.json({
          reply, tokensUsed, latency: Date.now() - startedAt,
          provider: 'kimi',
          warning: 'Kimi逆向需对接逆向服务，当前降级到Z.AI。参考: github.com/LLM-Red-Team/kimi-free-api',
        })
      }

      default:
        return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
    }

    return NextResponse.json({
      reply,
      tokensUsed,
      latency: Date.now() - startedAt,
      provider,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'unknown'
    // 上游限流 → 429；上游错误 → 502；其他 → 500
    let status = 500
    if (errMsg.includes('429') || errMsg.toLowerCase().includes('too many requests') || errMsg.toLowerCase().includes('rate limit')) {
      status = 429
    } else if (errMsg.includes('API request failed') || errMsg.includes('status 5')) {
      status = 502
    } else if (errMsg.includes('status 4')) {
      status = 400
    }
    return NextResponse.json({
      error: errMsg,
      latency: Date.now() - startedAt,
      provider,
      retryAfter: status === 429 ? 5 : undefined,
    }, { status })
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'WAOS LLM Provider',
    description: '统一大模型对接 — 支持 API/本地/代理/逆向',
    providers: [
      { id: 'zai', name: 'Z.AI (内置)', requiresKey: false, desc: '无需配置，开箱即用' },
      { id: 'openai', name: 'OpenAI兼容API', requiresKey: true, fields: ['apiUrl', 'apiKey', 'model'], desc: 'OpenAI/智谱/通义/DeepSeek 等' },
      { id: 'ollama', name: 'Ollama本地', requiresKey: false, fields: ['localUrl', 'model'], desc: 'localhost:11434，免费' },
      { id: 'proxy', name: '本地代理', requiresKey: false, fields: ['proxyUrl', 'model'], desc: '中转代理' },
      { id: 'groq', name: 'Groq免费API', requiresKey: true, fields: ['apiKey'], desc: 'console.groq.com 免费申请，超快(500+tok/s)' },
      { id: 'doubao', name: '豆包逆向', requiresKey: true, fields: ['cookie'], desc: '登录doubao.com获取Cookie，免费多模态' },
      { id: 'kimi', name: 'Kimi逆向', requiresKey: true, fields: ['cookie'], desc: '登录kimi.moonshot.cn获取Cookie，128K长上下文' },
    ],
    multimodal: {
      vlm: 'POST /api/waos/vlm — 图片理解（看图）',
      asr: 'POST /api/waos/asr — 语音转文字',
      tts: 'POST /api/waos/tts — 文字转语音（人设声线）',
    },
  })
}
