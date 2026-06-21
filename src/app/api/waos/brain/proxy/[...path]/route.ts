/**
 * AI 大脑 — 平台登录页代理
 *
 * GET/POST /api/waos/brain/proxy/[model]/[...path]
 *
 * 反向代理各平台登录页，绕过 X-Frame-Options，让 iframe 能嵌入
 * 用户在 iframe 内登录后，后端捕获 Set-Cookie，存入 session
 * 用户点"我已登录"后，前端调 /api/waos/brain/extract 获取 Cookie
 *
 * 支持: doubao / qianwen / kimi / zhipu
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 平台域名映射
const PLATFORM_DOMAINS: Record<string, string> = {
  doubao: 'www.doubao.com',
  qianwen: 'qwen.aliyun.com',
  kimi: 'kimi.moonshot.cn',
  zhipu: 'chatglm.cn',
}

// 内存级 Cookie 存储（每个会话独立）
// key: sessionId, value: { model, cookies: string }
const sessionCookies = new Map<string, { model: string; cookies: string[] }>()

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handleProxy(req, path)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handleProxy(req, path)
}

async function handleProxy(req: NextRequest, pathSegments: string[]) {
  // 路径格式: /api/waos/brain/proxy/{model}/{...path}
  // pathSegments[0] = model, pathSegments[1:] = 实际路径
  const model = pathSegments[0]
  const actualPath = pathSegments.slice(1).join('/') || ''

  const domain = PLATFORM_DOMAINS[model]
  if (!domain) {
    return NextResponse.json({ error: `Unknown model: ${model}` }, { status: 400 })
  }

  const targetUrl = `https://${domain}/${actualPath}${req.nextUrl.search || ''}`
  const sessionId = req.headers.get('x-session-id') || 'default'

  try {
    // 转发请求
    const method = req.method
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': `https://${domain}/`,
    }

    // 转发已有 Cookie（维持会话）
    const existingSession = sessionCookies.get(sessionId)
    if (existingSession && existingSession.model === model && existingSession.cookies.length > 0) {
      headers['Cookie'] = existingSession.cookies.join('; ')
    }

    // 转发请求体
    let body: string | undefined
    if (method === 'POST' || method === 'PUT') {
      body = await req.text()
      headers['Content-Type'] = req.headers.get('content-type') || 'application/x-www-form-urlencoded'
    }

    const res = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: 'manual',  // 手动处理重定向，保持在代理内
    })

    // 捕获 Set-Cookie
    const setCookies = res.headers.getSetCookie?.() || []
    if (setCookies.length > 0) {
      if (!sessionCookies.has(sessionId)) {
        sessionCookies.set(sessionId, { model, cookies: [] })
      }
      const session = sessionCookies.get(sessionId)!
      // 提取 cookie name=value 部分（去掉 Path/Domain/Expires 等）
      for (const sc of setCookies) {
        const cookiePart = sc.split(';')[0]
        const cookieName = cookiePart.split('=')[0]
        // 移除同名的旧 cookie，添加新的
        session.cookies = session.cookies.filter(c => !c.startsWith(`${cookieName}=`))
        session.cookies.push(cookiePart)
      }
      session.model = model
    }

    // 构建响应
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': req.headers.get('origin') || 'http://localhost:3000',
      'x-session-id': sessionId,
      'x-model': model,
    }

    // 处理重定向（改为代理 URL）
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') || ''
      if (location) {
        // 把重定向改为走代理
        let redirectUrl = location
        if (location.startsWith('https://') || location.startsWith('http://')) {
          // 绝对 URL → 提取路径
          try {
            const u = new URL(location)
            if (u.hostname === domain) {
              redirectUrl = `/api/waos/brain/proxy/${model}${u.pathname}${u.search}`
            }
          } catch {}
        } else if (location.startsWith('/')) {
          redirectUrl = `/api/waos/brain/proxy/${model}${location}`
        }
        responseHeaders['Location'] = redirectUrl
      }
    }

    // 转发 Content-Type
    const contentType = res.headers.get('content-type')
    if (contentType) responseHeaders['Content-Type'] = contentType

    const resBody = await res.arrayBuffer()
    // 对 HTML 内容做改写（把绝对 URL 改为代理 URL）
    let modifiedBody: Buffer = Buffer.from(resBody)
    if (contentType?.includes('text/html')) {
      const html = Buffer.from(resBody).toString('utf-8')
      // 替换绝对 URL 为代理 URL
      const proxiedHtml = html
        .replace(new RegExp(`https?://${domain.replace('.', '\\.')}`, 'g'), `/api/waos/brain/proxy/${model}`)
        .replace(/action="\/([^"]+)"/g, `action="/api/waos/brain/proxy/${model}/$1"`)
        // 移除 X-Frame-Options（代理本身就绕过了）
      modifiedBody = Buffer.from(proxiedHtml)
    }

    return new NextResponse(modifiedBody, {
      status: res.status,
      headers: responseHeaders,
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'proxy failed',
      targetUrl,
    }, { status: 502 })
  }
}

// ─── Cookie 提取端点（通过 query 参数区分）─────────────────
// /api/waos/brain/proxy/extract?session=xxx → 返回该 session 的 Cookie
export async function extract(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session') || 'default'
  const session = sessionCookies.get(sessionId)
  if (!session) {
    return NextResponse.json({ error: 'no session' }, { status: 404 })
  }
  const cookieString = session.cookies.join('; ')
  return NextResponse.json({
    model: session.model,
    cookie: cookieString,
    cookieCount: session.cookies.length,
  })
}
