'use client'

import { useOpsStore, type LogLine } from '@/store/useOpsStore'
import { useEffect, useRef, useState } from 'react'
import { Terminal, Trash2, Pause, Play, ChevronDown } from 'lucide-react'

const LEVEL_STYLE: Record<LogLine['level'], { color: string; tag: string }> = {
  info:     { color: 'text-foreground',  tag: 'INFO' },
  warn:     { color: 'text-amber-400', tag: 'WARN' },
  error:    { color: 'text-rose-400',  tag: 'ERR ' },
  critical: { color: 'text-red-500',   tag: 'CRIT' },
  system:   { color: 'text-emerald-400', tag: 'SYS ' },
}

export function EventStream() {
  const logs = useOpsStore(s => s.logs)
  const clearLogs = useOpsStore(s => s.clearLogs)
  const [paused, setPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'system'>('all')
  const containerRef = useRef<HTMLDivElement>(null)
  // Snapshot = logs when not paused, otherwise frozen at pause time.
  // We use a ref + state pattern to avoid setState-in-effect lint.
  const [pausedSnapshot, setPausedSnapshot] = useState<LogLine[] | null>(null)
  const snapshot = paused ? (pausedSnapshot ?? logs) : logs

  // When user pauses, freeze current logs into pausedSnapshot.
  // When user unpauses, clear the freeze.
  const handlePauseToggle = () => {
    if (!paused) setPausedSnapshot(logs)
    else setPausedSnapshot(null)
    setPaused(p => !p)
  }

  // Auto scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0
    }
  }, [snapshot, autoScroll])

  const filtered = filter === 'all'
    ? snapshot
    : snapshot.filter(l => {
        if (filter === 'error') return l.level === 'error' || l.level === 'critical'
        if (filter === 'warn') return l.level === 'warn'
        if (filter === 'system') return l.level === 'system'
        return true
      })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 h-8 px-3 flex items-center gap-2 border-b border-border/60 bg-secondary/50">
        <Terminal className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">event stream</span>
        <span className="text-[10px] font-mono text-muted-foreground/70">/ waos:stream</span>

        <div className="ml-auto flex items-center gap-1">
          {/* Filter chips */}
          {(['all', 'system', 'warn', 'error'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors uppercase
                ${filter === f ? 'bg-emerald-500/15 text-emerald-300' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f}
            </button>
          ))}
          <div className="w-px h-3 bg-border mx-1" />
          <button
            onClick={() => setAutoScroll(s => !s)}
            className={`p-1 rounded hover:bg-secondary ${autoScroll ? 'text-emerald-400' : 'text-muted-foreground'}`}
            title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
          >
            {autoScroll ? <ChevronDown className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
          <button
            onClick={handlePauseToggle}
            className={`p-1 rounded hover:bg-secondary ${paused ? 'text-amber-400' : 'text-muted-foreground'}`}
            title={paused ? 'Paused' : 'Live'}
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
          <button
            onClick={clearLogs}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-rose-400"
            title="Clear logs (L)"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <span className="text-[9px] font-mono text-muted-foreground/70 ml-1">
            {filtered.length} lines
            {paused && <span className="text-amber-400 ml-1">· paused</span>}
          </span>
        </div>
      </div>

      {/* Stream body */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto waos-scrollbar font-mono text-[11px] leading-[1.5] px-3 py-2 bg-zinc-950 text-zinc-300"
      >
        {filtered.length === 0 ? (
          <div className="text-muted-foreground/70 italic">stream is empty…</div>
        ) : (
          filtered.map((line, i) => {
            const style = LEVEL_STYLE[line.level] || LEVEL_STYLE.info
            const time = new Date(line.ts).toLocaleTimeString('zh-CN', { hour12: false })
            return (
              <div
                key={`${line.ts}-${i}`}
                className={`flex gap-2 py-0.5 hover:bg-muted/50 px-1 -mx-1 rounded ${line.level === 'critical' ? 'bg-rose-500/5' : ''}`}
              >
                <span className="text-muted-foreground/70 shrink-0 tabular-nums">{time}</span>
                <span className={`shrink-0 font-semibold ${style.color}`}>[{style.tag}]</span>
                <span className={`flex-1 break-all ${style.color} opacity-90`}>{line.msg}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
