'use client'

/**
 * 旺财 · SOP 引擎 — 运行日志面板
 *
 * 功能：
 *  - 时间线列表：每条日志显示 时间 + 节点名 + Skill名 + 状态图标 + 耗时
 *  - 状态：success ✅ / failed ❌ / running ⏳ 黄闪烁 / skipped ⏭️ 灰
 *  - 筛选：按 SOP 实例 + 按状态
 *  - 搜索框（按节点名/Skill名/错误信息）
 *  - 自动刷新（运行中每 2 秒拉一次日志）
 *  - 点击日志展开 input/output JSON 详情
 *  - 可折叠（折叠时显示状态计数摘要）
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, XCircle, Loader2, SkipForward, ChevronDown, ChevronUp,
  Search, RefreshCw, Filter, Activity, Clock, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { SopNodeLog, NodeLogStatus, SopInstance } from '@/lib/sop/types'

export interface SopRunLogProps {
  /** 当前选中的实例 ID（null 时显示所有日志） */
  instanceId: string | null
  /** 实例列表（用于筛选下拉） */
  instances: SopInstance[]
  /** 实例是否在运行（运行中自动刷新） */
  isRunning: boolean
  /** 初始是否展开 */
  defaultExpanded?: boolean
}

const STATUS_META: Record<NodeLogStatus, {
  icon: typeof CheckCircle2
  color: string
  bg: string
  label: string
  pulse?: boolean
}> = {
  success: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: '成功' },
  failed:  { icon: XCircle,       color: 'text-rose-500',    bg: 'bg-rose-500/10',    label: '失败' },
  running: { icon: Loader2,       color: 'text-amber-500',   bg: 'bg-amber-500/10',   label: '执行中', pulse: true },
  skipped: { icon: SkipForward,   color: 'text-slate-400',   bg: 'bg-slate-400/10',   label: '跳过' },
}

