#!/usr/bin/env python3
# FIX-FE-PERF · DashboardPanel.tsx
# P1-3 深色模式：硬编码 oklch 图表配色 → useChartTheme 适配
# P2-2 加载骨架：SOP 执行统计卡片首次加载时用 Skeleton 行
import sys

PATH = "/tmp/my-project/src/components/waos/DashboardPanel.tsx"

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

# 1) 引入 useChartTheme + Skeleton
repl(
"import { toast } from 'sonner'",
"""import { toast } from 'sonner'
import { useChartTheme } from '@/hooks/waos/useChartTheme'
import { Skeleton } from '@/components/ui/skeleton'""")

# 2) 移除模块级硬编码 tooltipStyle / axisStyle
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

# 3) DashboardPanel 组件内注入 useChartTheme
repl(
'''  // SOP 实例数据
  const [sopInstances, setSopInstances] = useState<SopInstanceLite[]>([])
  const [sopLoading, setSopLoading] = useState(false)''',
'''  // P1-3 图表主题：与 <html>.dark 同步（Recharts 无法读 CSS 类）
  const { tooltipStyle, axisStyle, gridStroke, cursorFill, labelFill } = useChartTheme()

  // SOP 实例数据
  const [sopInstances, setSopInstances] = useState<SopInstanceLite[]>([])
  const [sopLoading, setSopLoading] = useState(false)''')

# 4) CartesianGrid stroke × 2
repl('stroke="oklch(1 0 0 / 6%)"', 'stroke={gridStroke}', count=2)

# 5) Tooltip cursor fill × 1
repl("cursor={{ fill: 'oklch(1 0 0 / 4%)' }}", "cursor={{ fill: cursorFill }}", count=1)

# 6) LabelList fill × 1
repl(
"style={{ fontSize: 10, fill: 'oklch(0.55 0 0)' }}",
"style={{ fontSize: 10, fill: labelFill }}",
count=1)

# 7) SOP 卡片：首次加载（无数据）时用 Skeleton 行（P2-2）
repl(
'''              <CardContent className="px-4 pb-3 space-y-2.5">
                <SopStatRow
                  icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  label="成功率"
                  value={`${sopStats.successRate.toFixed(1)}%`}
                  sub={`${sopStats.completed}/${sopStats.total} 完成`}
                  barValue={sopStats.successRate}
                  barColor="bg-emerald-500"
                />''',
'''              <CardContent className="px-4 pb-3 space-y-2.5">
                {/* P2-2 加载骨架：SOP 实例首次拉取时展示骨架行，避免 0/0 误导 */}
                {sopLoading && sopInstances.length === 0 ? (
                  <>
                    <Skeleton className="h-8 w-full rounded-md" />
                    <Skeleton className="h-8 w-full rounded-md" />
                    <Skeleton className="h-8 w-full rounded-md" />
                  </>
                ) : (
                <SopStatRow
                  icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  label="成功率"
                  value={`${sopStats.successRate.toFixed(1)}%`}
                  sub={`${sopStats.completed}/${sopStats.total} 完成`}
                  barValue={sopStats.successRate}
                  barColor="bg-emerald-500"
                />''')

# 8) 闭合 SOP 卡片的条件渲染（在最后一条 SopStatRow 后加 )
repl(
'''                <SopStatRow
                  icon={<Clock className="w-3.5 h-3.5 text-amber-500" />}
                  label="平均耗时"
                  value={sopStats.avgDuration < 60
                    ? `${sopStats.avgDuration.toFixed(1)} 秒`
                    : `${(sopStats.avgDuration / 60).toFixed(1)} 分钟`}
                  sub={`基于 ${sopStats.completed} 个已完成实例`}
                />
              </CardContent>''',
'''                <SopStatRow
                  icon={<Clock className="w-3.5 h-3.5 text-amber-500" />}
                  label="平均耗时"
                  value={sopStats.avgDuration < 60
                    ? `${sopStats.avgDuration.toFixed(1)} 秒`
                    : `${(sopStats.avgDuration / 60).toFixed(1)} 分钟`}
                  sub={`基于 ${sopStats.completed} 个已完成实例`}
                />
                )}
              </CardContent>''')

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("DashboardPanel.tsx 写入完成")
