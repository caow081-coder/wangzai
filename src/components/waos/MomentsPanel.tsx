'use client'

/**
 * 旺财 · 朋友圈场控面板
 *
 * 功能模块：
 *  1. 顶部状态栏：巡视状态指示 + 进度条 + 启动/暂停按钮 + 巡视统计
 *  2. 朋友圈列表：6 条种子动态，每条可展开查看评论
 *  3. 评论意向分三色标签（HOT/WARM/COLD）+ 回复入口
 *  4. 底部巡视日志时间线（可折叠）
 *  5. 发朋友圈 Dialog（内容 + 图片 URL 最多 9 张）
 *
 * API：/api/waos/moments
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from '@/components/ui/collapsible'
import {
  Camera, Send, Heart, MessageSquare, Play, Pause, ChevronDown, X,
  Loader2, Sparkles, Plus, Image as ImageIcon, CheckCircle2, Info, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { MomentPost, MomentComment, PatrolTask, PatrolLog } from '@/lib/moments/connector'

const API = '/api/waos/moments'

// ============== 工具函数 ==============

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return `${Math.floor(diff / 86400000)}天前`
}

function formatLogTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

/** 意向分三色标签 */
function intentBadge(intentScore: number): {
  label: string
  className: string
} {
  if (intentScore >= 70) {
    return {
      label: 'HOT',
      className: 'bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400',
    }
  }
  if (intentScore >= 60) {
    return {
      label: 'WARM',
      className: 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400',
    }
  }
  return {
    label: 'COLD',
    className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20 dark:text-zinc-400',
  }
}

/** 日志等级图标 */
function logIcon(level: PatrolLog['level']) {
  if (level === 'success') return <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
  if (level === 'warn') return <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
  return <Info className="w-3 h-3 text-sky-500 shrink-0" />
}

// ============== 主组件 ==============

