'use client'

/**
 * WAOS Dashboard Fullscreen Mode
 *
 * A wall-display / TV-friendly dashboard view with:
 *  - Big KPI cards
 *  - Large charts (queue depth, CVR trend, latency)
 *  - Live event ticker
 *  - Top leads by priority
 *  - Exit button (Esc or click)
 *
 * Designed for ops teams to project on a TV in the office.
 */

import { useOpsStore } from '@/store/useOpsStore'
import {
  QueueDepthChart, LatencyLineChart, CVRAreaChart, FunnelBarChart,
} from './Charts'
import {
  Activity, Flame, TrendingUp, Cpu, AlertTriangle, Bot, Zap,
  Minimize2, Radio, Clock, Gauge, Users, Target,
} from 'lucide-react'
import { useEffect, useState } from 'react'

export function DashboardFullscreen() {
  const metrics = useOpsStore(s => s.metrics)
  const leads = useOpsStore(s => s.leads)
  const queues = useOpsStore(s => s.queues)
  const logs = useOpsStore(s => s.logs)
  const toggleDashboardFullscreen = useOpsStore(s => s.toggleDashboardFullscreen)
  const connection = useOpsStore(s => s.connection)

  const [clock, setClock] = useState('')
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Top 5 leads by priority
  const topLeads = [...leads]
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5)

  // Recent logs (last 8)
  const recentLogs = logs.slice(0, 8)

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col p-6 gap-4 overflow-hidden">
      {/* ─── Header ─── */}
      <header className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Radio className="w-6 h-6 text-white" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-pulse ring-2 ring-background" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl font-bold tracking-wide">WAOS</h1>
              <span className="text-sm font-mono text-emerald-400/80">v3.0 · 大屏模式</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">private-domain ops kernel · live dashboard</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connection === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-sm font-mono text-muted-foreground">{connection === 'connected' ? 'LIVE' : 'RECONNECTING'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-5 h-5" />
            <span className="text-2xl font-mono font-bold tabular-nums">{clock}</span>
          </div>
          <button
            onClick={toggleDashboardFullscreen}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-mono bg-accent hover:bg-accent/80 border border-border transition-colors"
            title="退出大屏 (D 或 Esc)"
          >
            <Minimize2 className="w-4 h-4" />
            <span>退出</span>
            <kbd className="text-[10px] px-1 py-px rounded bg-background border border-border">D</kbd>
          </button>
        </div>
      </header>

      {/* ─── KPI Cards Row ─── */}
      <div className="grid grid-cols-6 gap-3 shrink-0">
        <BigKpi
          icon={<Users className="w-5 h-5" />}
          label="活跃线索"
          value={metrics.activeLeads}
          color="text-emerald-400"
          bg="from-emerald-500/10 to-emerald-500/5"
        />
        <BigKpi
          icon={<Flame className="w-5 h-5" />}
          label="HOT 线索"
          value={metrics.hotCount}
          color="text-rose-400"
          bg="from-rose-500/10 to-rose-500/5"
        />
        <BigKpi
          icon={<TrendingUp className="w-5 h-5" />}
          label="已成交"
          value={metrics.converted}
          color="text-emerald-400"
          bg="from-emerald-500/10 to-emerald-500/5"
        />
        <BigKpi
          icon={<Cpu className="w-5 h-5" />}
          label="LLM 调用"
          value={metrics.llmCalls}
          color="text-purple-400"
          bg="from-purple-500/10 to-purple-500/5"
        />
        <BigKpi
          icon={<Bot className="w-5 h-5" />}
          label="人工接管"
          value={metrics.humanHandoffs}
          color="text-orange-400"
          bg="from-orange-500/10 to-orange-500/5"
        />
        <BigKpi
          icon={<Target className="w-5 h-5" />}
          label="CVR"
          value={`${metrics.cvr.toFixed(1)}%`}
          color="text-sky-400"
          bg="from-sky-500/10 to-sky-500/5"
        />
      </div>

      {/* ─── Charts Row ─── */}
      <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
        {/* Queue depth chart */}
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold tracking-wide">队列深度时间序列</h3>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500" />HOT</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" />WARM</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-500" />COLD</span>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <QueueDepthChart />
          </div>
        </div>

        {/* CVR trend */}
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold tracking-wide">CVR 转化率趋势</h3>
            </div>
            <span className="text-xs font-mono text-emerald-400">{metrics.cvr.toFixed(1)}%</span>
          </div>
          <div className="flex-1 min-h-0">
            <CVRAreaChart />
          </div>
        </div>

        {/* LLM latency */}
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold tracking-wide">LLM 调用延迟</h3>
            </div>
            <span className="text-xs font-mono text-purple-400">P99 &lt; 1.5s</span>
          </div>
          <div className="flex-1 min-h-0">
            <LatencyLineChart />
          </div>
        </div>
      </div>

      {/* ─── Bottom Row: Top leads + Event ticker ─── */}
      <div className="grid grid-cols-3 gap-3 shrink-0 h-[220px]">
        {/* Top leads */}
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <Flame className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-semibold tracking-wide">优先级 TOP 5</h3>
          </div>
          <ul className="flex-1 space-y-1.5 overflow-y-auto waos-scrollbar">
            {topLeads.map((lead, i) => (
              <li key={lead.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                  i === 0 ? 'bg-rose-500' : i === 1 ? 'bg-orange-500' : 'bg-zinc-600'
                }`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{lead.userName}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">{lead.lastMessage}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-bold font-mono ${
                    lead.priorityScore >= 80 ? 'text-rose-400' :
                    lead.priorityScore >= 50 ? 'text-amber-400' : 'text-zinc-400'
                  }`}>
                    P{lead.priorityScore.toFixed(0)}
                  </div>
                  <div className="text-[9px] text-muted-foreground font-mono uppercase">{lead.stage}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Queue summary */}
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <Activity className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold tracking-wide">调度队列</h3>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-2">
            <QueueCard name="HOT" count={queues.hot} color="rose" />
            <QueueCard name="WARM" count={queues.warm} color="amber" />
            <QueueCard name="COLD" count={queues.cold} color="sky" />
          </div>
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span>总队列深度</span>
            <span className="text-foreground font-semibold">{metrics.queueDepth}</span>
          </div>
        </div>

        {/* Event ticker */}
        <div className="bg-zinc-950 border border-border rounded-xl p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold tracking-wide text-zinc-300">实时事件流</h3>
            <span className="ml-auto text-[10px] font-mono text-zinc-500">{logs.length} lines</span>
          </div>
          <div className="flex-1 overflow-y-auto waos-scrollbar font-mono text-[10px] leading-relaxed">
            {recentLogs.map((line, i) => {
              const color =
                line.level === 'critical' ? 'text-red-400' :
                line.level === 'error' ? 'text-rose-400' :
                line.level === 'warn' ? 'text-amber-400' :
                line.level === 'system' ? 'text-emerald-400' :
                'text-zinc-400'
              const time = new Date(line.ts).toLocaleTimeString('zh-CN', { hour12: false })
              return (
                <div key={i} className="flex gap-2 py-0.5">
                  <span className="text-zinc-600 shrink-0">{time}</span>
                  <span className={`break-all ${color}`}>{line.msg}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function BigKpi({
  icon, label, value, color, bg,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  color: string
  bg: string
}) {
  return (
    <div className={`bg-gradient-to-br ${bg} bg-card border border-border rounded-xl p-4 flex flex-col`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={color}>{icon}</span>
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-3xl font-bold font-mono tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

function QueueCard({ name, count, color }: { name: string; count: number; color: 'rose' | 'amber' | 'sky' }) {
  const colorMap = {
    rose: { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
    amber: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    sky: { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
  }
  const c = colorMap[color]
  return (
    <div className={`rounded-lg ${c.bg} border ${c.border} flex flex-col items-center justify-center p-2`}>
      <div className={`text-2xl font-bold font-mono ${c.text}`}>{count}</div>
      <div className={`text-[10px] font-mono ${c.text} opacity-80`}>{name}</div>
    </div>
  )
}
