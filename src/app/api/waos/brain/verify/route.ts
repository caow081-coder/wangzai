/**
 * AI 大脑 — Cookie 验证 API
 *
 * POST /api/waos/brain/verify
 *   { model, cookie }
 *
 * 验证 Cookie 是否有效:
 *  - doubao: 访问 doubao.com 首页，检查是否 302 重定向到 /chat/ (已登录)
 *  - qianwen: 访问 qwen.aliyun.com/api/user/me，检查返回
 *  - kimi: 用 Bearer token 创建会话，检查返回 conversation id
 *  - zhipu: 访问 chatglm.cn/api/user/self，检查 200
 *
 * 返回: { valid: boolean, username?: string, message: string }
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface VerifyRequest {
  model: string
  cookie: string
}

export async function POST(req: NextRequest) {
  const { model, cookie } = (await req.json()) as VerifyRequest

  if (!model || !cookie) {
    return NextResponse.json({ valid: false, message: 'model and cookie required' }, { status: 400 })
  }

  const startedAt = Date.now()

  try {
    let result: { valid: boolean; username?: string; message: string }

    switch (model) {
      case 'doubao':
        result = await verifyDoubao(cookie)
        break
      case 'qianwen':
        result = await verifyQianwen(cookie)
        break
      case 'kimi':
        result = await verifyKimi(cookie)
        break
      case 'zhipu':
        result = await verifyZhipu(cookie)
        break
      default:
        return NextResponse.json({ valid: false, message: `Unknown model: ${model}` }, { status: 400 })
    }

    return NextResponse.json({
      ...result,
      latency: Date.now() - startedAt,
    })
  } catch (err) {
    return NextResponse.json({
      valid: false,
      message: err instanceof Error ? err.message : 'unknown',
      latency: Date.now() - startedAt,
    }, { status: 200 })
  }
}

// ─── 豆包验证 ─────────────────────────────────────────────
async function verifyDoubao(cookie: string): Promise<{ valid: boolean; message: string }> {
  const res = await fetch('https://www.doubao.com/', {
    method: 'GET',
    headers: {
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    redirect: 'manual',  // 不自动跟随重定向
    signal: AbortSignal.timeout(10000),
  })

  // 已登录: 302 重定向到 /chat/
  if (res.status === 302 || res.status === 301) {
    const location = res.headers.get('location') || ''
    if (location.includes('/chat')) {
      // 进一步验证 Cookie 完整性（尝试调用聊天 API）
      try {
        const chatRes = await fetch('https://www.doubao.com/samantha/chat/completion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookie,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.doubao.com/chat/',
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: JSON.stringify({ text: '验证' }) }],
            model: 'doubao-pro', stream: true,
          }),
          signal: AbortSignal.timeout(10000),
        })

        if (chatRes.ok) {
          const text = await chatRes.text()
          if (text.includes('710022002')) {
            return { valid: true, message: 'Cookie 有效（当前被限流，稍后可用）' }
          }
          if (text.includes('event_type')) {
            return { valid: true, message: 'Cookie 有效，可正常对话' }
          }
        }
        return { valid: true, message: '已登录（聊天接口未响应，但登录态有效）' }
      } catch {
        return { valid: true, message: '已登录（聊天接口超时）' }
      }
    }
    return { valid: false, message: '重定向但未到聊天页，可能未登录' }
  }

  if (res.status === 200) {
    return { valid: false, message: '未登录（返回首页未重定向）' }
  }

  return { valid: false, message: `HTTP ${res.status}` }
}

// ─── 千问验证 ─────────────────────────────────────────────
async function verifyQianwen(cookie: string): Promise<{ valid: boolean; message: string }> {
  try {
    const res = await fetch('https://qwen.aliyun.com/api/user/me', {
      method: 'GET',
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      if (data.username || data.userId || data.data) {
        return { valid: true, message: `Cookie 有效${data.username ? `（用户: ${data.username})` : ''}` }
      }
      return { valid: true, message: 'Cookie 有效' }
    }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, message: 'Cookie 无效或已过期' }
    }
    return { valid: false, message: `HTTP ${res.status}` }
  } catch (e) {
    return { valid: false, message: `连接失败: ${e instanceof Error ? e.message : 'unknown'}` }
  }
}

// ─── Kimi 验证 ─────────────────────────────────────────────
async function verifyKimi(cookie: string): Promise<{ valid: boolean; message: string }> {
  // 从 cookie 中提取 kimi-auth
  const authMatch = cookie.match(/kimi-auth=([^;]+)/)
  const authToken = authMatch?.[1]

  if (!authToken) {
    return { valid: false, message: 'Cookie 中未找到 kimi-auth 字段' }
  }

  try {
    // 用 Bearer token 创建会话验证
    const res = await fetch('https://kimi.moonshot.cn/api/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://kimi.moonshot.cn/chat',
      },
      body: JSON.stringify({ name: 'WAOS验证', is_example: false }),
      signal: AbortSignal.timeout(10000),
    })

    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      if (data.id) {
        return { valid: true, message: 'Cookie 有效（可创建会话）' }
      }
    }
    if (res.status === 401) {
      return { valid: false, message: 'kimi-auth 已过期，请重新登录' }
    }
    return { valid: false, message: `HTTP ${res.status}` }
  } catch (e) {
    return { valid: false, message: `连接失败: ${e instanceof Error ? e.message : 'unknown'}` }
  }
}

// ─── 智谱验证 ─────────────────────────────────────────────
async function verifyZhipu(cookie: string): Promise<{ valid: boolean; message: string }> {
  const tokenMatch = cookie.match(/chatglm_token=([^;]+)/)
  const token = tokenMatch?.[1]

  if (!token) {
    return { valid: false, message: 'Cookie 中未找到 chatglm_token 字段' }
  }

  try {
    // 尝试访问用户信息接口
    const res = await fetch('https://chatglm.cn/api/user/self', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (res.ok) {
      const text = await res.text()
      // 如果返回 JSON（不是 HTML 首页），说明 API 可用
      if (text.startsWith('{')) {
        const data = JSON.parse(text)
        return { valid: true, message: `Cookie 有效${data.username ? `（用户: ${data.username})` : ''}` }
      }
      return { valid: false, message: '返回 HTML 而非 API 数据，Token 可能无效' }
    }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, message: 'chatglm_token 已过期' }
    }
    return { valid: false, message: `HTTP ${res.status}` }
  } catch (e) {
    return { valid: false, message: `连接失败: ${e instanceof Error ? e.message : 'unknown'}` }
  }
}
