'use client'

import { useOpsStore, useAuditForLead, type AuditEntry } from '@/store/useOpsStore'
import {
  UserPlus, ArrowRightCircle, Bot, Shield, Hand, CheckCircle2,
  ArrowUpRight, Send, Sparkles, Clock,
} from 'lucide-react'

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string; actorLabel: string }> = {
  'lead.created':     { label: '线索创建',     icon: <UserPlus className="w-3 h-3" />,        color: 'text-emerald-400',  actorLabel: '系统' },
  'state.engage':     { label: '启动互动',     icon: <ArrowRightCircle className="w-3 h-3" />, color: 'text-sky-400',       actorLabel: '系统' },
  'state.qualify':    { label: '资质认证',     icon: <ArrowRightCircle className="w-3 h-3" />, color: 'text-amber-400',     actorLabel: '系统' },
  'state.heat':       { label: '升级 HOT',     icon: <ArrowRightCircle className="w-3 h-3" />, color: 'text-rose-400',      actorLabel: '系统' },
  'state.convert':    { label: '成交转化',     icon: <CheckCircle2 className="w-3 h-3" />,     color: 'text-emerald-400',   actorLabel: '系统' },
  'state.churn':      { label: '用户流失',     icon: <ArrowRightCircle className="w-3 h-3" />, color: 'text-muted-foreground',      actorLabel: '系统' },
  'state.cool':       { label: '冷却降级',     icon: <ArrowRightCircle className="w-3 h-3" />, color: 'text-muted-foreground',      actorLabel: '系统' },
  'state.block':      { label: '进入阻塞',     icon: <ArrowRightCircle className="w-3 h-3" />, color: 'text-orange-400',    actorLabel: '系统' },
  'state.unblock':    { label: '解除阻塞',     icon: <ArrowRightCircle className="w-3 h-3" />, color: 'text-sky-400',       actorLabel: '系统' },
  'llm.call':         { label: 'AI 回复',      icon: <Bot className="w-3 h-3" />,              color: 'text-purple-400',    actorLabel: 'AI' },
  'safety.block':     { label: '安全拦截',     icon: <Shield className="w-3 h-3" />,           color: 'text-amber-400',     actorLabel: '护盾' },
  'human.handoff':    { label: '转人工接管',   icon: <Hand className="w-3 h-3" />,             color: 'text-orange-400',    actorLabel: '系统' },
  'force_priority':   { label: '强制插队',     icon: <ArrowUpRight className="w-3 h-3" />,     color: 'text-rose-400',      actorLabel: '运营' },
  'human_handoff':    { label: '运营转人工',   icon: <Hand className="w-3 h-3" />,             color: 'text-orange-400',    actorLabel: '运营' },
  'mark_done':        { label: '标记完成',     icon: <CheckCircle2 className="w-3 h-3" />,     color: 'text-emerald-400',   actorLabel: '运营' },
  'manual_reply':     { label: '手动回复',     icon: <Send className="w-3 h-3" />,             color: 'text-sky-400',       actorLabel: '运营' },
}

export function AuditTimeline() {
  const selectedLeadId = useOpsStore(s => s.selectedLeadId)
  const merged = useAuditForLead(selectedLeadId)
  const showAudit = useOpsStore(s => s.settings.showAuditTimeline)

  if (!showAudit) return null

  return (
    <section className="px-5 py-4 border-b border-border/40">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-3.5 bg-orange-500 rounded-sm" />
        <h3 className="text-[11px] font-semibold tracking-wider text-foreground uppercase">Audit Trail · 操作留痕</h3>
        <span className="text-[9px] font-mono text-muted-foreground/70 ml-auto">{merged.length} entries · 事件溯源</span>
      </div>

      {merged.length === 0 ? (
        <div className="text-[11px] text-muted-foreground/70 italic py-3 text-center">暂无审计记录</div>
      ) : (
        <ol className="relative space-y-2.5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-secondary">
          {merged.map(entry => (
            <AuditEntryRow key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  )
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const meta = ACTION_META[entry.action] || {
    label: entry.action,
    icon: <Sparkles className="w-3 h-3" />,
    color: 'text-muted-foreground',
    actorLabel: entry.actor,
  }
  const time = new Date(entry.ts).toLocaleTimeString('zh-CN', { hour12: false })
  const actorColor =
    entry.actor === 'operator' ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' :
    entry.actor === 'ai' ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' :
    entry.actor === 'system' ? 'bg-zinc-500/15 text-muted-foreground border-zinc-500/30' :
    'bg-amber-500/15 text-amber-300 border-amber-500/30'

  return (
    <li className="relative pl-7">
      {/* Timeline dot */}
      <div className={`absolute left-0 top-1 w-6 h-6 rounded-full bg-secondary/50 border border-border/60 flex items-center justify-center ${meta.color}`}>
        {meta.icon}
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`text-[11px] font-semibold ${meta.color}`}>{meta.label}</span>
        {entry.from && entry.to && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {entry.from} → <span className={meta.color}>{entry.to}</span>
          </span>
        )}
        <span className={`text-[9px] font-mono px-1.5 py-px rounded border ${actorColor} ml-auto`}>
          {meta.actorLabel}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-0.5 text-[9px] font-mono text-muted-foreground/70">
        <Clock className="w-2.5 h-2.5" />
        <span>{time}</span>
        {entry.traceId && (
          <>
            <span>·</span>
            <span className="truncate">trace={entry.traceId.slice(0, 14)}</span>
          </>
        )}
        {entry.reason && (
          <>
            <span>·</span>
            <span className="truncate text-muted-foreground">{entry.reason}</span>
          </>
        )}
      </div>
    </li>
  )
}
