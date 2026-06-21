'use client'

/**
 * Lead Journey Timeline
 *
 * A vertical journey visualization showing the lead's path through stages:
 * view → comment → dm_engaged → qualified → hot → converted
 *
 * Each node shows:
 *  - Stage icon + label
 *  - Channel icon (where the touchpoint came from)
 *  - Timestamp
 *  - First-touch vs last-touch marker
 *  - Conversion value (if converted)
 *
 * Reaches the "long-term memory" concept from the audit — visualizes the
 * full user journey across channels and time.
 */

import { useOpsStore, useSelectedLead, type Stage, type Source } from '@/store/useOpsStore'
import {
  Eye, MessageSquare, Smartphone, Video, AtSign,
  Flame, CheckCircle2, Snowflake, UserPlus, Hand,
  Clock, MapPin, ArrowDown, Sparkles, TrendingUp,
} from 'lucide-react'
import { useMemo } from 'react'

interface JourneyNode {
  stage: string
  label: string
  icon: React.ReactNode
  color: string
  bg: string
  ts?: number
  source?: Source
  channelIcon?: React.ReactNode
  isCurrent?: boolean
  isConverted?: boolean
  isFirstTouch?: boolean
  value?: number
}

const STAGE_NODES: { stage: Stage | string; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { stage: 'view',         label: '曝光',     icon: <Eye className="w-3 h-3" />,           color: 'text-muted-foreground',   bg: 'bg-zinc-500/15 border-zinc-500/30' },
  { stage: 'comment',      label: '评论',     icon: <MessageSquare className="w-3 h-3" />, color: 'text-sky-400',    bg: 'bg-sky-500/15 border-sky-500/30' },
  { stage: 'dm_engaged',   label: '私信互动', icon: <Smartphone className="w-3 h-3" />,   color: 'text-cyan-400',   bg: 'bg-cyan-500/15 border-cyan-500/30' },
  { stage: 'new',          label: '新建线索', icon: <UserPlus className="w-3 h-3" />,     color: 'text-emerald-400',bg: 'bg-emerald-500/15 border-emerald-500/30' },
  { stage: 'engaged',      label: '已互动',   icon: <MessageSquare className="w-3 h-3" />, color: 'text-sky-400',    bg: 'bg-sky-500/15 border-sky-500/30' },
  { stage: 'qualified',    label: '已资质',   icon: <Sparkles className="w-3 h-3" />,      color: 'text-amber-400',  bg: 'bg-amber-500/15 border-amber-500/30' },
  { stage: 'hot',          label: '高意向',   icon: <Flame className="w-3 h-3" />,         color: 'text-rose-400',   bg: 'bg-rose-500/15 border-rose-500/30' },
  { stage: 'converted',    label: '已成交',   icon: <CheckCircle2 className="w-3 h-3" />,  color: 'text-emerald-400',bg: 'bg-emerald-500/15 border-emerald-500/30' },
  { stage: 'churned',      label: '已流失',   icon: <Snowflake className="w-3 h-3" />,     color: 'text-muted-foreground',   bg: 'bg-zinc-700/30 border-zinc-700/40' },
  { stage: 'blocked',      label: '人工接管', icon: <Hand className="w-3 h-3" />,          color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30' },
]

const SOURCE_CHANNEL_ICON: Record<Source, React.ReactNode> = {
  wechat_dm: <Smartphone className="w-2.5 h-2.5 text-emerald-400" />,
  comment:   <MessageSquare className="w-2.5 h-2.5 text-sky-400" />,
  video:     <Video className="w-2.5 h-2.5 text-purple-400" />,
  douyin:    <AtSign className="w-2.5 h-2.5 text-rose-400" />,
}

const SOURCE_LABEL: Record<Source, string> = {
  wechat_dm: '微信私域',
  comment: '评论互动',
  video: '视频号',
  douyin: '抖音',
}

export function LeadJourney() {
  const lead = useSelectedLead()
  const events = useOpsStore(s => s.events)
  const auditLog = useOpsStore(s => s.auditLog)
  const showJourney = useOpsStore(s => s.settings.showAuditTimeline)

  // Build journey nodes from lead + events + auditLog
  const nodes = useMemo(() => {
    if (!lead) return [] as JourneyNode[]
    const nodeMap = new Map<string, JourneyNode>()

    // From lead creation
    const createTs = new Date(lead.createdAt).getTime()
    const stageMeta = STAGE_NODES.find(n => n.stage === 'new')!
    nodeMap.set('new', {
      ...stageMeta,
      ts: createTs,
      source: lead.source,
      channelIcon: SOURCE_CHANNEL_ICON[lead.source],
      isFirstTouch: true,
    })

    // From messages — each message is a touchpoint
    ;(lead.messages || []).forEach(m => {
      const ts = new Date(m.createdAt).getTime()
      if (m.role === 'user') {
        // User message = engagement touchpoint
        const stage = lead.stage === 'hot' ? 'hot' : lead.stage === 'qualified' ? 'qualified' : 'engaged'
        const meta = STAGE_NODES.find(n => n.stage === stage) || STAGE_NODES.find(n => n.stage === 'engaged')!
        if (!nodeMap.has(stage)) {
          nodeMap.set(stage, {
            ...meta,
            ts,
            source: lead.source,
            channelIcon: SOURCE_CHANNEL_ICON[lead.source],
          })
        }
      } else if (m.role === 'assistant') {
        // AI reply = engagement
        const meta = STAGE_NODES.find(n => n.stage === 'engaged')!
        if (!nodeMap.has('engaged')) {
          nodeMap.set('engaged', {
            ...meta,
            ts,
            source: lead.source,
            channelIcon: SOURCE_CHANNEL_ICON[lead.source],
          })
        }
      }
    })

    // From events (real-time transitions)
    events
      .filter(e => e.payload?.leadId === lead.id && e.type === 'state.transition')
      .forEach(e => {
        const { to, from } = e.payload
        const meta = STAGE_NODES.find(n => n.stage === to)
        if (meta && !nodeMap.has(to)) {
          nodeMap.set(to, {
            ...meta,
            ts: e.ts,
            source: lead.source,
            channelIcon: SOURCE_CHANNEL_ICON[lead.source],
          })
        }
      })

    // From audit log
    auditLog
      .filter(a => a.leadId === lead.id && a.action?.startsWith('state.'))
      .forEach(a => {
        const meta = STAGE_NODES.find(n => n.stage === a.to)
        if (meta && !nodeMap.has(a.to!)) {
          nodeMap.set(a.to!, {
            ...meta,
            ts: a.ts,
            source: lead.source,
            channelIcon: SOURCE_CHANNEL_ICON[lead.source],
          })
        }
      })

    // Mark current stage
    const current = nodeMap.get(lead.stage)
    if (current) current.isCurrent = true

    // Mark converted
    if (lead.stage === 'converted') {
      const conv = nodeMap.get('converted')
      if (conv) {
        conv.isConverted = true
        conv.value = lead.valueScore
      }
    }

    // Sort by stage order (view → comment → dm_engaged → new → engaged → qualified → hot → converted)
    const order = ['view', 'comment', 'dm_engaged', 'new', 'engaged', 'qualified', 'hot', 'converted', 'churned', 'blocked']
    return Array.from(nodeMap.values()).sort((a, b) => {
      const ai = order.indexOf(a.stage)
      const bi = order.indexOf(b.stage)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
  }, [lead, events, auditLog])

  if (!showJourney) return null
  if (!lead || nodes.length === 0) return null

  // Calculate journey duration
  const firstTs = nodes[0]?.ts
  const lastTs = nodes[nodes.length - 1]?.ts
  const duration = firstTs && lastTs ? lastTs - firstTs : 0
  const durationStr = duration < 60_000
    ? `${Math.floor(duration / 1000)}秒`
    : duration < 3_600_000
      ? `${Math.floor(duration / 60_000)}分钟`
      : `${Math.floor(duration / 3_600_000)}小时${Math.floor((duration % 3_600_000) / 60_000)}分`

  return (
    <section className="px-5 py-4 border-b border-border/40">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-3.5 bg-gradient-to-b from-emerald-500 to-cyan-500 rounded-sm" />
        <h3 className="text-[11px] font-semibold tracking-wider text-foreground uppercase">Lead Journey · 用户旅程</h3>
        <span className="text-[9px] font-mono text-muted-foreground ml-auto">
          {nodes.length} 节点 · {durationStr}
        </span>
      </div>

      {/* Journey summary bar */}
      <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-md bg-muted/30 border border-border">
        <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
        <span className="text-[10px] font-mono text-muted-foreground">首次触点:</span>
        <span className="text-[10px] font-mono text-foreground">{SOURCE_LABEL[lead.source]}</span>
        <span className="text-[10px] text-muted-foreground">·</span>
        <span className="text-[10px] font-mono text-muted-foreground">路径:</span>
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto waos-scrollbar-x">
          {nodes.map((n, i) => (
            <div key={n.stage} className="flex items-center gap-1 shrink-0">
              <span className={`text-[9px] font-mono ${n.isCurrent ? 'text-emerald-400 font-bold' : 'text-muted-foreground'}`}>
                {n.label}
              </span>
              {i < nodes.length - 1 && <ArrowDown className="w-2 h-2 text-muted-foreground/40 rotate-[-90deg]" />}
            </div>
          ))}
        </div>
        {lead.stage === 'converted' && (
          <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 shrink-0">
            <TrendingUp className="w-2.5 h-2.5" />
            ¥{lead.valueScore.toFixed(0)}
          </span>
        )}
      </div>

      {/* Vertical journey timeline */}
      <ol className="relative space-y-1">
        {/* Vertical connecting line */}
        <div className="absolute left-[15px] top-3 bottom-3 w-px bg-gradient-to-b from-emerald-500/40 via-border to-border" />

        {nodes.map((node, i) => {
          const time = node.ts ? new Date(node.ts).toLocaleTimeString('zh-CN', { hour12: false }) : '--'
          const date = node.ts ? new Date(node.ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : ''
          const timeAgo = node.ts ? formatTimeAgo(node.ts) : ''

          return (
            <li key={`${node.stage}-${i}`} className="relative pl-9 py-1.5 group">
              {/* Node dot */}
              <div className={`absolute left-0 top-1.5 w-8 h-8 rounded-full border-2 flex items-center justify-center bg-card ${node.bg}
                ${node.isCurrent ? 'ring-2 ring-emerald-500/40 ring-offset-2 ring-offset-card' : ''}`}>

                <span className={node.color}>{node.icon}</span>
                {node.isCurrent && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-card" />
                )}
              </div>

              <div className="flex items-baseline gap-2">
                <span className={`text-[12px] font-semibold ${node.isCurrent ? 'text-emerald-400' : 'text-foreground'}`}>
                  {node.label}
                </span>
                {node.channelIcon && (
                  <span className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground">
                    {node.channelIcon}
                    {node.source && SOURCE_LABEL[node.source]}
                  </span>
                )}
                {node.isFirstTouch && (
                  <span className="text-[9px] font-mono px-1.5 py-px rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    首次触点
                  </span>
                )}
                {node.isCurrent && (
                  <span className="text-[9px] font-mono px-1.5 py-px rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    当前
                  </span>
                )}
                {node.isConverted && node.value !== undefined && (
                  <span className="text-[9px] font-mono px-1.5 py-px rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    ¥{node.value.toFixed(0)}
                  </span>
                )}
                <span className="ml-auto text-[9px] font-mono text-muted-foreground shrink-0">
                  {timeAgo}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mt-0.5 text-[9px] font-mono text-muted-foreground/70">
                <Clock className="w-2 h-2" />
                <span>{date} {time}</span>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return `${Math.floor(diff / 1000)}秒前`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  return `${Math.floor(diff / 86_400_000)}天前`
}
