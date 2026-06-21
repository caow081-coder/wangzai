'use client'

/**
 * 旺财 · SOP 引擎 — Skill 工具箱
 *
 * 功能：
 *  - 从 /api/waos/sop?view=skills 拉取 9 个 Skill
 *  - 按 category 分组（recognition/evaluation/generation/execution/notification）
 *  - 每个 Skill 卡片显示：图标 + 名称 + 描述
 *  - 支持拖拽到画布（HTML5 native drag）+ 点击直接添加
 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Brain, Target, GitBranch, Send, Bell, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SkillDefinition, SkillCategory } from '@/lib/sop/types'

// 分类元数据（图标 + 颜色 + 中文标签）
const CATEGORY_META: Record<SkillCategory, { label: string; icon: LucideIcon; color: string; bg: string }> = {
  recognition: { label: '识别', icon: Brain, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  evaluation: { label: '评估', icon: Target, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  generation: { label: '生成', icon: GitBranch, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  execution: { label: '执行', icon: Send, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  notification: { label: '通知', icon: Bell, color: 'text-rose-500', bg: 'bg-rose-500/10' },
}

export interface SopNodePaletteProps {
  /** 拖拽到画布释放 / 点击时回调（参数：skill 定义） */
  onAddSkill?: (skill: SkillDefinition) => void
  /** 紧凑模式（true: 仅图标列；false: 完整卡片） */
  compact?: boolean
}

export function SopNodePalette({ onAddSkill, compact = false }: SopNodePaletteProps) {
  const [grouped, setGrouped] = useState<Record<string, SkillDefinition[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/waos/sop?view=skills')
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        if (d.error) { setError(d.error); setLoading(false); return }
        setGrouped(d.grouped || {})
        setLoading(false)
      })
      .catch(e => {
        if (!alive) return
        setError(e instanceof Error ? e.message : '加载失败')
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载技能...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3 text-xs text-rose-500">
        加载失败：{error}
        <button
          onClick={() => location.reload()}
          className="ml-2 underline hover:text-rose-600"
        >重试</button>
      </div>
    )
  }

  const categories = Object.keys(grouped) as SkillCategory[]

  return (
    <div className="h-full flex flex-col bg-muted/30 border-r border-border">
      {/* 标题 */}
      <div className="px-3 py-2 border-b border-border bg-background">
        <div className="text-xs font-semibold flex items-center gap-1.5">
          <span className="text-[13px]">🧩</span> Skill 工具箱
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          拖拽到画布添加节点 · 共 {Object.values(grouped).reduce((n, arr) => n + arr.length, 0)} 个
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {categories.map(cat => {
            const meta = CATEGORY_META[cat] || CATEGORY_META.recognition
            const Icon = meta.icon
            const skills = grouped[cat] || []
            return (
              <div key={cat}>
                <div className="flex items-center gap-1.5 px-1 mb-1.5">
                  <Icon className={`w-3 h-3 ${meta.color}`} />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {meta.label} · {skills.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {skills.map(s => (
                    <SkillCard key={s.id} skill={s} compact={compact} onAdd={onAddSkill} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── 单个 Skill 卡片 ────────────────────────────────────────────
function SkillCard({ skill, compact, onAdd }: {
  skill: SkillDefinition
  compact: boolean
  onAdd?: (s: SkillDefinition) => void
}) {
  const meta = CATEGORY_META[skill.category] || CATEGORY_META.recognition
  const Icon = meta.icon

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      draggable
      onDragStart={(e) => {
        // HTML5 拖拽：将 skill 数据写入 dataTransfer，画布 onDrop 时读取
        e.dataTransfer.setData('application/x-sop-skill', JSON.stringify(skill))
        e.dataTransfer.setData('text/plain', skill.id)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => onAdd?.(skill)}
      className="cursor-grab active:cursor-grabbing"
      title={`点击或拖拽添加「${skill.name}」节点`}
    >
      <Card className={`p-2 hover:shadow-md transition-shadow border-border/60 bg-background ${compact ? 'flex items-center gap-1.5' : ''}`}>
        <div className="flex items-start gap-1.5">
          <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${meta.bg}`}>
            <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium truncate">{skill.name}</div>
            {!compact && (
              <div className="text-[9px] text-muted-foreground line-clamp-2 mt-0.5 leading-tight">
                {skill.description}
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
