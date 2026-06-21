/**
 * 旺财视频号接入 API
 *
 * POST /api/waos/wechat-video { action, ... }
 * GET  /api/waos/wechat-video
 *
 * actions:
 *   - login          : 登录视频号（mock）
 *   - get_comments   : 获取评论列表（可选 videoId 过滤）
 *   - get_messages   : 获取私信消息列表
 *   - reply_comment  : 回复评论 { commentId, content }
 *   - send_dm        : 发送私信 { userId, content }
 *   - like_video     : 点赞视频 { videoId }
 *   - logout         : 登出
 */
import { NextRequest, NextResponse } from 'next/server'
import { getWechatVideoConnector } from '@/lib/wechat-video/connector'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const connector = getWechatVideoConnector()

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = body?.action as string | undefined

  try {
    switch (action) {
      case 'login': {
        const ok = await connector.login()
        return NextResponse.json({
          action: 'login',
          success: ok,
          loggedIn: ok,
        })
      }

      case 'get_comments': {
        const comments = await connector.getComments(body.videoId)
        const highIntent = comments.filter((c) => c.intentScore >= 70)
        return NextResponse.json({
          action: 'get_comments',
          comments,
          highIntentCount: highIntent.length,
          totalCount: comments.length,
        })
      }

      case 'get_messages': {
        const messages = await connector.getMessages()
        return NextResponse.json({
          action: 'get_messages',
          messages,
          totalCount: messages.length,
        })
      }

      case 'reply_comment': {
        const ok = await connector.replyComment(body.commentId, body.content)
        return NextResponse.json({
          action: 'reply_comment',
          success: ok,
        })
      }

      case 'send_dm': {
        const ok = await connector.sendDM(body.userId, body.content)
        return NextResponse.json({
          action: 'send_dm',
          success: ok,
        })
      }

      case 'like_video': {
        const ok = await connector.likeVideo(body.videoId)
        return NextResponse.json({
          action: 'like_video',
          success: ok,
        })
      }

      case 'logout': {
        connector.logout()
        return NextResponse.json({
          action: 'logout',
          success: true,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        )
    }
  } catch (err) {
    // 完善错误处理：不抛未捕获异常，统一返回 500 + 错误消息
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { action, error: message, success: false },
      { status: 500 },
    )
  }
}

export async function GET() {
  // GET 兜底：connector.getComments 内部已带 10s 超时，
  // 这里再加 .catch 防止未捕获异常导致 500
  const comments = await connector.getComments().catch(() => [])
  return NextResponse.json({
    service: '旺财视频号接入',
    loggedIn: connector.isLoggedIn(),
    commentCount: comments.length,
    highIntentCount: comments.filter((c) => c.intentScore >= 70).length,
    actions: [
      'login',
      'get_comments',
      'get_messages',
      'reply_comment',
      'send_dm',
      'like_video',
      'logout',
    ],
    comments: comments.slice(0, 10),
  })
}
