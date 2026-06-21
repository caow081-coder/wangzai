/**
 * 旺财抖音接入 API
 * POST /api/waos/douyin { action, ... }
 * GET /api/waos/douyin
 */
import { NextRequest, NextResponse } from 'next/server'
import { getDouyinConnector } from '@/lib/douyin/connector'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const connector = getDouyinConnector()

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = body.action

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
      const ok = await connector.sendDM(body.userId, body.content)
      return NextResponse.json({ action: 'send_dm', success: ok })
    }
    case 'reply_comment': {
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
