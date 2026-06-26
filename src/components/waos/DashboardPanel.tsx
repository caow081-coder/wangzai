'use client'

/**
 * WAOS 数据看板 — 转化漏斗 + 效果分析
 *
 * 功能：
 *  1. 转化漏斗：新客 → 跟进中 → 高意向 → 已成交（每阶段数量 + 转化率）
 *  2. 各人设成交率对比（柱状图）
 *  3. 各渠道线索量分布（饼图：微信/抖音/视频号/评论）
 *  4. AI 回复 vs 人工回复占比（环形图）
 *  5. SOP 执行统计（成功率 / 平均耗时 / 总实例数）
 *  6. 近 7 天线索量 + 成交量趋势（折线图）
 *  7. TOP 销售排行榜（人设按 CVR 排序）
 *
 * 数据源：
 *  - 转化漏斗 / 渠道分布 / AI 占比 / 7 天趋势：从 store.leads / store.metrics / store.metricsHistory 计算
 *  - SOP 执行统计：调用 /api/waos/sop?view=instances 拉取 SOP 实例数据
 *  - 人设 CVR：直接用 store.personas.cvr（0-1，来自种子数据 + 用户配置）
 */

import { useOpsStore, type Lead, type Persona } from '@/store/useOpsStore'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, LabelList,
} from 'recharts'
import {
  Filter, Users, Radio, Bot, Activity, TrendingUp, Trophy, RefreshCw,
  Crown, Medal, Award, Clock, CheckCircle2, XCircle,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useMemo, useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

// ─── 图表配色（避开 indigo/blue 主色） ─────────────────────
const CHART_COLORS = {
  wechat: '#10b981',   // 翠绿（微信）
  douyin: '#f43f5e',   // 玫瑰红（抖音）
  video: '#8b5cf6',    // 紫色（视频号）
  comment: '#f59e0b',  // 琥珀（评论/朋友圈）
  ai: '#06b6d4',       // 青色（AI）
  human: '#a16207',    // 棕黄（人工）
  success: '#10b981',
  fail: '#ef4444',
  lead: '#22d3ee',     // 浅青（线索量）
  deal: '#10b981',     // 翠绿（成交量）
}

const FUNNEL_COLORS = ['#22d3ee', '#f59e0b', '#f43f5e', '#10b981']

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

// ─── SOP 实例类型（与 src/lib/sop/types.ts 对齐） ─────────
type SopInstanceStatus = 'running' | 'paused' | 'completed' | 'failed' | 'aborted'
interface SopInstanceLite {
  id: string
  sopName: string
  status: SopInstanceStatus
  startedAt: number
  completedAt: number | null
}

export function DashboardPanel() {
  const open = useOpsStore(s => s.dashboardPanelOpen)
  const close = useOpsStore(s => s.closeDashboardPanel)
  const leads = useOpsStore(s => s.leads)
  const personas = useOpsStore(s => s.personas)
  const metrics = useOpsStore(s => s.metrics)
  const metricsHistory = useOpsStore(s => s.metricsHistory)

  // SOP 实例数据
  const [sopInstances, setSopInstances] = useState<SopInstanceLite[]>([])
  const [sopLoading, setSopLoading] = useState(false)

  // ─── 拉取 SOP 实例数据 ───
  const fetchSopInstances = useCallback(async () => {
    setSopLoading(true)
    try {
      const res = await fetch('/api/waos/sop?view=instances&limit=200')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSopInstances((data.instances || []) as SopInstanceLite[])
    } catch (e) {
      console.warn('[Dashboard] SOP 实例拉取失败，使用空数据兜底:', e)
      setSopInstances([])
    } finally {
      setSopLoading(false)
    }
  }, [])

  // 打开时自动拉一次
  useEffect(() => {
    if (open) fetchSopInstances()
  }, [open, fetchSopInstances])

  // ─── 1. 转化漏斗（新客 → 跟进中 → 高意向 → 已成交） ───
  const funnelData = useMemo(() => {
    const newLeads = leads.filter(l => l.stage === 'new' || l.stage === 'engaged').length
    const following = leads.filter(l => l.stage === 'warm' || l.stage === 'qualified' || l.stage === 'cold').length
    const hot = leads.filter(l => l.stage === 'hot').length
    const converted = leads.filter(l => l.stage === 'converted' || l.alreadyCustomer).length
    return [
      { name: '新客', count: newLeads || 1, color: FUNNEL_COLORS[0] },
      { name: '跟进中', count: following || 1, color: FUNNEL_COLORS[1] },
      { name: '高意向', count: hot || 1, color: FUNNEL_COLORS[2] },
      { name: '已成交', count: converted || 1, color: FUNNEL_COLORS[3] },
    ]
  }, [leads])

  // ─── 2. 各人设成交率对比 ───
  const personaCvrData = useMemo(() => {
    return personas.map(p => ({
      name: p.shortName.length > 6 ? p.shortName.slice(0, 5) + '…' : p.shortName,
      shortName: p.shortName,
      avatar: p.avatar,
      cvr: Math.round(p.cvr * 100),
      active: p.active,
      color: p.color,
    })).sort((a, b) => b.cvr - a.cvr)
  }, [personas])

  // ─── 3. 各渠道线索量 ───
  const channelData = useMemo(() => {
    const counts: Record<string, number> = { wechat_dm: 0, douyin: 0, video: 0, comment: 0 }
    leads.forEach(l => {
      if (counts[l.source] !== undefined) counts[l.source]++
      else counts.comment++  // 兜底归入评论
    })
    return [
      { name: '微信', value: counts.wechat_dm, color: CHART_COLORS.wechat },
      { name: '抖音', value: counts.douyin, color: CHART_COLORS.douyin },
      { name: '视频号', value: counts.video, color: CHART_COLORS.video },
      { name: '评论/朋友圈', value: counts.comment, color: CHART_COLORS.comment },
    ].filter(d => d.value > 0)
  }, [leads])

  // ─── 4. AI 回复 vs 人工回复 ───
  const replyRatioData = useMemo(() => {
    let aiCount = 0
    let humanCount = 0
    leads.forEach(l => {
      (l.messages || []).forEach(m => {
        if (m.role === 'ai' || m.role === 'assistant') aiCount++
        else if (m.role === 'human') humanCount++
      })
    })
    // 兜底：metrics.llmCalls + metrics.humanHandoffs
    if (aiCount === 0 && humanCount === 0) {
      aiCount = metrics.llmCalls || 1
      humanCount = metrics.humanHandoffs || 0
    }
    return [
      { name: 'AI 回复', value: aiCount, color: CHART_COLORS.ai },
      { name: '人工回复', value: humanCount || 1, color: CHART_COLORS.human },
    ]
  }, [leads, metrics])

  // ─── 5. SOP 执行统计 ───
  const sopStats = useMemo(() => {
    const total = sopInstances.length
    const completed = sopInstances.filter(i => i.status === 'completed').length
    const failed = sopInstances.filter(i => i.status === 'failed' || i.status === 'aborted').length
    const running = sopInstances.filter(i => i.status === 'running').length
    const successRate = total > 0 ? (completed / total) * 100 : 0

    // 平均耗时（仅算已完成的）
    const finishedDurations = sopInstances
      .filter(i => i.status === 'completed' && i.completedAt)
      .map(i => (i.completedAt! - i.startedAt) / 1000)  // 秒
    const avgDuration = finishedDurations.length > 0
      ? finishedDurations.reduce((a, b) => a + b, 0) / finishedDurations.length
      : 0

    return { total, completed, failed, running, successRate, avgDuration }
  }, [sopInstances])

  // ─── 6. 近 7 天趋势（基于 leads.createdAt + metricsHistory 兜底） ───
  const trendData = useMemo(() => {
    // 按天聚合 leads.createdAt → 线索量；alreadyCustomer → 成交量
    const days: { date: string; label: string; leads: number; deals: number }[] = []
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const next = new Date(d)
      next.setDate(d.getDate() + 1)
      const dayLeads = leads.filter(l => {
        const t = new Date(l.createdAt).getTime()
        return t >= d.getTime() && t < next.getTime()
      })
      days.push({
        date: d.toISOString().slice(0, 10),
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        leads: dayLeads.length,
        deals: dayLeads.filter(l => l.alreadyCustomer).length,
      })
    }
    // 兜底：如果 leads 全在一天内（种子数据时间集中），用 metricsHistory 末尾若干点构造趋势
    const hasRealLeads = days.some(d => d.leads > 0)
    if (!hasRealLeads && metricsHistory.length > 0) {
      const recent = metricsHistory.slice(-7)
      recent.forEach((h, idx) => {
        const d = new Date(h.ts)
        days[idx] = {
          date: d.toISOString().slice(0, 10),
          label: `${d.getMonth() + 1}/${d.getDate()}`,
          leads: h.total || h.hot + h.warm + h.cold,
          deals: Math.round((h.total || 0) * (h.cvr / 100)),
        }
      })
    }
    return days
  }, [leads, metricsHistory])

  // ─── 7. TOP 销售排行榜（人设按 CVR 排序，取前 5） ───
  const topPersonas = useMemo(() => {
    return [...personas]
      .sort((a, b) => b.cvr - a.cvr)
      .slice(0, 5)
      .map((p, idx) => ({ ...p, rank: idx + 1 }))
  }, [personas])

  // ─── 整体转化率（漏斗首尾比） ───
  const overallCvr = funnelData[0].count > 0
    ? (funnelData[3].count / funnelData[0].count) * 100
    : 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-7xl w-[96vw] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* ─── Header ─── */}
        <DialogHeader className="px-5 py-4 border-b border-border/60 bg-card/60 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                数据看板 · 效果分析
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  实时
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-[11px] mt-1">
                转化漏斗 / 各人设成交率 / 渠道分布 / AI 占比 / SOP 执行 / 7 天趋势 / TOP 销售排行
              </DialogDescription>
            </div>
            <Button size="sm" variant="outline" onClick={fetchSopInstances} disabled={sopLoading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${sopLoading ? 'animate-spin' : ''}`} />
              刷新 SOP 数据
            </Button>
          </div>
        </DialogHeader>

        {/* ─── 主体：可滚动的卡片网格 ─── */}
        <div className="flex-1 overflow-y-auto waos-scrollbar p-5 space-y-4">
          {/* ─── 顶部 4 个 KPI 概览 ─── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="总线索"
              value={leads.length}
              icon={<Users className="w-3.5 h-3.5" />}
              tone="default"
            />
            <KpiCard
              label="高意向"
              value={metrics.hotCount}
              icon={<Filter className="w-3.5 h-3.5" />}
              tone="hot"
            />
            <KpiCard
              label="已成交"
              value={metrics.converted}
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              tone="good"
            />
            <KpiCard
              label="整体 CVR"
              value={`${overallCvr.toFixed(1)}%`}
              icon={<Trophy className="w-3.5 h-3.5" />}
              tone="emerald"
            />
          </div>

          {/* ─── Card 1: 转化漏斗（全宽） ─── */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-[12px] flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-purple-500" />
                转化漏斗 · 新客 → 跟进中 → 高意向 → 已成交
              </CardTitle>
              <CardDescription className="text-[10px]">
                每阶段线索数量 + 阶段间转化率 · 整体转化率 {overallCvr.toFixed(1)}%
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <FunnelVisualizer data={funnelData} />
            </CardContent>
          </Card>

          {/* ─── 2x2 网格：人设CVR / 渠道饼图 / AI占比 / SOP统计 ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Card 2: 各人设成交率对比 */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-[12px] flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  各人设成交率对比
                </CardTitle>
                <CardDescription className="text-[10px]">
                  基于 personas.cvr 配置 · 共 {personas.length} 个人设
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 pb-3">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={personaCvrData} margin={{ top: 10, right: 16, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
                    <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={40} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={32} unit="%" />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'oklch(1 0 0 / 4%)' }} formatter={(v: number) => [`${v}%`, '成交率']} />
                    <Bar dataKey="cvr" radius={[4, 4, 0, 0]} name="成交率">
                      {personaCvrData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} fillOpacity={0.85} />
                      ))}
                      <LabelList dataKey="cvr" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 10, fill: 'oklch(0.55 0 0)' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Card 3: 各渠道线索量饼图 */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-[12px] flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-rose-500" />
                  各渠道线索量分布
                </CardTitle>
                <CardDescription className="text-[10px]">
                  微信 / 抖音 / 视频号 / 评论 · 共 {leads.length} 条线索
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 pb-3">
                {channelData.length === 0 ? (
                  <div className="h-[220px] flex items-center justify-center text-[11px] text-muted-foreground">
                    暂无线索数据
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={channelData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={75}
                        innerRadius={42}
                        paddingAngle={3}
                        label={({ name, value }) => `${name} ${value}`}
                        labelLine={false}
                        style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                      >
                        {channelData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} fillOpacity={0.85} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Card 4: AI vs 人工回复占比 */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-[12px] flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-cyan-500" />
                  AI 回复 vs 人工回复
                </CardTitle>
                <CardDescription className="text-[10px]">
                  基于线索消息历史统计 · LLM 调用 {metrics.llmCalls} 次 · 人工接管 {metrics.humanHandoffs} 次
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 pb-3">
                <div className="flex items-center gap-2">
                  <ResponsiveContainer width="55%" height={180}>
                    <PieChart>
                      <Pie
                        data={replyRatioData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={65}
                        innerRadius={38}
                        paddingAngle={3}
                      >
                        {replyRatioData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} fillOpacity={0.85} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {replyRatioData.map(d => {
                      const total = replyRatioData.reduce((s, x) => s + x.value, 0) || 1
                      const pct = (d.value / total) * 100
                      return (
                        <div key={d.name} className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-[11px] flex-1">{d.name}</span>
                          <span className="text-[11px] font-mono font-semibold">{d.value}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">({pct.toFixed(0)}%)</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 5: SOP 执行统计 */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-[12px] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-500" />
                  SOP 执行统计
                </CardTitle>
                <CardDescription className="text-[10px]">
                  {sopLoading ? '加载中…' : `共 ${sopStats.total} 个实例 · 运行中 ${sopStats.running}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2.5">
                <SopStatRow
                  icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  label="成功率"
                  value={`${sopStats.successRate.toFixed(1)}%`}
                  sub={`${sopStats.completed}/${sopStats.total} 完成`}
                  barValue={sopStats.successRate}
                  barColor="bg-emerald-500"
                />
                <SopStatRow
                  icon={<XCircle className="w-3.5 h-3.5 text-rose-500" />}
                  label="失败率"
                  value={sopStats.total > 0 ? `${((sopStats.failed / sopStats.total) * 100).toFixed(1)}%` : '0%'}
                  sub={`${sopStats.failed} 失败/中止`}
                  barValue={sopStats.total > 0 ? (sopStats.failed / sopStats.total) * 100 : 0}
                  barColor="bg-rose-500"
                />
                <SopStatRow
                  icon={<Clock className="w-3.5 h-3.5 text-amber-500" />}
                  label="平均耗时"
                  value={sopStats.avgDuration < 60
                    ? `${sopStats.avgDuration.toFixed(1)} 秒`
                    : `${(sopStats.avgDuration / 60).toFixed(1)} 分钟`}
                  sub={`基于 ${sopStats.completed} 个已完成实例`}
                />
              </CardContent>
            </Card>
          </div>

          {/* ─── Card 6: 近 7 天趋势（全宽） ─── */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-[12px] flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-500" />
                近 7 天 · 线索量 + 成交量趋势
              </CardTitle>
              <CardDescription className="text-[10px]">
                按天聚合线索 createdAt · 成交判定为 alreadyCustomer=true
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ top: 10, right: 24, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
                  <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }} />
                  <Line type="monotone" dataKey="leads" stroke={CHART_COLORS.lead} strokeWidth={2} dot={{ r: 3 }} name="线索量" />
                  <Line type="monotone" dataKey="deals" stroke={CHART_COLORS.deal} strokeWidth={2} dot={{ r: 3 }} name="成交量" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ─── Card 7: TOP 销售排行榜 ─── */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-[12px] flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-500" />
                TOP 销售 · 人设排行榜（按成交率排序）
              </CardTitle>
              <CardDescription className="text-[10px]">
                实时统计 personas.cvr · 活跃客户数 · 容量上限
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {topPersonas.map((p, idx) => {
                  const rankIcon = idx === 0
                    ? <Crown className="w-4 h-4 text-amber-500" />
                    : idx === 1
                    ? <Medal className="w-4 h-4 text-zinc-400" />
                    : idx === 2
                    ? <Award className="w-4 h-4 text-orange-400" />
                    : <span className="text-[11px] font-mono text-muted-foreground w-4 text-center">{p.rank}</span>
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${
                        idx < 3 ? 'bg-gradient-to-r from-amber-500/5 to-transparent border-amber-500/30' : 'bg-muted/30 border-border/60'
                      }`}
                    >
                      <span className="shrink-0 w-5 flex justify-center">{rankIcon}</span>
                      <span className="text-xl shrink-0">{p.avatar}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold truncate">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          活跃 {p.active}/{p.capacity} · 主推 {p.business.primaryModel || '—'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[14px] font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {(p.cvr * 100).toFixed(0)}%
                        </div>
                        <div className="text-[9px] text-muted-foreground">CVR</div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：KPI 卡片
// ═══════════════════════════════════════════════════════════════════
function KpiCard({
  label, value, icon, tone,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  tone: 'default' | 'hot' | 'good' | 'emerald'
}) {
  const toneClass = {
    default: 'text-foreground',
    hot: 'text-rose-500',
    good: 'text-emerald-500',
    emerald: 'text-emerald-600 dark:text-emerald-400',
  }[tone]
  return (
    <div className="px-3 py-2.5 rounded-lg bg-card border border-border/60">
      <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground uppercase mb-1">
        <span className="opacity-70">{icon}</span>
        {label}
      </div>
      <div className={`text-2xl font-bold font-mono tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：转化漏斗可视化（4 阶段水平漏斗 + 转化率箭头）
// ═══════════════════════════════════════════════════════════════════
function FunnelVisualizer({
  data,
}: {
  data: { name: string; count: number; color: string }[]
}) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="space-y-2">
      {data.map((stage, idx) => {
        const widthPct = (stage.count / max) * 100
        const prevCount = idx > 0 ? data[idx - 1].count : stage.count
        const convRate = idx > 0 && prevCount > 0 ? (stage.count / prevCount) * 100 : 100
        return (
          <div key={stage.name}>
            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: stage.color }} />
                {stage.name}
              </span>
              <span className="text-foreground">
                <span className="font-semibold">{stage.count}</span>
                {idx > 0 && (
                  <span className="ml-2 text-muted-foreground">
                    ← {convRate.toFixed(1)}% 转化
                  </span>
                )}
              </span>
            </div>
            <div className="h-7 bg-muted/40 rounded-md overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(6, widthPct)}%` }}
                transition={{ duration: 0.6, delay: idx * 0.1, ease: 'easeOut' }}
                className="h-full flex items-center justify-end px-2.5 text-[11px] font-mono font-semibold text-white"
                style={{
                  background: `linear-gradient(90deg, ${stage.color}88 0%, ${stage.color} 100%)`,
                }}
              >
                {stage.count > 0 && `${((stage.count / (data[0].count || 1)) * 100).toFixed(0)}%`}
              </motion.div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：SOP 统计行（图标 + 标签 + 数值 + 进度条）
// ═══════════════════════════════════════════════════════════════════
function SopStatRow({
  icon, label, value, sub, barValue, barColor,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  barValue?: number
  barColor?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-medium">{label}</span>
          <span className="text-[12px] font-mono font-semibold">{value}</span>
        </div>
        {barValue !== undefined && (
          <div className="h-1.5 bg-muted/60 rounded-sm overflow-hidden mt-1">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(2, barValue))}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className={`h-full ${barColor}`}
            />
          </div>
        )}
        <div className="text-[9px] text-muted-foreground mt-0.5">{sub}</div>
      </div>
    </div>
  )
}
