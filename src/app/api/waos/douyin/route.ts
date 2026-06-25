/**
 * 旺财抖音接入 API
 * POST /api/waos/douyin { action, ... }
 * GET /api/waos/douyin
 */
import { NextRequest, NextResponse } from 'next/server'
import { getDouyinConnector } from '@/lib/douyin/connector'
import { sanitizeInput } from '@/lib/safety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const connector = getDouyinConnector()

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = body.action

  try {
    switch (action) {
      case 'login': {
        const ok = await connector.login()
        return NextResponse.json({ action: 'login', success: ok, loggedIn: ok })
      }
      case 'get_comments': {
        const comments = await connector.getComments(body.videoId)
        const highIntent = comments.filter(c => c.intentScore >= 70)
        return NextResponse.json({ action: 'get_comments', comments, highIntentCount: highIntent.length, totalCount: comments.length })
      }
      case 'send_dm': {
        if (!body.userId || !body.content || typeof body.content !== 'string') {
          return NextResponse.json({ action: 'send_dm', success: false, error: 'userId and content required' }, { status: 400 })
        }
        const sanity = sanitizeInput(body.content)
        if (!sanity.ok) {
          return NextResponse.json({ action: 'send_dm', success: false, error: `内容未过安全检测: ${sanity.reason}`, layer: sanity.layer }, { status: 400 })
        }
        const ok = await connector.sendDM(body.userId, body.content)
        return NextResponse.json({ action: 'send_dm', success: ok })
      }
      case 'reply_comment': {
        if (!body.commentId || !body.content || typeof body.content !== 'string') {
          return NextResponse.json({ action: 'reply_comment', success: false, error: 'commentId and content required' }, { status: 400 })
        }
        const sanity = sanitizeInput(body.content)
        if (!sanity.ok) {
          return NextResponse.json({ action: 'reply_comment', success: false, error: `内容未过安全检测: ${sanity.reason}`, layer: sanity.layer }, { status: 400 })
        }
        const ok = await connector.replyComment(body.commentId, body.content)
        return NextResponse.json({ action: 'reply_comment', success: ok })
      }
      case 'logout': {
        connector.logout()
        return NextResponse.json({ action: 'logout', success: true })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[DOUYIN] action=${action} 失败:`, errMsg)
    return NextResponse.json({ action, success: false, error: errMsg }, { status: 500 })
  }
}

export async function GET() {
  const comments = await connector.getComments()
  return NextResponse.json({
    service: '旺财抖音接入',
    loggedIn: connector.isLoggedIn(),
    commentCount: comments.length,
    highIntentCount: comments.filter(c => c.intentScore >= 70).length,
    actions: ['login', 'get_comments', 'send_dm', 'reply_comment', 'logout'],
    comments: comments.slice(0, 10),
  })
}