export function MomentsPanel() {
  const [posts, setPosts] = useState<MomentPost[]>([])
  const [commentsByPost, setCommentsByPost] = useState<Record<string, MomentComment[]>>({})
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set())
  const [patrol, setPatrol] = useState<PatrolTask | null>(null)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 加载朋友圈 + 评论
  const refreshAll = useCallback(async () => {
    try {
      const [postsRes, commentsRes] = await Promise.all([
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_posts' }),
        }),
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_comments' }),
        }),
      ])
      const postsJson = await postsRes.json()
      const commentsJson = await commentsRes.json()
      setPosts(postsJson.posts || [])
      const grouped: Record<string, MomentComment[]> = {}
      for (const c of (commentsJson.comments || []) as MomentComment[]) {
        if (!grouped[c.postId]) grouped[c.postId] = []
        grouped[c.postId].push(c)
      }
      setCommentsByPost(grouped)
    } catch (err) {
      console.error('[MomentsPanel] refreshAll error', err)
    }
  }, [])

  // 启动巡视
  const startPatrol = useCallback(async () => {
    setLoading(true)
    setPaused(false)
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'patrol' }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('巡视任务已启动')
        setPatrol(json.task)
      } else {
        toast.error('巡视启动失败')
      }
    } catch (err) {
      console.error('[MomentsPanel] startPatrol error', err)
      toast.error('巡视启动失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 暂停巡视（客户端停止轮询）
  const pausePatrol = useCallback(() => {
    setPaused(true)
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    toast.info('巡视已暂停（停止刷新进度）')
  }, [])

  // 恢复巡视
  const resumePatrol = useCallback(() => {
    setPaused(false)
    toast.info('巡视已恢复')
  }, [])

  // 轮询巡视进度
  useEffect(() => {
    if (paused) return
    const pollOnce = async () => {
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'patrol_status' }),
        })
        const json = await res.json()
        const task: PatrolTask | null = json.task || null
        setPatrol(task)
        if (task && task.status === 'completed') {
          // 巡视完成刷新朋友圈+评论
          refreshAll()
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        }
      } catch (err) {
        // 静默
        console.error('[MomentsPanel] pollOnce error', err)
      }
    }
    pollOnce()
    pollRef.current = setInterval(pollOnce, 800)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [paused, refreshAll])

  // 初次加载
  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // 回复评论
  const handleReply = useCallback(async (commentId: string, content: string) => {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reply_comment', commentId, content }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('回复已发送')
        refreshAll()
      } else {
        toast.error('回复失败')
      }
    } catch (err) {
      console.error('[MomentsPanel] handleReply error', err)
      toast.error('回复失败')
    }
  }, [refreshAll])

  // 点赞
  const handleLike = useCallback(async (postId: string) => {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'like_post', postId }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('已点赞')
        refreshAll()
      }
    } catch (err) {
      console.error('[MomentsPanel] handleLike error', err)
      toast.error('点赞失败')
    }
  }, [refreshAll])

  // 发朋友圈
  const handlePostMoment = useCallback(async (content: string, images: string[]) => {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'post_moment', content, images }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('朋友圈已发布')
        setPostDialogOpen(false)
        refreshAll()
      } else {
        toast.error('发布失败')
      }
    } catch (err) {
      console.error('[MomentsPanel] handlePostMoment error', err)
      toast.error('发布失败')
    }
  }, [refreshAll])

  const toggleExpand = useCallback((postId: string) => {
    setExpandedPostIds((prev) => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }, [])

  const patrolling = patrol?.status === 'patrolling'
  const patrolCompleted = patrol?.status === 'completed'
  const patrolPaused = paused && patrolling

  // 巡视状态文案与色彩
  const statusInfo = patrolPaused
    ? { text: '已暂停', color: 'text-amber-600', dot: 'bg-amber-500' }
    : patrolling
    ? { text: '巡视中', color: 'text-emerald-600', dot: 'bg-emerald-500 animate-pulse' }
    : patrolCompleted
    ? { text: '已完成', color: 'text-sky-600', dot: 'bg-sky-500' }
    : { text: '待命', color: 'text-zinc-500', dot: 'bg-zinc-400' }

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#1e1e1e] min-h-0">
      {/* ─── 顶部状态栏 ─────────────────────────── */}
      <header className="shrink-0 px-4 py-3 border-b border-black/5 dark:border-white/5 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
            <span className={`text-[13px] font-semibold ${statusInfo.color}`}>
              朋友圈巡视 · {statusInfo.text}
            </span>
            {patrol && (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {patrol.progress}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={patrolPaused ? resumePatrol : startPatrol}
              disabled={loading || patrolling}
              className="h-7 text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : patrolPaused ? (
                <Play className="w-3 h-3" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {patrolPaused ? '恢复' : '启动巡视'}
            </Button>
            {(patrolling || patrolPaused) && (
              <Button
                size="sm"
                variant="outline"
                onClick={pausePatrol}
                disabled={!patrolling || patrolPaused}
                className="h-7 text-[11px]"
              >
                <Pause className="w-3 h-3" />
                暂停
              </Button>
            )}
            <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                >
                  <Camera className="w-3 h-3" />
                  发朋友圈
                </Button>
              </DialogTrigger>
              <PostMomentDialog onSubmit={handlePostMoment} />
            </Dialog>
          </div>
        </div>

        {/* 进度条 */}
        {(patrolling || patrolCompleted || patrolPaused) && patrol && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-2.5"
          >
            <Progress value={patrol.progress} className="h-1.5 bg-emerald-100 dark:bg-emerald-950/40" />
          </motion.div>
        )}

        {/* 统计 */}
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <StatBox
            label="已扫描"
            value={patrol?.scannedCount ?? 0}
            color="text-zinc-700 dark:text-zinc-300"
          />
          <StatBox
            label="新评论"
            value={patrol?.newCommentsCount ?? 0}
            color="text-amber-600"
          />
          <StatBox
            label="高意向"
            value={patrol?.highIntentCount ?? 0}
            color="text-rose-500"
          />
        </div>
      </header>

      {/* ─── 朋友圈列表 ─────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto waos-scrollbar max-h-[calc(100vh-340px)]">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-zinc-400">
            <Camera className="w-10 h-10 mb-2" />
            <p className="text-[12px]">暂无朋友圈动态</p>
          </div>
        ) : (
          posts.map((post) => (
            <MomentPostCard
              key={post.id}
              post={post}
              comments={commentsByPost[post.id] || []}
              expanded={expandedPostIds.has(post.id)}
              onToggleExpand={() => toggleExpand(post.id)}
              onLike={() => handleLike(post.id)}
              onReply={handleReply}
            />
          ))
        )}
      </div>

      {/* ─── 底部巡视日志（可折叠）────────────── */}
      <Collapsible
        open={logsOpen}
        onOpenChange={setLogsOpen}
        className="shrink-0 border-t border-black/5 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-950/30"
      >
        <CollapsibleTrigger asChild>
          <button className="w-full px-4 py-2 flex items-center justify-between hover:bg-zinc-100/60 dark:hover:bg-zinc-900/40 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                巡视日志
              </span>
              {patrol && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                  {patrol.logs.length} 条
                </Badge>
              )}
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${
                logsOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="max-h-48 overflow-y-auto waos-scrollbar px-4 py-2 space-y-1.5">
            {!patrol || patrol.logs.length === 0 ? (
              <p className="text-[11px] text-zinc-400 py-2 text-center">
                暂无日志，点击「启动巡视」开始记录
              </p>
            ) : (
              patrol.logs.map((log, i) => (
                <motion.div
                  key={`${log.ts}-${i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-2 text-[11px]"
                >
                  <span className="text-zinc-400 font-mono text-[10px] shrink-0">
                    {formatLogTime(log.ts)}
                  </span>
                  {logIcon(log.level)}
                  <span
                    className={`flex-1 leading-relaxed ${
                      log.level === 'success'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : log.level === 'warn'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {log.msg}
                  </span>
                </motion.div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

// ============== 统计盒子 ==============

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="px-2.5 py-1.5 rounded-md bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/5">
      <div className={`text-[16px] font-bold font-mono leading-tight ${color}`}>{value}</div>
      <div className="text-[9px] text-zinc-500 dark:text-zinc-400">{label}</div>
    </div>
  )
}

// ============== 朋友圈卡片 ==============

function MomentPostCard({
  post,
  comments,
  expanded,
  onToggleExpand,
  onLike,
  onReply,
}: {
  post: MomentPost
  comments: MomentComment[]
  expanded: boolean
  onToggleExpand: () => void
  onLike: () => void
  onReply: (commentId: string, content: string) => void
}) {
  const highIntentCount = comments.filter((c) => c.intentScore >= 70).length
  const pendingCount = comments.filter((c) => c.replyStatus === 'pending').length

  return (
    <article className="px-4 py-3.5 border-b border-black/5 dark:border-white/5 hover:bg-zinc-50/40 dark:hover:bg-white/[0.02] transition-colors">
      <div className="flex gap-3">
        {/* 头像 */}
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-[15px] font-semibold text-white shrink-0 ${
            post.isOwn
              ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
              : 'bg-gradient-to-br from-orange-400 to-rose-500'
          }`}
        >
          {post.authorAvatar}
        </div>

        <div className="flex-1 min-w-0">
          {/* 作者 + 标签 */}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold text-[#576b95]">{post.authorName}</span>
            {post.isOwn ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">
                我
              </span>
            ) : (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 font-medium">
                好友
              </span>
            )}
          </div>

          {/* 内容 */}
          <p className="text-[13px] mt-1.5 leading-relaxed text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap break-words">
            {post.content}
          </p>

          {/* 图片 */}
          {post.images.length > 0 && (
            <div className={`mt-2 grid gap-1 ${post.images.length === 1 ? 'grid-cols-1 max-w-xs' : 'grid-cols-3 max-w-md'}`}>
              {post.images.map((img, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-md overflow-hidden bg-zinc-100 dark:bg-zinc-800"
                >
                  <img
                    src={img}
                    alt={`图片${i + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* 时间 */}
          <div className="text-[10px] text-zinc-400 mt-2">{formatTimeAgo(post.publishedAt)}</div>

          {/* 互动栏 */}
          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={onLike}
              className={`flex items-center gap-1 text-[11px] transition-colors ${
                post.isLiked
                  ? 'text-rose-500'
                  : 'text-zinc-500 hover:text-rose-500'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${post.isLiked ? 'fill-current' : ''}`} />
              {post.likeCount}
            </button>
            <button
              onClick={onToggleExpand}
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-[#576b95] transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {comments.length || post.commentCount}
              {highIntentCount > 0 && (
                <span className="ml-1 px-1 py-0 rounded bg-rose-500/10 text-rose-500 text-[9px] font-bold">
                  {highIntentCount}高意向
                </span>
              )}
              {pendingCount > 0 && (
                <span className="ml-0.5 px-1 py-0 rounded bg-amber-500/10 text-amber-600 text-[9px] font-bold">
                  {pendingCount}待回
                </span>
              )}
            </button>
          </div>

          {/* 评论列表（展开后） */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 200 }}
                className="overflow-hidden"
              >
                <div className="mt-2.5 pl-2 border-l-2 border-emerald-500/20 space-y-2">
                  {comments.length === 0 ? (
                    <p className="text-[11px] text-zinc-400 py-1">暂无评论</p>
                  ) : (
                    comments.map((c) => (
                      <CommentItem key={c.id} comment={c} onReply={onReply} />
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </article>
  )
}

// ============== 评论项 ==============

function CommentItem({
  comment,
  onReply,
}: {
  comment: MomentComment
  onReply: (commentId: string, content: string) => void
}) {
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [draft, setDraft] = useState('')
  const badge = intentBadge(comment.intentScore)

  const handleSubmit = () => {
    if (!draft.trim()) return
    onReply(comment.id, draft.trim())
    setDraft('')
    setShowReplyInput(false)
  }

  return (
    <div className="py-1.5">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-400 to-purple-500 flex items-center justify-center text-[10px] font-semibold text-white shrink-0">
          {comment.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium text-[#576b95]">{comment.userName}</span>
            <Badge
              variant="outline"
              className={`text-[9px] h-4 px-1.5 font-mono ${badge.className}`}
            >
              {badge.label}·{comment.intentScore}
            </Badge>
            {comment.replyStatus === 'replied' && (
              <span className="text-[9px] px-1 py-0 rounded bg-emerald-500/10 text-emerald-600 font-medium">
                已回复
              </span>
            )}
          </div>
          <p className="text-[12px] text-zinc-800 dark:text-zinc-200 mt-0.5 leading-relaxed">
            {comment.content}
          </p>
          {/* 意向分原因 */}
          <p className="text-[9px] text-zinc-400 mt-0.5">{comment.intentReason}</p>

          {/* AI 回复预览 */}
          {comment.aiReply && (
            <div className="mt-1 px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/40">
              <div className="text-[9px] text-emerald-600 font-semibold mb-0.5">
                🤖 我的回复
              </div>
              <div className="text-[11px] text-zinc-800 dark:text-zinc-200 leading-relaxed">
                {comment.aiReply}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 mt-1">
            {comment.replyStatus === 'pending' && (
              <button
                onClick={() => setShowReplyInput(!showReplyInput)}
                className="text-[10px] text-emerald-600 hover:underline"
              >
                {showReplyInput ? '取消' : '回复'}
              </button>
            )}
            {comment.replyStatus === 'replied' && (
              <button
                onClick={() => setShowReplyInput(!showReplyInput)}
                className="text-[10px] text-zinc-500 hover:underline"
              >
                {showReplyInput ? '收起' : '追加回复'}
              </button>
            )}
          </div>

          {/* 回复输入框 */}
          <AnimatePresence initial={false}>
            {showReplyInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex gap-1.5 mt-1.5">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="输入回复内容…"
                    className="h-7 text-[11px] flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!draft.trim()}
                    className="h-7 px-2 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    <Send className="w-3 h-3" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ============== 发朋友圈 Dialog ==============

function PostMomentDialog({
  onSubmit,
}: {
  onSubmit: (content: string, images: string[]) => void
}) {
  const [content, setContent] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [imageInput, setImageInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const addImage = () => {
    if (!imageInput.trim()) return
    if (images.length >= 9) {
      toast.warning('最多 9 张图片')
      return
    }
    setImages([...images, imageInput.trim()])
    setImageInput('')
  }

  const removeImage = (idx: number) => {
    setImages(images.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.warning('请输入朋友圈内容')
      return
    }
    setSubmitting(true)
    try {
      onSubmit(content.trim(), images)
      // 重置
      setContent('')
      setImages([])
      setImageInput('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-emerald-500" />
          发布朋友圈
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3 py-2">
        {/* 内容输入 */}
        <div>
          <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1 block">
            这一刻的想法…
          </label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="分享奔驰新车到店 / 客户提车喜悦 / 试驾活动…"
            className="min-h-[80px] text-[13px] resize-none"
            maxLength={500}
          />
          <div className="text-[10px] text-zinc-400 text-right mt-0.5">
            {content.length}/500
          </div>
        </div>

        {/* 图片 URL 输入 */}
        <div>
          <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1 block">
            图片 URL（最多 9 张）
          </label>
          <div className="flex gap-1.5">
            <Input
              value={imageInput}
              onChange={(e) => setImageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addImage()}
              placeholder="https://…"
              className="h-8 text-[11px] flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={addImage}
              disabled={images.length >= 9 || !imageInput.trim()}
              className="h-8 text-[11px]"
            >
              <Plus className="w-3 h-3" />
              添加
            </Button>
          </div>

          {/* 已添加图片预览 */}
          {images.length > 0 && (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {images.map((img, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-md overflow-hidden bg-zinc-100 dark:bg-zinc-800 group"
                >
                  <img
                    src={img}
                    alt={`图片${i + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.opacity = '0.3'
                    }}
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {images.length < 9 && (
                <div className="aspect-square rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400">
                  <ImageIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
          className="bg-emerald-500 hover:bg-emerald-600 text-white"
        >
          {submitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          发表
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
