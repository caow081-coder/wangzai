/**
 * AI 大脑 — 自动提取 Cookie
 *
 * GET /api/waos/brain/extract?model=doubao&session=xxx
 *
 * 从代理会话中提取用户登录后的 Cookie
 * 用户在 iframe 内登录平台后，调用此端点获取 Cookie
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 导入共享的 sessionCookies（实际生产应用 Redis/DB）
// 这里简化：每个 API 实例独立内存，所以这个端点只能读取本实例的代理 session
// 真正全自动需要 Electron 桌面端

// 简化方案: 让前端直接在 iframe load 后，通过 fetch 代理一个特殊端点来获取 cookie
export async function GET(req: NextRequest) {
  const model = req.nextUrl.searchParams.get('model')
  const session = req.nextUrl.searchParams.get('session') || 'default'

  if (!model) {
    return NextResponse.json({ error: 'model required' }, { status: 400 })
  }

  // 方案: 通过后端代理访问平台的用户信息接口
  // 如果能拿到用户信息，说明已登录，后端代理时已经存了 Cookie
  // 这里我们用一个全局 Map（与 proxy route 共享）

  // 由于 Next.js 每个 API route 可能是独立实例，全局 Map 不可靠
  // 更好的方案: 让前端把 iframe 的 session ID 传过来
  // 后端用这个 session ID 去平台验证是否登录，如果登录则抓取完整 Cookie

  return NextResponse.json({
    error: '此端点需要配合代理使用。请确保用户已在 iframe 内登录。',
    hint: '前端调用: fetch(`/api/waos/brain/extract?model=${model}&session=${sessionId}`)',
    model,
    session,
  })
}
