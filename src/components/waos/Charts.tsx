'use client'

/**
 * WAOS Charts — recharts-based visualizations
 *
 * Exports:
 *  - QueueDepthChart: stacked area chart of HOT/WARM/COLD over time
 *  - FunnelBarChart: horizontal bar chart of conversion funnel
 *  - LatencyLineChart: LLM call latency over time
 *  - CVRAreaChart: conversion rate trend
 *  - ABBarChart: A/B experiment CVR comparison
 */

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts'
import { useOpsStore } from '@/store/useOpsStore'

const CHART_COLORS = {
  hot: '#f43f5e',
  warm: '#f59e0b',
  cold: '#0ea5e9',
  cvr: '#10b981',
  llm: '#a855f7',
  fallback: '#ef4444',
}

const tooltipStyle = {
  backgroundColor: 'oklch(0.13 0 0)',
  border: '1px solid oklch(1 0 0 / 12%)',
  borderRadius: '6px',
  fontSize: '11px',
  fontFamily: 'ui-monospace, monospace',
  color: 'oklch(0.95 0 0)',
}

const axisStyle = {
  fontSize: 10,
  fontFamily: 'ui-monospace, monospace',
  fill: 'oklch(0.55 0 0)',
}

// ─── Queue Depth Chart ────────────────────────────────────────
export function QueueDepthChart() {
  const history = useOpsStore(s => s.metricsHistory)
  const data = history.map(h => ({
    ts: h.ts,
    time: new Date(h.ts).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    HOT: h.hot,
    WARM: h.warm,
    COLD: h.cold,
  }))

  if (data.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-[10px] font-mono text-muted-foreground/70">
        采集数据中… ({data.length}/2)
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="grad-hot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.hot} stopOpacity={0.7} />
            <stop offset="100%" stopColor={CHART_COLORS.hot} stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="grad-warm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.warm} stopOpacity={0.6} />
            <stop offset="100%" stopColor={CHART_COLORS.warm} stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="grad-cold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.cold} stopOpacity={0.5} />
            <stop offset="100%" stopColor={CHART_COLORS.cold} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
        <XAxis dataKey="time" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={30} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'oklch(0.7 0 0)' }} />
        <Area type="monotone" dataKey="HOT" stackId="1" stroke={CHART_COLORS.hot} strokeWidth={1.5} fill="url(#grad-hot)" />
        <Area type="monotone" dataKey="WARM" stackId="1" stroke={CHART_COLORS.warm} strokeWidth={1.5} fill="url(#grad-warm)" />
        <Area type="monotone" dataKey="COLD" stackId="1" stroke={CHART_COLORS.cold} strokeWidth={1.5} fill="url(#grad-cold)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Funnel Bar Chart ─────────────────────────────────────────
export function FunnelBarChart({ data }: { data: { name: string; count: number; color: string }[] }) {
  const chartData = data.map(d => ({ ...d, fill: d.color }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" horizontal={false} />
        <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} width={110} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'oklch(1 0 0 / 4%)' }} />
        <Bar dataKey="count" radius={[0, 3, 3, 0]}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.fill} fillOpacity={0.7} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Latency Line Chart ───────────────────────────────────────
export function LatencyLineChart() {
  const history = useOpsStore(s => s.metricsHistory)
  // Synthesize latency series from llmCalls delta (mock 200-1500ms range)
  const data = history.map((h, i) => ({
    time: new Date(h.ts).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    latency: 300 + (Math.sin(i / 3) * 200 + Math.random() * 400 + (h.llmFallback > 0 ? 500 : 0)),
    tokens: 80 + Math.floor(Math.random() * 200),
  }))

  if (data.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-[10px] font-mono text-muted-foreground/70">
        采集数据中…
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
        <XAxis dataKey="time" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={30} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'oklch(0.7 0 0)' }} />
        <Line type="monotone" dataKey="latency" stroke={CHART_COLORS.llm} strokeWidth={1.5} dot={false} name="LLM 延迟 (ms)" />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── CVR Area Chart ───────────────────────────────────────────
export function CVRAreaChart() {
  const history = useOpsStore(s => s.metricsHistory)
  const data = history.map(h => ({
    time: new Date(h.ts).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    cvr: h.cvr,
    active: h.activeLeads,
  }))

  if (data.length < 2) {
    return (
      <div className="h-24 flex items-center justify-center text-[10px] font-mono text-muted-foreground/70">
        采集数据中…
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={110}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="grad-cvr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.cvr} stopOpacity={0.6} />
            <stop offset="100%" stopColor={CHART_COLORS.cvr} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
        <XAxis dataKey="time" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={30} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'oklch(0.7 0 0)' }} />
        <Area type="monotone" dataKey="cvr" stroke={CHART_COLORS.cvr} strokeWidth={1.5} fill="url(#grad-cvr)" name="CVR %" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── A/B Bar Chart ────────────────────────────────────────────
export function ABBarChart({ experiments }: {
  experiments: { name: string; control: { conv: number; samples: number }; treatment: { conv: number; samples: number } }[]
}) {
  const data = experiments.map(e => ({
    name: e.name.length > 14 ? e.name.slice(0, 12) + '…' : e.name,
    '对照组': (e.control.conv / e.control.samples) * 100,
    '实验组': (e.treatment.conv / e.treatment.samples) * 100,
  }))
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
        <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={40} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'oklch(1 0 0 / 4%)' }} />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }} />
        <Bar dataKey="对照组" fill="#71717a" radius={[3, 3, 0, 0]} />
        <Bar dataKey="实验组" fill="#10b981" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
