'use client'

import { useOpsStore, type Lead, type Stage, type Source } from '@/store/useOpsStore'
import { useMemo, useState } from 'react'
import {
  MessageSquare, Video, AtSign, Smartphone, Search, Filter,
  Flame, CircleDot, CheckCircle2, Snowflake, Ban, AlertTriangle, Inbox, Clock,
} from 'lucide-react'

const STAGE_BADGE: Record<Stage, { label: string; cls: string; icon?: React.ReactNode }> = {
  new:       { label: 'NEW',       cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30', icon: <CircleDot className="w-2.5 h-2.5" /> },
  engaged:   { label: 'ENGAGED',   cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30', icon: <MessageSquare className="w-2.5 h-2.5" /> },
  qualified: { label: 'QUALIFIED', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: <Flame className="w-2.5 h-2.5" /> },
  hot:       { label: 'HOT',       cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40', icon: <Flame className="w-2.5 h-2.5" /> },
  converted: { label: 'CONVERTED', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: <CheckCircle2 className="w-2.5 h-2.5" /> },
  churned:   { label: 'CHURNED',   cls: 'bg-zinc-700/40 text-zinc-500 border-zinc-700/40', icon: <Snowflake className="w-2.5 h-2.5" /> },
  blocked:   { label: 'BLOCKED',   cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30', icon: <Ban className="w-2.5 h-2.5" /> },
  warm:      { label: 'WARM',      cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: <Flame className="w-2.5 h-2.5" /> },
  cold:      { label: 'COLD',      cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30', icon: <Clock className="w-2.5 h-2.5" /> },
}

const SOURCE_ICON: Record<Source, React.ReactNode> = {
  wechat_dm: <Smartphone className="w-3 h-3 text-emerald-400" />,
  comment:   <MessageSquare className="w-3 h-3 text-sky-400" />,
  video:     <Video className="w-3 h-3 text-purple-400" />,
  douyin:    <AtSign className="w-3 h-3 text-rose-400" />,
}

const SOURCE_LABEL: Record<Source, string> = {
  wechat_dm: '微信',
  comment: '评论',
  video: '视频号',
  douyin: '抖音',
}

type FilterType = 'all' | 'hot' | 'unread' | 'human'

export function LeftPanel({ embedded = false }: { embedded?: boolean }) {
  const leads = useOpsStore(s => s.leads)
  const selectedLeadId = useOpsStore(s => s.selectedLeadId)
  const cursor = useOpsStore(s => s.cursor)
  const selectLead = useOpsStore(s => s.selectLead)
  const batchMode = useOpsStore(s => s.batchMode)
  const batchSelected = useOpsStore(s => s.selectedLeadIds)
  const toggleLeadSelection = useOpsStore(s => s.toggleLeadSelection)
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = leads
    if (filter === 'hot') list = list.filter(l => l.stage === 'hot' || l.priorityScore >= 80)
    else if (filter === 'unread') list = list.filter(l => l.unread)
    else if (filter === 'human') list = list.filter(l => l.stage === 'blocked')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(l =>
        l.userName.toLowerCase().includes(q) ||
        l.lastMessage?.toLowerCase().includes(q) ||
        l.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [leads, filter, search])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className={`px-3 ${embedded ? 'pt-2' : 'pt-3'} pb-2 border-b border-[oklch(1_0_0/8%)]`}>
        {!embedded && (
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Inbox className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold tracking-wide">LEAD INBOX</span>
              <span className="text-[10px] font-mono text-zinc-500">({filtered.length})</span>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-2">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索用户 / 消息 / 标签…"
            className="w-full pl-7 pr-2 py-1.5 text-[11px] font-mono bg-[oklch(0.13_0_0)] border border-[oklch(1_0_0/8%)] rounded-md text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1">
          <Filter className="w-3 h-3 text-zinc-500" />
          {([
            { id: 'all', label: '全部', count: leads.length },
            { id: 'hot', label: 'HOT', count: leads.filter(l => l.stage === 'hot' || l.priorityScore >= 80).length },
            { id: 'unread', label: '未读', count: leads.filter(l => l.unread).length },
            { id: 'human', label: '人工', count: leads.filter(l => l.stage === 'blocked').length },
          ] as { id: FilterType; label: string; count: number }[]).map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors
                ${filter === f.id
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-[oklch(1_0_0/5%)]'}`}
            >
              {f.label}
              <span className="ml-1 opacity-60">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Lead list */}
      <div className="flex-1 min-h-0 overflow-y-auto waos-scrollbar">
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-border/40">
            {filtered.map((lead, index) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                isSelected={lead.id === selectedLeadId}
                isCursor={index === cursor}
                isBatchSelected={batchSelected.has(lead.id)}
                batchMode={batchMode}
                onClick={() => selectLead(lead.id)}
                onBatchToggle={() => toggleLeadSelection(lead.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function LeadRow({
  lead, isSelected, isCursor, isBatchSelected, batchMode, onClick, onBatchToggle,
}: {
  lead: Lead
  isSelected: boolean
  isCursor: boolean
  isBatchSelected: boolean
  batchMode: boolean
  onClick: () => void
  onBatchToggle: () => void
}) {
  const stage = STAGE_BADGE[lead.stage]
  const priority = lead.priorityScore
  const priorityColor = priority >= 80 ? 'text-rose-400'
    : priority >= 50 ? 'text-amber-400'
    : 'text-zinc-400'

  const handleClick = (e: React.MouseEvent) => {
    if (batchMode) {
      onBatchToggle()
    } else {
      onClick()
    }
  }

  return (
    <li
      onClick={handleClick}
      className={`relative cursor-pointer px-3 py-2.5 transition-colors group
        ${isBatchSelected
          ? 'bg-sky-500/10 border-l-2 border-sky-500'
          : isSelected
            ? 'bg-emerald-500/8 border-l-2 border-emerald-500'
            : isCursor
              ? 'bg-accent/40 border-l-2 border-sky-500/40'
              : 'border-l-2 border-transparent hover:bg-accent/40'}`}
    >
      <div className="flex items-start gap-2">
        {/* Avatar */}
        <div className="relative shrink-0 mt-0.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
            style={{ background: lead.personaColor || '#52525b' }}
          >
            {lead.userName.slice(0, 1)}
          </div>
          {lead.unread && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[oklch(0.165_0_0)]" />
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xs truncate ${lead.unread ? 'font-semibold text-white' : 'text-zinc-300'}`}>
              {lead.userName}
            </span>
            <span className="text-[10px] text-zinc-500 shrink-0">{SOURCE_LABEL[lead.source]}</span>
            <span className="ml-auto text-[10px] font-mono shrink-0">{SOURCE_ICON[lead.source]}</span>
          </div>

          <p className={`text-[11px] mt-0.5 truncate ${lead.unread ? 'text-zinc-200' : 'text-zinc-500'}`}>
            {lead.lastMessage || '(no message)'}
          </p>

          {/* Footer row: stage badge + priority + tags */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded text-[9px] font-mono font-semibold border ${stage.cls}`}>
              {stage.icon}
              {stage.label}
            </span>
            <span className={`text-[10px] font-mono font-bold tabular-nums ${priorityColor}`}>
              P{priority.toFixed(0)}
            </span>
            {lead.isSpam && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-red-400">
                <AlertTriangle className="w-2.5 h-2.5" />SPAM
              </span>
            )}
            {lead.stage === 'blocked' && (
              <span className="text-[9px] font-mono text-orange-400">人工接管中</span>
            )}
            {lead.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[9px] font-mono px-1 py-px rounded bg-[oklch(1_0_0/8%)] text-zinc-400">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Cursor indicator (right edge) */}
      {isCursor && !isSelected && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-mono text-sky-500/70">▶</div>
      )}
    </li>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-[oklch(1_0_0/5%)] flex items-center justify-center mb-3">
        <Inbox className="w-5 h-5 text-zinc-600" />
      </div>
      <p className="text-xs font-mono text-zinc-500 mb-1">no leads match filter</p>
      <p className="text-[10px] text-zinc-600">press <kbd className="px-1 py-px rounded bg-black/40 border border-white/10 text-zinc-400">C</kbd> to spawn a new lead</p>
    </div>
  )
}
