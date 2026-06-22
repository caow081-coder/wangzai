#!/usr/bin/env python3
# FIX-FE-PERF · ProDrawer.tsx
# P1-3 深色模式：DashboardInlineView 内硬编码 oklch 图表配色 → useChartTheme
# P2-1 aria-label：关闭按钮补 aria-label
import sys

PATH = "/tmp/my-project/src/components/waos/ProDrawer.tsx"

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

# 1) 引入 useChartTheme
repl(
"import { useState } from 'react'",
"import { useState } from 'react'\nimport { useChartTheme } from '@/hooks/waos/useChartTheme'")

# 2) DashboardInlineView 内：替换硬编码 tooltipStyle / axisStyle 为 hook
repl(
'''  const tooltipStyle = {
    backgroundColor: 'oklch(0.13 0 0)',
    border: '1px solid oklch(1 0 0 / 12%)',
    borderRadius: '6px',
    fontSize: '11px',
    fontFamily: 'ui-monospace, monospace',
    color: 'oklch(0.95 0 0)',
  }
  const axisStyle = { fontSize: 10, fontFamily: 'ui-monospace, monospace' as const, fill: 'oklch(0.55 0 0)' }''',
'''  // P1-3 图表主题与 <html>.dark 同步
  const { tooltipStyle, axisStyle, gridStroke, cursorFill } = useChartTheme()''')

# 3) CartesianGrid stroke × 1
repl('stroke="oklch(1 0 0 / 6%)"', 'stroke={gridStroke}', count=1)

# 4) Tooltip cursor fill × 1
repl("cursor={{ fill: 'oklch(1 0 0 / 4%)' }}", "cursor={{ fill: cursorFill }}", count=1)

# 5) 关闭按钮 aria-label（P2-1）
repl(
'''            <button onClick={close} className="ml-auto p-1 rounded hover:bg-muted">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>''',
'''            <button onClick={close} aria-label="关闭控制台" className="ml-auto p-1 rounded hover:bg-muted">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>''')

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("ProDrawer.tsx 写入完成")