export function SopRunLog({ instanceId, instances, isRunning, defaultExpanded = true }: SopRunLogProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [logs, setLogs] = useState<SopNodeLog[]>([])
  const [loading, setLoading] = useState(false)
  const [filterInstance, setFilterInstance] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set())
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  // 实际查询的实例 ID
  const effectiveInstanceId = filterInstance === 'all' ? null : filterInstance === 'selected' ? instanceId : filterInstance

  // ─── 拉取日志 ────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const url = effectiveInstanceId
        ? `/api/waos/sop?view=instance_logs&id=${encodeURIComponent(effectiveInstanceId)}`
        : `/api/waos/sop?view=instances&limit=20`
      const res = await fetch(url)
      const data = await res.json()
      if (effectiveInstanceId) {
        setLogs(data.logs || [])
      } else {
        // 拉所有实例的日志（限制前 20 个实例）
        const allInstances: SopInstance[] = data.instances || []
        const allLogs: SopNodeLog[] = []
        await Promise.all(
          allInstances.slice(0, 10).map(async (inst) => {
            try {
              const r = await fetch(`/api/waos/sop?view=instance_logs&id=${encodeURIComponent(inst.id)}`)
              const d = await r.json()
              allLogs.push(...(d.logs || []))
            } catch { /* 忽略单个实例失败 */ }
          })
        )
        // 按时间倒序
        allLogs.sort((a, b) => b.startedAt - a.startedAt)
        setLogs(allLogs.slice(0, 100))
      }
      setLastUpdated(Date.now())
    } catch (e) {
      console.error('[SopRunLog] fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }, [effectiveInstanceId])

  // 初次加载 + 实例切换时拉取
  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // 运行中自动刷新（每 2 秒）
  useEffect(() => {
    if (!isRunning || !expanded) return
    const timer = setInterval(fetchLogs, 2000)
    return () => clearInterval(timer)
  }, [isRunning, expanded, fetchLogs])

  // ─── 筛选 ────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    let result = logs
    if (filterStatus !== 'all') {
      result = result.filter(l => l.status === filterStatus)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(l =>
        l.nodeName.toLowerCase().includes(q) ||
        (l.skillName?.toLowerCase().includes(q) ?? false) ||
        (l.errorMessage?.toLowerCase().includes(q) ?? false)
      )
    }
    return result
  }, [logs, filterStatus, searchQuery])

  // 状态计数
  const statusCounts = useMemo(() => {
    const counts: Record<NodeLogStatus, number> = { success: 0, failed: 0, running: 0, skipped: 0 }
    for (const log of logs) {
      counts[log.status] = (counts[log.status] || 0) + 1
    }
    return counts
  }, [logs])

  const toggleLog = (id: string) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="shrink-0 border-t border-border bg-background flex flex-col" style={{ height: expanded ? 280 : 44 }}>
      {/* ─── 头部 ──────────────────────────────────────────── */}
      <div
        className="h-11 shrink-0 px-3 flex items-center gap-2 border-b border-border cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">运行日志</span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
          {logs.length} 条
        </Badge>

        {/* 状态计数胶囊 */}
        <div className="flex items-center gap-1 ml-2">
          {(['success', 'failed', 'running', 'skipped'] as NodeLogStatus[]).map(s => {
            const meta = STATUS_META[s]
            const Icon = meta.icon
            const count = statusCounts[s] || 0
            if (count === 0 && s !== 'running') return null
            return (
              <div
                key={s}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${meta.bg} ${meta.color}`}
              >
                <Icon className={`w-3 h-3 ${meta.pulse ? 'animate-spin' : ''}`} />
                {count}
              </div>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* 最后更新时间 */}
        {lastUpdated && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 mr-2">
            <Clock className="w-3 h-3" />
            {new Date(lastUpdated).toLocaleTimeString('zh-CN', { hour12: false })}
          </span>
        )}

        {/* 刷新按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); fetchLogs() }}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        {/* 展开/收起 */}
        <Button variant="ghost" size="icon" className="h-7 w-7">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </Button>
      </div>

      {/* ─── 展开内容 ──────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="flex-1 min-h-0 flex flex-col"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* 筛选栏 */}
            <div className="shrink-0 px-3 py-2 border-b border-border flex items-center gap-2 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <Select value={filterInstance} onValueChange={setFilterInstance}>
                <SelectTrigger className="h-7 w-[180px] text-xs">
                  <SelectValue placeholder="实例" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部实例</SelectItem>
                  <SelectItem value="selected">当前选中</SelectItem>
                  {instances.map(inst => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.sopName} · {inst.customerName || inst.customerId.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-7 w-[100px] text-xs">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="success">✅ 成功</SelectItem>
                  <SelectItem value="failed">❌ 失败</SelectItem>
                  <SelectItem value="running">⏳ 执行中</SelectItem>
                  <SelectItem value="skipped">⏭️ 跳过</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex-1 min-w-[180px] relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索节点名 / Skill / 错误信息..."
                  className="h-7 pl-8 text-xs"
                />
              </div>

              {isRunning && (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300">
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  自动刷新中
                </Badge>
              )}
            </div>

            {/* 日志列表 */}
            <ScrollArea className="flex-1 waos-scrollbar">
              {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                  <Activity className="w-8 h-8 mb-2 opacity-30" />
                  <div className="text-xs">
                    {logs.length === 0 ? '暂无日志，运行 SOP 后将显示执行记录' : '无匹配日志'}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {filteredLogs.map((log, idx) => (
                    <LogItem
                      key={log.id}
                      log={log}
                      index={idx}
                      expanded={expandedLogIds.has(log.id)}
                      onToggle={() => toggleLog(log.id)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── 单条日志 ────────────────────────────────────────────────
function LogItem({ log, index, expanded, onToggle }: {
  log: SopNodeLog
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const meta = STATUS_META[log.status]
  const Icon = meta.icon
  const time = new Date(log.startedAt).toLocaleTimeString('zh-CN', { hour12: false })
  const timeFull = new Date(log.startedAt).toLocaleString('zh-CN')

  return (
    <div
      className="px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        {/* 序号 */}
        <span className="text-[10px] text-muted-foreground font-mono w-6 text-right shrink-0">
          {String(index + 1).padStart(2, '0')}
        </span>

        {/* 状态图标 */}
        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${meta.bg}`}>
          <Icon className={`w-3.5 h-3.5 ${meta.color} ${meta.pulse ? 'animate-spin' : ''}`} />
        </div>

        {/* 时间 */}
        <span
          className="text-[10px] font-mono text-muted-foreground shrink-0 w-16"
          title={timeFull}
        >
          {time}
        </span>

        {/* 节点名 + Skill 名 */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-xs font-medium truncate">{log.nodeName}</span>
          {log.skillName && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
              ⚡ {log.skillName}
            </Badge>
          )}
          {log.errorMessage && (
            <span className="text-[10px] text-rose-500 truncate flex items-center gap-1 shrink-0" title={log.errorMessage}>
              <AlertCircle className="w-3 h-3" />
              {log.errorMessage}
            </span>
          )}
        </div>

        {/* 耗时 */}
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {log.durationMs > 0 ? `${log.durationMs}ms` : log.status === 'running' ? '...' : '—'}
        </span>

        {/* 状态标签 */}
        <Badge
          variant="outline"
          className={`text-[9px] h-4 px-1 shrink-0 ${meta.bg} ${meta.color} border-current/30`}
        >
          {meta.label}
        </Badge>
      </div>

      {/* 展开 JSON 详情 */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="mt-2 ml-12 grid grid-cols-2 gap-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <JsonBlock title="Input" data={log.input} />
            <JsonBlock title="Output" data={log.output} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── JSON 展示块 ────────────────────────────────────────────────
function JsonBlock({ title, data }: { title: string; data: Record<string, unknown> | null }) {
  return (
    <div className="rounded border border-border bg-muted/30 overflow-hidden">
      <div className="px-2 py-1 text-[10px] font-semibold bg-muted/50 border-b border-border">
        {title}
      </div>
      <pre className="p-2 text-[10px] font-mono overflow-auto max-h-32 waos-scrollbar">
        {data ? JSON.stringify(data, null, 2) : <span className="text-muted-foreground italic">null</span>}
      </pre>
    </div>
  )
}
