#!/usr/bin/env python3
# FIX-FE-PERF · Charts.tsx
# P1-3 深色模式：Recharts 硬编码 oklch 深色配色 → 通过 useChartTheme 适配主题
# P1 性能 bonus：LatencyLineChart 的 Math.random mock 数据用 useMemo 包裹
import sys

PATH = "/tmp/my-project/src/components/waos/Charts.tsx"

with open(PATH, "r", encoding="utf-8") as f:
    src = f.read()

def repl(old, new, count=1):
    global src
    cnt = src.count(old)
    if cnt != count:
        print(f"  !! 替换失败（期望 {count} 处，实际 {cnt} 处）:\n     {old[:60]!r}")
        sys.exit(1)
    src = src.replace(old, new)
    print(f"  ok({count}): {old[:50]!r}")

# 1) 新增 react/hooks 引入
repl(
"import { useOpsStore } from '@/store/useOpsStore'",
"""import { useOpsStore } from '@/store/useOpsStore'
import { useMemo } from 'react'
import { useChartTheme } from '@/hooks/waos/useChartTheme'""")

# 2) 移除模块级硬编码 tooltipStyle / axisStyle（改由 useChartTheme 提供）
repl(
'''const tooltipStyle = {
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

''', '')

# 3) 各图表组件注入 useChartTheme()
repl(
"export function QueueDepthChart() {\n  const history = useOpsStore(s => s.metricsHistory)",
"export function QueueDepthChart() {\n  const { tooltipStyle, axisStyle, gridStroke } = useChartTheme()\n  const history = useOpsStore(s => s.metricsHistory)")

repl(
"export function FunnelBarChart({ data }: { data: { name: string; count: number; color: string }[] }) {\n  const chartData = data.map(d => ({ ...d, fill: d.color }))",
"export function FunnelBarChart({ data }: { data: { name: string; count: number; color: string }[] }) {\n  const { tooltipStyle, axisStyle, gridStroke, cursorFill } = useChartTheme()\n  const chartData = data.map(d => ({ ...d, fill: d.color }))")

repl(
"export function LatencyLineChart() {\n  const history = useOpsStore(s => s.metricsHistory)",
"export function LatencyLineChart() {\n  const { tooltipStyle, axisStyle, gridStroke } = useChartTheme()\n  const history = useOpsStore(s => s.metricsHistory)")

repl(
"export function CVRAreaChart() {\n  const history = useOpsStore(s => s.metricsHistory)",
"export function CVRAreaChart() {\n  const { tooltipStyle, axisStyle, gridStroke } = useChartTheme()\n  const history = useOpsStore(s => s.metricsHistory)")

repl(
'''export function ABBarChart({ experiments }: {
  experiments: { name: string; control: { conv: number; samples: number }; treatment: { conv: number; samples: number } }[]
}) {
  const data = experiments.map(e => ({''',
'''export function ABBarChart({ experiments }: {
  experiments: { name: string; control: { conv: number; samples: number }; treatment: { conv: number; samples: number } }[]
}) {
  const { tooltipStyle, axisStyle, gridStroke, cursorFill } = useChartTheme()
  const data = experiments.map(e => ({''')

# 4) CartesianGrid stroke 全部改用 gridStroke（5 处）
repl('stroke="oklch(1 0 0 / 6%)"', 'stroke={gridStroke}', count=5)

# 5) Tooltip cursor fill 改用 cursorFill（2 处：FunnelBarChart / ABBarChart）
repl("cursor={{ fill: 'oklch(1 0 0 / 4%)' }}", "cursor={{ fill: cursorFill }}", count=2)

# 6) LatencyLineChart mock 数据 useMemo（P1 性能 bonus）
repl(
'''  // Synthesize latency series from llmCalls delta (mock 200-1500ms range)
  const data = history.map((h, i) => ({
    time: new Date(h.ts).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    latency: 300 + (Math.sin(i / 3) * 200 + Math.random() * 400 + (h.llmFallback > 0 ? 500 : 0)),
    tokens: 80 + Math.floor(Math.random() * 200),
  }))''',
'''  // Synthesize latency series from llmCalls delta (mock 200-1500ms range)
  // P1 性能：mock 数据含 Math.random，用 useMemo 包裹避免每次渲染都重算导致图表抖动
  const data = useMemo(() => history.map((h, i) => ({
    time: new Date(h.ts).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    latency: 300 + (Math.sin(i / 3) * 200 + Math.random() * 400 + (h.llmFallback > 0 ? 500 : 0)),
    tokens: 80 + Math.floor(Math.random() * 200),
  })), [history])''')

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("Charts.tsx 写入完成")
