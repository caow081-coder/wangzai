'use client'

import { useOpsStore } from '@/store/useOpsStore'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Search, Zap, MessageSquare, ArrowUpRight, Hand, CheckCircle2,
  Flame, CircleDot, Snowflake, Radio, Trash2, Bot,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

interface Command {
  id: string
  label: string
  hint: string
  icon: React.ReactNode
  action: () => void
  section: 'navigation' | 'action' | 'focus' | 'system'
}

export function CommandPalette() {
  const open = useOpsStore(s => s.commandPaletteOpen)
  const close = useOpsStore(s => s.closeCommandPalette)
  const leads = useOpsStore(s => s.leads)
  const selectLead = useOpsStore(s => s.selectLead)
  const setFocusMode = useOpsStore(s => s.setFocusMode)
  const spawnLead = useOpsStore(s => s.spawnLead)
  const clearLogs = useOpsStore(s => s.clearLogs)
  const openReplyStudio = useOpsStore(s => s.openReplyStudio)
  const sendClientAction = useOpsStore(s => s.sendClientAction)
  const selectedLeadId = useOpsStore(s => s.selectedLeadId)

  const [query, setQuery] = useState('')

  // Auto-clear query when palette closes — handled via onOpenChange instead of effect.
  const handleClose = () => {
    setQuery('')
    close()
  }

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      { id: 'spawn', label: 'Spawn a new lead', hint: 'C', icon: <Zap className="w-3.5 h-3.5 text-emerald-400" />, section: 'system',
        action: () => { spawnLead(); toast.success('Spawned new lead') } },
      { id: 'reply', label: 'Open AI Reply Studio', hint: 'R', icon: <MessageSquare className="w-3.5 h-3.5 text-sky-400" />, section: 'action',
        action: () => { if (selectedLeadId) openReplyStudio(selectedLeadId) } },
      { id: 'escalate', label: 'Force-escalate current lead to HOT', hint: 'E', icon: <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />, section: 'action',
        action: () => { if (selectedLeadId) { sendClientAction('force_priority', selectedLeadId); toast.success('Escalated') } } },
      { id: 'handoff', label: 'Hand off current lead to human', hint: 'H', icon: <Hand className="w-3.5 h-3.5 text-orange-400" />, section: 'action',
        action: () => { if (selectedLeadId) { sendClientAction('human_handoff', selectedLeadId); toast.warning('Handed off') } } },
      { id: 'done', label: 'Mark current lead as done', hint: '␣', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />, section: 'action',
        action: () => { if (selectedLeadId) { sendClientAction('mark_done', selectedLeadId); toast.success('Marked done') } } },
      { id: 'focus-follow', label: 'Focus mode: FOLLOW (hot auto-steals)', hint: '1', icon: <Flame className="w-3.5 h-3.5 text-emerald-400" />, section: 'focus',
        action: () => { setFocusMode('FOLLOW'); toast.info('FOLLOW mode') } },
      { id: 'focus-pin', label: 'Focus mode: PIN (lock current)', hint: '2', icon: <CircleDot className="w-3.5 h-3.5 text-sky-400" />, section: 'focus',
        action: () => { setFocusMode('PIN'); toast.info('PIN mode') } },
      { id: 'focus-dnd', label: 'Focus mode: DND (quiet)', hint: '3', icon: <Snowflake className="w-3.5 h-3.5 text-zinc-400" />, section: 'focus',
        action: () => { setFocusMode('DND'); toast.info('DND mode') } },
      { id: 'clear-logs', label: 'Clear event stream logs', hint: 'L', icon: <Trash2 className="w-3.5 h-3.5 text-amber-400" />, section: 'system',
        action: () => { clearLogs(); toast('Logs cleared') } },
    ]
    return list
  }, [selectedLeadId, spawnLead, openReplyStudio, sendClientAction, setFocusMode, clearLogs])

  const filteredLeads = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return leads.filter(l =>
      l.userName.toLowerCase().includes(q) ||
      l.lastMessage?.toLowerCase().includes(q) ||
      l.tags.some(t => t.toLowerCase().includes(q))
    ).slice(0, 6)
  }, [leads, query])

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(c => c.label.toLowerCase().includes(q))
  }, [commands, query])

  const run = (fn: () => void) => {
    fn()
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className="max-w-xl p-0 bg-[oklch(0.165_0_0)] border-[oklch(1_0_0/12%)] text-zinc-100 overflow-hidden"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">WAOS 命令面板</DialogTitle>
        <DialogDescription className="sr-only">
          搜索线索或执行指令。使用方向键浏览，回车执行，Esc 关闭。
        </DialogDescription>
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[oklch(1_0_0/8%)]">
          <Search className="w-4 h-4 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索线索或输入指令…"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-zinc-500">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto waos-scrollbar py-1">
          {/* Lead matches */}
          {filteredLeads.length > 0 && (
            <>
              <SectionHeader>线索 · Leads</SectionHeader>
              {filteredLeads.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => run(() => selectLead(lead.id))}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[oklch(1_0_0/6%)] text-left transition-colors"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ background: lead.personaColor || '#52525b' }}
                  >
                    {lead.userName.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-zinc-200 truncate">{lead.userName}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{lead.lastMessage}</div>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">P{lead.priorityScore.toFixed(0)}</span>
                </button>
              ))}
            </>
          )}

          {/* Commands */}
          <SectionHeader>指令 · Commands</SectionHeader>
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] text-zinc-600">no matching command</div>
          ) : (
            filteredCommands.map(c => (
              <button
                key={c.id}
                onClick={() => run(c.action)}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[oklch(1_0_0/6%)] text-left transition-colors group"
              >
                <span className="shrink-0">{c.icon}</span>
                <span className="flex-1 text-[12px] text-zinc-200">{c.label}</span>
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-zinc-500 group-hover:text-zinc-300">{c.hint}</kbd>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[oklch(1_0_0/8%)] flex items-center gap-3 text-[10px] font-mono text-zinc-500">
          <span className="flex items-center gap-1"><Bot className="w-3 h-3" /> WAOS Command Palette</span>
          <span className="text-zinc-600">·</span>
          <span>{filteredCommands.length + filteredLeads.length} results</span>
          <div className="flex-1" />
          <span className="flex items-center gap-1"><Radio className="w-3 h-3 text-emerald-400" /> live</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-2 pb-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500">
      {children}
    </div>
  )
}
