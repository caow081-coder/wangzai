'use client'

import { useOpsStore } from '@/store/useOpsStore'
import { Keyboard, Github, Activity } from 'lucide-react'

const KEY_HINTS: { k: string; desc: string }[] = [
  { k: '1-7', desc: '切换功能区' },
  { k: 'J/K', desc: '切换线索' },
  { k: 'R',   desc: 'AI 回复' },
  { k: 'E',   desc: '强制插队' },
  { k: 'H',   desc: '转人工' },
  { k: '␣',   desc: '标记完成' },
  { k: 'F',   desc: '焦点模式' },
  { k: 'N',   desc: '通知' },
  { k: 'B',   desc: '批量' },
  { k: 'D',   desc: '大屏' },
  { k: 'T',   desc: '主题' },
  { k: '/',   desc: '搜索' },
  { k: 'C',   desc: '生成线索' },
]

export function StickyFooter() {
  const focusMode = useOpsStore(s => s.focusMode)
  const connection = useOpsStore(s => s.connection)
  const metrics = useOpsStore(s => s.metrics)

  const focusColor = focusMode === 'FOLLOW' ? 'text-emerald-400' :
                     focusMode === 'PIN' ? 'text-sky-400' : 'text-zinc-500'

  return (
    <footer className="shrink-0 h-9 border-t border-[oklch(1_0_0/10%)] bg-[oklch(0.18_0_0)] flex items-center px-3 gap-3 text-[10px] font-mono">
      <div className="flex items-center gap-1.5 text-zinc-500">
        <Keyboard className="w-3 h-3" />
        <span className="hidden sm:inline">KEYS</span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto waos-scrollbar-x flex-1 min-w-0">
        {KEY_HINTS.map(h => (
          <div key={h.k} className="flex items-center gap-1 shrink-0">
            <kbd className="px-1 py-px rounded bg-black/40 border border-[oklch(1_0_0/12%)] text-zinc-300 text-[9px]">{h.k}</kbd>
            <span className="text-zinc-500">{h.desc}</span>
          </div>
        ))}
      </div>

      <div className="hidden md:flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-600">focus:</span>
          <span className={focusColor}>{focusMode}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-zinc-500" />
          <span className="text-zinc-500">events:</span>
          <span className="text-zinc-300 tabular-nums">{metrics.eventsProcessed}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${connection === 'connected' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
          <span className="text-zinc-400">{connection}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-zinc-600 shrink-0">
        <Github className="w-3 h-3" />
        <span>WAOS v3.0 · build {new Date().toISOString().slice(0, 10)}</span>
      </div>
    </footer>
  )
}
