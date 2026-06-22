'use client'

/**
 * 旺财 · 空状态组件集（Sprint 5-2）
 *
 * 为以下场景设计空状态（插画 + 引导文字 + CTA 按钮）：
 *  1. NoLeadsEmpty      — 没有客户
 *  2. NoMessagesEmpty   — 没有消息
 *  3. NoSopEmpty        — 没有 SOP 实例
 *  4. NoKnowledgeEmpty  — 知识库为空
 *  5. NoCommentsEmpty   — 暂无评论
 *
 * 实现要点：
 *  - 插画用 emoji 或简单 SVG（不依赖图片资源）
 *  - 引导文字用 text-muted-foreground
 *  - CTA 按钮用 primary 色
 *  - Framer Motion 淡入动画
 *  - 深色模式兼容
 *  - 所有 CTA 可选（无 CTA 时仅显示插画 + 文字）
 */

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── 通用容器 ────────────────────────────────────────────────
interface EmptyStateShellProps {
  /** 大插画（emoji 或 SVG） */
  illustration: ReactNode
  /** 主标题 */
  title: string
  /** 引导文字 */
  description?: string
  /** CTA 按钮文本（不传则不显示） */
  ctaLabel?: string
  /** CTA 点击回调 */
  onCta?: () => void
  /** 次要按钮文本 */
  secondaryLabel?: string
  /** 次要按钮回调 */
  onSecondary?: () => void
  /** 额外 className（用于覆盖容器尺寸/对齐） */
  className?: string
  /** 紧凑模式（更小的插画和间距） */
  compact?: boolean
}

function EmptyStateShell({
  illustration,
  title,
  description,
  ctaLabel,
  onCta,
  secondaryLabel,
  onSecondary,
  className,
  compact = false,
}: EmptyStateShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4' : 'py-16 px-8',
        className,
      )}
    >
      {/* 插画（带柔光背景） */}
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-emerald-400/10 blur-2xl pointer-events-none" />
        <div className={cn(
          'relative flex items-center justify-center',
          compact ? 'w-14 h-14 text-3xl' : 'w-20 h-20 text-5xl',
        )}>
          {illustration}
        </div>
      </div>

      <h3 className={cn(
        'font-semibold text-foreground mb-1',
        compact ? 'text-[13px]' : 'text-[15px]',
      )}>
        {title}
      </h3>

      {description && (
        <p className={cn(
          'text-muted-foreground max-w-[280px] leading-relaxed',
          compact ? 'text-[11px] mb-3' : 'text-xs mb-4',
        )}>
          {description}
        </p>
      )}

      {(ctaLabel || secondaryLabel) && (
        <div className="flex items-center gap-2 mt-1">
          {ctaLabel && onCta && (
            <Button
              size="sm"
              onClick={onCta}
              className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {ctaLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button
              size="sm"
              variant="outline"
              onClick={onSecondary}
              className="h-7 text-xs"
            >
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  )
}

// ─── 简单 SVG 插画（线条风格，深色模式自适应）────────────────
function SvgIllustration({ path, viewBox = '0 0 64 64' }: { path: string; viewBox?: string }) {
  return (
    <svg
      viewBox={viewBox}
      className="w-full h-full"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} className="text-emerald-500/60" />
    </svg>
  )
}

// ─── 1. NoLeadsEmpty：没有客户 ───────────────────────────────
export function NoLeadsEmpty({
  onGoChannels,
  compact = false,
  className,
}: {
  onGoChannels?: () => void
  compact?: boolean
  className?: string
}) {
  return (
    <EmptyStateShell
      illustration={<span aria-hidden>🐕</span>}
      title="还没有客户"
      description="旺财已就绪，去视频号 / 朋友圈评论区截流，把高意向客户带回旺财吧"
      ctaLabel={onGoChannels ? '去视频号' : undefined}
      onCta={onGoChannels}
      compact={compact}
      className={className}
    />
  )
}

// ─── 2. NoMessagesEmpty：没有消息 ────────────────────────────
export function NoMessagesEmpty({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <EmptyStateShell
      illustration={<span aria-hidden>💬</span>}
      title="等待客户第一句话"
      description="选择左侧客户后，旺财会自动接管对话并推荐回复话术"
      compact={compact}
      className={className}
    />
  )
}

// ─── 3. NoSopEmpty：没有 SOP 实例 ────────────────────────────
export function NoSopEmpty({
  onCreateSop,
  compact = false,
  className,
}: {
  onCreateSop?: () => void
  compact?: boolean
  className?: string
}) {
  return (
    <EmptyStateShell
      illustration={
        <span aria-hidden className="text-4xl">
          ⚡
        </span>
      }
      title="还没有运行过 SOP"
      description="SOP 引擎可按节点编排营销流程，自动跟进、激活沉睡客户、触发活动通知"
      ctaLabel={onCreateSop ? '创建 SOP' : undefined}
      onCta={onCreateSop}
      compact={compact}
      className={className}
    />
  )
}

// ─── 4. NoKnowledgeEmpty：知识库为空 ─────────────────────────
export function NoKnowledgeEmpty({
  onImportSeed,
  importing = false,
  compact = false,
  className,
}: {
  onImportSeed?: () => void
  importing?: boolean
  compact?: boolean
  className?: string
}) {
  return (
    <EmptyStateShell
      illustration={
        <span aria-hidden className="text-4xl">
          📚
        </span>
      }
      title="知识库为空"
      description="旺财 RAG 知识库为空，导入种子知识后即可基于车型/价格/FAQ 自动生成专业回复"
      ctaLabel={onImportSeed ? (importing ? '导入中…' : '导入种子知识') : undefined}
      onCta={onImportSeed}
      compact={compact}
      className={className}
    />
  )
}

// ─── 5. NoCommentsEmpty：没有评论 ────────────────────────────
export function NoCommentsEmpty({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <EmptyStateShell
      illustration={
        <span aria-hidden className="text-4xl">
          💭
        </span>
      }
      title="暂无评论"
      description="等视频号 / 朋友圈发布后，高意向评论会自动汇聚到这里"
      compact={compact}
      className={className}
    />
  )
}

// ─── 6. 通用空状态（让其他面板也可复用）──────────────────────
export function GenericEmpty({
  emoji = '📭',
  title,
  description,
  ctaLabel,
  onCta,
  compact = false,
  className,
}: {
  emoji?: string
  title: string
  description?: string
  ctaLabel?: string
  onCta?: () => void
  compact?: boolean
  className?: string
}) {
  return (
    <EmptyStateShell
      illustration={<span aria-hidden>{emoji}</span>}
      title={title}
      description={description}
      ctaLabel={ctaLabel}
      onCta={onCta}
      compact={compact}
      className={className}
    />
  )
}

export { SvgIllustration }
