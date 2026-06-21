/**
 * 旺财朋友圈接入 API
 *
 * POST /api/waos/moments { action, ... }
 * GET  /api/waos/moments
 *
 * actions:
 *   - login          : 登录朋友圈（mock）
 *   - logout         : 登出
 *   - get_posts      : 获取朋友圈列表（可选 limit）
 *   - get_comments   : 获取评论列表（可选 postId 过滤）
 *   - patrol         : 启动巡视任务
 *   - patrol_status  : 查询巡视进度
 *   - reply_comment  : 回复评论 { commentId, content }
 *   - like_post      : 点赞朋友圈 { postId }
 *   - post_moment    : 发朋友圈 { content, images }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMomentsConnector } from '@/lib/moments/connector'
import { sanitizeInput } from '@/lib/safety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const connector = getMomentsConnector()

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

      case 'logout': {
        connector.logout()
        return NextResponse.json({
          action: 'logout',
          success: true,
        })
      }

      case 'get_posts': {
        const posts = await connector.getPosts(body.limit)
        return NextResponse.json({
          action: 'get_posts',
          posts,
          totalCount: posts.length,
        })
      }

      case 'get_comments': {
        const comments = await connector.getComments(body.postId)
        const highIntent = comments.filter((c) => c.intentScore >= 70)
        const pending = comments.filter((c) => c.replyStatus === 'pending')
        return NextResponse.json({
          action: 'get_comments',
          comments,
          totalCount: comments.length,
          highIntentCount: highIntent.length,
          pendingCount: pending.length,
        })
      }

      case 'patrol': {
        const task = await connector.patrol()
        return NextResponse.json({
          action: 'patrol',
          task,
          success: true,
        })
      }

      case 'patrol_status': {
        const task = connector.getPatrolStatus()
        return NextResponse.json({
          action: 'patrol_status',
          task,
          hasTask: !!task,
        })
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
        return NextResponse.json({
          action: 'reply_comment',
          success: ok,
        })
      }

      case 'like_post': {
        const ok = await connector.likePost(body.postId)
        return NextResponse.json({
          action: 'like_post',
          success: ok,
        })
      }

      case 'post_moment': {
        if (!body.content || typeof body.content !== 'string') {
          return NextResponse.json({ action: 'post_moment', success: false, error: 'content required' }, { status: 400 })
        }
        const sanity = sanitizeInput(body.content)
        if (!sanity.ok) {
          return NextResponse.json({ action: 'post_moment', success: false, error: `内容未过安全检测: ${sanity.reason}`, layer: sanity.layer }, { status: 400 })
        }
        const ok = await connector.postMoment(body.content, body.images)
        return NextResponse.json({
          action: 'post_moment',
          success: ok,
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
  // GET 兜底：connector.getPosts / getComments 内部已带 10s 超时，
  // 这里再加 .catch 防止未捕获异常导致 500
  const [posts, comments, task] = await Promise.all([
    connector.getPosts().catch(() => []),
    connector.getComments().catch(() => []),
    Promise.resolve(connector.getPatrolStatus()),
  ])
  const highIntent = comments.filter((c) => c.intentScore >= 70)
  return NextResponse.json({
    service: '旺财朋友圈场控',
    loggedIn: connector.isLoggedIn(),
    postCount: posts.length,
    commentCount: comments.length,
    highIntentCount: highIntent.length,
    patrol: task
      ? {
          id: task.id,
          status: task.status,
          progress: task.progress,
          scannedCount: task.scannedCount,
          newCommentsCount: task.newCommentsCount,
          highIntentCount: task.highIntentCount,
        }
      : null,
    actions: [
      'login',
      'logout',
      'get_posts',
      'get_comments',
      'patrol',
      'patrol_status',
      'reply_comment',
      'like_post',
      'post_moment',
    ],
    posts: posts.slice(0, 6),
  })
}
