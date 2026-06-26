'use client'

import { useOpsStore } from '@/store/useOpsStore'
import {
  Flame, CircleDot, Snowflake, TrendingUp, Activity, Cpu,
  Zap, AlertTriangle, Bot, GitBranch, Filter, BarChart3, LineChart as LineChartIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  QueueDepthChart, FunnelBarChart, LatencyLineChart, CVRAreaChart, ABBarChart,
} from './Charts'

type Tab = 'scheduler' | 'metrics' | 'funnel' | 'ab'

export function RightPanel() {
  const [tab, setTab] = useState<Tab>('scheduler')
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab header */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-border/60">
        <div className="flex items-center gap-1">
          {([
            { id: 'scheduler', label: '调度器', icon: <Flame className="w-3 h-3" /> },
            { id: 'metrics',   label: '指标',   icon: <Activity className="w-3 h-3" /> },
            { id: 'funnel',    label: '漏斗',   icon: <Filter className="w-3 h-3" /> },
            { id: 'ab',        label: 'A/B',   icon: <GitBranch className="w-3 h-3" /> },
          ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors
                ${tab === t.id
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab body */}
      <div className="flex-1 min-h-0 overflow-y-auto waos-scrollbar">
        {tab === 'scheduler' && <SchedulerView />}
        {tab === 'metrics' && <MetricsView />}
        {tab === 'funnel' && <FunnelView />}
        {tab === 'ab' && <AbView />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Scheduler view — HOT/WARM/COLD multi-level queue
// ─────────────────────────────────────────────────────────────
export function SchedulerView() {
  const queues = useOpsStore(s => s.queues)
  const leads = useOpsStore(s => s.leads)
  const metrics = useOpsStore(s => s.metrics)
  const selectLead = useOpsStore(s => s.selectLead)

  const queueCards = [
    {
      name: 'HOT', icon: <Flame className="w-3 h-3" />, color: 'rose',
      count: queues.hot, items: queues.hotItems, threshold: 'P ≥ 80',
      desc: '抢占式调度 · 优先消费',
    },
    {
      name: 'WARM', icon: <CircleDot className="w-3 h-3" />, color: 'amber',
      count: queues.warm, items: queues.warmItems, threshold: '50 ≤ P < 80',
      desc: '正常调度 · 容量允许时消费',
    },
    {
      name: 'COLD', icon: <Snowflake className="w-3 h-3" />, color: 'sky',
      count: queues.cold, items: queues.coldItems, threshold: 'P < 50',
      desc: '老化补偿 · 每 tick +2 分',
    },
  ] as const

  return (
    <div className="p-3 space-y-3">
      {/* Worker pool status */}
      <div className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">Worker Pool</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400">3 alive</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {['worker-1', 'worker-2', 'worker-3'].map((w, i) => (
            <div key={w} className="px-2 py-1 rounded bg-muted/50 border border-border/40">
              <div className="text-[9px] font-mono text-muted-foreground">{w}</div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-mono text-emerald-400">{12 + i * 7}/{20 + i * 5}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Queue cards */}
      {queueCards.map(q => {
        const colorMap: Record<string, string> = {
          rose: 'border-rose-500/30 bg-rose-500/5',
          amber: 'border-amber-500/30 bg-amber-500/5',
          sky: 'border-sky-500/30 bg-sky-500/5',
        }
        const textMap: Record<string, string> = {
          rose: 'text-rose-400',
          amber: 'text-amber-400',
          sky: 'text-sky-400',
        }
        return (
          <div key={q.name} className={`rounded-lg border ${colorMap[q.color]}`}>
            <div className="px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={textMap[q.color]}>{q.icon}</span>
                <span className={`text-[11px] font-mono font-bold ${textMap[q.color]}`}>{q.name}</span>
                <span className="text-[9px] font-mono text-muted-foreground">{q.threshold}</span>
              </div>
              <span className={`text-lg font-bold font-mono tabular-nums ${textMap[q.color]}`}>{q.count}</span>
            </div>
            <div className="px-3 pb-1 text-[9px] font-mono text-muted-foreground">{q.desc}</div>

            {/* Items */}
            <div className="px-2 pb-2 max-h-32 overflow-y-auto waos-scrollbar">
              {q.items.length === 0 ? (
                <div className="text-[10px] font-mono text-muted-foreground/70 text-center py-2">queue empty</div>
              ) : (
                <ul className="space-y-0.5">
                  {q.items.map((item, i) => {
                    const lead = leads.find(l => l.id === item.leadId)
                    return (
                      <li
                        key={item.leadId + i}
                        onClick={() => lead && selectLead(lead.id)}
                        className="flex items-center gap-2 px-2 py-1 rounded text-[10px] font-mono hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <span className="text-muted-foreground/70">{String(i + 1).padStart(2, '0')}</span>
                        <span className="text-foreground truncate flex-1">{lead?.userName || item.leadId.slice(0, 10)}</span>
                        <span className={`${textMap[q.color]} font-semibold tabular-nums`}>
                          {item.priority.toFixed(1)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )
      })}

      {/* Scheduler policies */}
      <div className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">调度策略</span>
        </div>
        <ul className="space-y-1 text-[10px] font-mono text-muted-foreground">
          <PolicyRow label="老化补偿" value="cold +2/tick" />
          <PolicyRow label="冷却时间" value="30 min/lead" />
          <PolicyRow label="业务时间窗" value="09:00 – 22:00" />
          <PolicyRow label="抢占机制" value="HOT → kick COLD" />
          <PolicyRow label="容量上限" value="20/worker" />
          <PolicyRow label="反压" value="满载降级转人工" />
        </ul>
      </div>

      {/* Live throughput — real chart */}
      <div className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">队列深度时间序列</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400">{metrics.eventsProcessed} processed</span>
        </div>
        <QueueDepthChart />
        <div className="flex items-center gap-3 mt-1 text-[9px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500" />HOT</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" />WARM</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-500" />COLD</span>
          <span className="ml-auto">最近 5 分钟</span>
        </div>
      </div>
    </div>
  )
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────
// Metrics view
// ─────────────────────────────────────────────────────────────
export function MetricsView() {
  const m = useOpsStore(s => s.metrics)
  const cards = [
    { label: '活跃线索', value: m.activeLeads, tone: 'default', icon: <Activity className="w-3 h-3" /> },
    { label: 'HOT 数', value: m.hotCount, tone: 'hot', icon: <Flame className="w-3 h-3" /> },
    { label: '已成交', value: m.converted, tone: 'good', icon: <TrendingUp className="w-3 h-3" /> },
    { label: '已流失', value: m.churned, tone: 'muted', icon: <Snowflake className="w-3 h-3" /> },
    { label: 'LLM 调用', value: m.llmCalls, tone: 'default', icon: <Cpu className="w-3 h-3" /> },
    { label: '安全拦截', value: m.safetyBlocks, tone: 'warn', icon: <AlertTriangle className="w-3 h-3" /> },
    { label: '人工接管', value: m.humanHandoffs, tone: 'warn', icon: <Bot className="w-3 h-3" /> },
    { label: '事件已处理', value: m.eventsProcessed, tone: 'good', icon: <Zap className="w-3 h-3" /> },
  ]
  const toneClass: Record<string, string> = {
    default: 'text-foreground',
    hot: 'text-rose-400',
    good: 'text-emerald-400',
    muted: 'text-muted-foreground',
    warn: 'text-amber-400',
  }

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {cards.map(c => (
          <div key={c.label} className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
            <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground uppercase mb-1">
              <span className="opacity-70">{c.icon}</span>
              {c.label}
            </div>
            <div className={`text-xl font-bold font-mono tabular-nums ${toneClass[c.tone]}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Rates */}
      <div className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60 space-y-2">
        <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground mb-1">关键比率</div>
        <RateBar label="LLM 熔断率" value={m.fallbackRate} max={100} unit="%" warnAt={10} criticalAt={20} />
        <RateBar label="安全拦截率" value={m.safetyRate} max={100} unit="%" warnAt={5} criticalAt={10} />
        <RateBar label="转化率 (CVR)" value={m.cvr} max={100} unit="%" goodAt={20} />
        <RateBar label="队列健康度" value={Math.max(0, 100 - m.queueDepth)} max={100} unit="%" goodAt={80} />
      </div>

      {/* SLO targets */}
      <div className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 className="w-3 h-3 text-sky-400" />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">SLO 目标</span>
        </div>
        <ul className="space-y-1 text-[10px] font-mono">
          <li className="flex justify-between"><span className="text-muted-foreground">事件处理 P99</span><span className="text-emerald-400">&lt; 5s ✓</span></li>
          <li className="flex justify-between"><span className="text-muted-foreground">AI 回复成功率</span><span className="text-emerald-400">{(100 - m.fallbackRate).toFixed(1)}% / 99%</span></li>
          <li className="flex justify-between"><span className="text-muted-foreground">系统可用性</span><span className="text-emerald-400">99.94%</span></li>
          <li className="flex justify-between"><span className="text-muted-foreground">消息送达率</span><span className="text-emerald-400">99.7%</span></li>
        </ul>
      </div>

      {/* LLM latency chart */}
      <div className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <LineChartIcon className="w-3 h-3 text-purple-400" />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">LLM 调用延迟</span>
          </div>
          <span className="text-[10px] font-mono text-purple-400">P99 &lt; 1.5s</span>
        </div>
        <LatencyLineChart />
      </div>

      {/* CVR trend chart */}
      <div className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">CVR 趋势</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400">{m.cvr.toFixed(1)}%</span>
        </div>
        <CVRAreaChart />
      </div>
    </div>
  )
}

function RateBar({
  label, value, max, unit, warnAt, criticalAt, goodAt,
}: {
  label: string
  value: number
  max: number
  unit: string
  warnAt?: number
  criticalAt?: number
  goodAt?: number
}) {
  const pct = Math.min(100, (value / max) * 100)
  let color = 'bg-emerald-500'
  let text = 'text-emerald-400'
  if (criticalAt !== undefined && value >= criticalAt) { color = 'bg-red-500'; text = 'text-red-400' }
  else if (warnAt !== undefined && value >= warnAt) { color = 'bg-amber-500'; text = 'text-amber-400' }
  else if (goodAt !== undefined && value >= goodAt) { color = 'bg-emerald-500'; text = 'text-emerald-400' }
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-mono mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className={`tabular-nums ${text}`}>{value.toFixed(1)}{unit}</span>
      </div>
      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Funnel view
// ─────────────────────────────────────────────────────────────
export function FunnelView() {
  const m = useOpsStore(s => s.metrics)
  // Build funnel from metrics — view → comment → dm → qualified → converted
  const total = m.totalLeads || 1
  const stages = [
    { name: '曝光 view', count: Math.floor(total * 4.2), color: '#71717a' },
    { name: '评论 comment', count: Math.floor(total * 2.1), color: '#06b6d4' },
    { name: '私信 dm_engaged', count: Math.floor(total * 1.3), color: '#0ea5e9' },
    { name: '资质 qualified', count: Math.floor(total * 0.8), color: '#f59e0b' },
    { name: '高意向 hot', count: m.hotCount, color: '#f43f5e' },
    { name: '成交 converted', count: m.converted, color: '#10b981' },
  ]
  const max = stages[0].count || 1

  return (
    <div className="p-3 space-y-3">
      {/* Funnel bar chart */}
      <div className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
        <div className="flex items-center gap-1.5 mb-3">
          <Filter className="w-3 h-3 text-purple-400" />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">转化漏斗 · 30d</span>
          <span className="text-[9px] font-mono text-muted-foreground/70 ml-auto">recharts</span>
        </div>
        <FunnelBarChart data={stages} />
      </div>

      {/* Stage-by-stage breakdown */}
      <div className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
        <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground mb-2">阶段明细</div>
        <div className="space-y-1.5">
          {stages.map((s, i) => {
            const pct = (s.count / max) * 100
            const conv = i > 0 ? (s.count / stages[i - 1].count) * 100 : 100
            return (
              <div key={s.name}>
                <div className="flex items-center justify-between text-[10px] font-mono mb-0.5">
                  <span className="text-muted-foreground">{s.name}</span>
                  <span className="text-foreground">
                    {s.count.toLocaleString()}
                    {i > 0 && <span className="ml-2 text-muted-foreground/70">({conv.toFixed(1)}%)</span>}
                  </span>
                </div>
                <div className="h-4 bg-muted/50 rounded-sm overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 flex items-center px-2"
                    style={{ width: `${Math.max(4, pct)}%`, background: `${s.color}40`, borderLeft: `2px solid ${s.color}` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 pt-2 border-t border-border/60 flex items-center justify-between text-[10px] font-mono">
          <span className="text-muted-foreground">整体转化率</span>
          <span className="text-emerald-400 font-semibold">
            {((m.converted / stages[0].count) * 100).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Attribution */}
      <div className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
        <div className="flex items-center gap-1.5 mb-2">
          <GitBranch className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">归因模型</span>
        </div>
        <div className="space-y-1.5 text-[10px] font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">首次触点</span>
            <span className="text-foreground">video · 评论</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">最终触点</span>
            <span className="text-foreground">wechat_dm · 私信</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">路径长度</span>
            <span className="text-foreground">3 节点</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">转化耗时</span>
            <span className="text-foreground">2d 4h 18m</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// A/B experiments view
// ─────────────────────────────────────────────────────────────
export function AbView() {
  const experiments = [
    {
      name: 'persona_strategy_v1',
      desc: '顾问型 vs 逼单型 · 高意向用户',
      control: { samples: 142, conv: 38, persona: '顾问型 · 沈听澜' },
      treatment: { samples: 138, conv: 51, persona: '逼单型 · 顾倾城' },
      status: 'running',
    },
    {
      name: 'reply_timing_v2',
      desc: '即时回复 vs 5分钟延迟',
      control: { samples: 89, conv: 22, persona: '即时回复' },
      treatment: { samples: 91, conv: 19, persona: '5min 延迟' },
      status: 'running',
    },
    {
      name: 'discount_disclosure',
      desc: '主动告知优惠 vs 用户询问才告知',
      control: { samples: 56, conv: 14, persona: '被动告知' },
      treatment: { samples: 58, conv: 21, persona: '主动告知' },
      status: 'analyzed',
    },
  ]

  return (
    <div className="p-3 space-y-3">
      {/* A/B comparison bar chart */}
      <div className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
        <div className="flex items-center gap-1.5 mb-2">
          <GitBranch className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">CVR 对比图</span>
          <span className="text-[9px] font-mono text-muted-foreground/70 ml-auto">recharts</span>
        </div>
        <ABBarChart experiments={experiments} />
      </div>

      {experiments.map(exp => {
        const cCvr = (exp.control.conv / exp.control.samples) * 100
        const tCvr = (exp.treatment.conv / exp.treatment.samples) * 100
        const lift = ((tCvr - cCvr) / cCvr) * 100
        const treatmentWins = tCvr > cCvr
        return (
          <div key={exp.name} className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-mono font-semibold text-foreground">{exp.name}</span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border
                ${exp.status === 'running' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-sky-500/15 text-sky-300 border-sky-500/30'}`}>
                {exp.status}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">{exp.desc}</p>

            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div className="px-2 py-1.5 rounded bg-muted/50">
                <div className="text-muted-foreground mb-0.5">CONTROL</div>
                <div className="text-foreground">{exp.control.persona}</div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-muted-foreground">{exp.control.samples} 样本</span>
                  <span className="text-foreground font-semibold">{cCvr.toFixed(1)}%</span>
                </div>
              </div>
              <div className="px-2 py-1.5 rounded bg-muted/50">
                <div className="text-muted-foreground mb-0.5">TREATMENT</div>
                <div className="text-foreground">{exp.treatment.persona}</div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-muted-foreground">{exp.treatment.samples} 样本</span>
                  <span className="text-foreground font-semibold">{tCvr.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">提升</span>
              <span className={`font-semibold ${treatmentWins ? 'text-emerald-400' : 'text-rose-400'}`}>
                {lift > 0 ? '+' : ''}{lift.toFixed(1)}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
