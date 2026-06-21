'use client'

/**
 * 旺财 · 工作台 SOP 触发器（Phase 6 集成）
 *
 * 包含两个独立子组件，由 DecisionPanel 嵌入：
 *
 *  1. SopRunButton
 *     - 下拉按钮：列出所有 SOP 定义（手动 👇 / 自动 ⚡）
 *     - 选中后弹出确认 Dialog：自动填充客户 ID / 客户名称 / 最近消息 / 身份向量
 *     - 点击「启动 SOP」→ POST /api/waos/sop { action: 'run' }
 *     - 成功 → toast 🚀 + EventStream 追加日志
 *     - 失败 → toast ❌
 *     - 启动后派发 'waos:sopStarted' 自定义事件，通知 SopInstanceCard 立即刷新
 *
 *  2. SopInstanceCard
 *     - 显示当前选中客户的所有 SOP 实例（重点：running 状态）
 *     - 显示：SOP 名称 / 当前节点名 / 进度条（已完成/总节点数） / 状态徽章
 *     - 暂停/终止按钮（pause / abort）
 *     - 状态变化时 toast 通知：✅ 完成 / ❌ 失败（带节点名+错误信息）
 *     - Framer Motion 卡片淡入动画
 *     - 自动轮询：3 秒一次（有 running 实例时）
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Bot, ChevronDown, Play, Pause, Square, Loader2, RefreshCw,
  Zap, Hand, AlertCircle, CheckCircle2, Clock,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useOpsStore } from '@/store/useOpsStore'
import {
  fetchSopDefinitions, fetchSopInstances, fetchSopInstanceLogs,
  runSop, pauseSop, abortSop,
  computeInstanceProgress, resolveCurrentNodeName,
  statusBadgeClass, statusLabel, triggerIcon, triggerLabel,
  isDesktopEnv,
  type SopDefinitionDTO, type SopInstanceDTO,
} from '@/lib/waos/sopClient'

// 全局事件名：SopRunButton 启动后通知 SopInstanceCard 立即刷新
export const SOP_STARTED_EVENT = 'waos:sopStarted'
// 全局事件名：SopInstanceCard 状态变化时通知其他订阅者（如通知中心）
export const SOP_STATUS_CHANGED_EVENT = 'waos:sopStatusChanged'

// ─── 工具：往 EventStream 追加一条日志（沿用 useOpsStore 已有模式）────
function appendOpsLog(level: 'info' | 'warn' | 'error' | 'system', msg: string) {
  // 直接操作 store，避免每个调用点都写两行
  const store = useOpsStore.getState()
  store.logs.unshift({ level, msg, ts: Date.now() })
  useOpsStore.setState({ logs: [...store.logs] })
}

// ─── 工具：根据 lead 字段构造 IdentityVector（与 useOpsStore 一致）─────
function buildIdentityFromLead(lead: {
  alreadyCustomer: boolean
  intentScore: number
  priorityScore: number
  valueScore: number
}): { trust: number; intent: number; emotion: number; urgency: number; resistance: number; value: number } {
  return {
    trust: lead.alreadyCustomer ? 70 : 40,
    intent: lead.intentScore,
    emotion: lead.intentScore > 50 ? 60 : 40,
    urgency: lead.priorityScore,
    resistance: Math.max(0, 100 - lead.intentScore),
    value: lead.valueScore,
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. SopRunButton — 运行 SOP 下拉按钮 + 确认 Dialog
// ═══════════════════════════════════════════════════════════════
export function SopRunButton() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)

  // SOP 定义列表（下拉菜单数据源）
  const [definitions, setDefinitions] = useState<SopDefinitionDTO[]>([])
  const [loadingDefs, setLoadingDefs] = useState(false)
  const [defsError, setDefsError] = useState<string | null>(null)
  // 已拉取过的标记，避免每次打开都打 API
  const fetchedRef = useRef(false)

  // 选中的 SOP（用于 Dialog 显示）
  const [selectedDef, setSelectedDef] = useState<SopDefinitionDTO | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [starting, setStarting] = useState(false)

  const desktop = isDesktopEnv()

  // 拉取 SOP 定义列表
  const loadDefinitions = useCallback(async (force = false) => {
    if (!force && fetchedRef.current) return
    setLoadingDefs(true)
    setDefsError(null)
    try {
      const defs = await fetchSopDefinitions()
      setDefinitions(defs)
      fetchedRef.current = true
    } catch (e) {
      setDefsError(e instanceof Error ? e.message : '未知错误')
    } finally {
      setLoadingDefs(false)
    }
  }, [])

  // 首次挂载拉一次（让下拉打开时已有数据）
  useEffect(() => {
    loadDefinitions()
  }, [loadDefinitions])

  // 选中某条 SOP → 打开确认 Dialog
  const handleSelectDef = (def: SopDefinitionDTO) => {
    setSelectedDef(def)
    setDialogOpen(true)
  }

  // 启动 SOP
  const handleStart = async () => {
    if (!selectedDef || !lead) return
    setStarting(true)
    try {
      const identity = buildIdentityFromLead(lead)
      const lastMessage = lead.lastMessage || lead.messages?.slice(-1)[0]?.content || ''

      const instance = await runSop({
        sopDefinitionId: selectedDef.id,
        customerId: lead.id,
        customerName: lead.userName,
        initialContext: {
          message: lastMessage,
          identity,
          intent: 'manual',
          customerName: lead.userName,
          lead: {
            id: lead.id,
            userName: lead.userName,
            source: lead.source,
            stage: lead.stage,
            intentScore: lead.intentScore,
            valueScore: lead.valueScore,
            priorityScore: lead.priorityScore,
            tags: lead.tags,
          },
        },
      })

      // 成功提示（启动）
      toast.success(`🚀 SOP「${selectedDef.name}」已启动`, {
        description: `客户：${lead.userName} · 实例：${instance.id.slice(-8)}`,
      })
      // EventStream 追加日志
      appendOpsLog('info', `[SOP] 🚀 启动「${selectedDef.name}」→ 客户：${lead.userName}（实例 ${instance.id.slice(-8)}）`)

      // 通知 SopInstanceCard 立即刷新
      window.dispatchEvent(new CustomEvent(SOP_STARTED_EVENT, {
        detail: { instanceId: instance.id, customerId: lead.id },
      }))

      setDialogOpen(false)
      setSelectedDef(null)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : '未知错误'
      toast.error(`❌ SOP 启动失败`, { description: errMsg })
      appendOpsLog('error', `[SOP] ❌ 启动失败：${errMsg}`)
    } finally {
      setStarting(false)
    }
  }

  // 取消按钮
  const handleCancel = () => {
    if (starting) return
    setDialogOpen(false)
    setSelectedDef(null)
  }

  if (!lead) return null

  // 当前 lead 最近消息（用于 Dialog 预览）
  const lastMessagePreview = lead.lastMessage || lead.messages?.slice(-1)[0]?.content || '（暂无消息）'
  const identity = buildIdentityFromLead(lead)

  return (
    <>
      {/* 下拉按钮 */}
      <div className="w-full">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="运行 SOP"
              className="w-full flex items-center justify-center gap-1.5 h-10 rounded-xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 text-violet-600 dark:text-violet-300 text-[12px] font-medium border border-violet-500/20 hover:from-violet-500/20 hover:to-fuchsia-500/20 active:scale-[0.98] transition-all apple-btn"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>🤖 运行 SOP</span>
              {desktop && (
                <span className="text-[9px] px-1 py-px rounded bg-violet-500/15 text-violet-600 dark:text-violet-300">桌面</span>
              )}
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[320px] max-h-[400px] overflow-y-auto waos-scrollbar">
            <DropdownMenuLabel className="flex items-center justify-between text-[11px]">
              <span>选择 SOP 流程</span>
              <button
                onClick={(e) => { e.stopPropagation(); loadDefinitions(true) }}
                className="text-muted-foreground hover:text-foreground p-0.5"
                aria-label="刷新 SOP 列表"
              >
                <RefreshCw className={`w-3 h-3 ${loadingDefs ? 'animate-spin' : ''}`} />
              </button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* 加载中 */}
            {loadingDefs && definitions.length === 0 && (
              <div className="py-6 flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-[10px]">加载 SOP 列表…</span>
              </div>
            )}

            {/* 错误提示 */}
            {defsError && (
              <div className="py-4 px-3 flex items-start gap-2 text-[10px] text-rose-600">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{defsError}</span>
              </div>
            )}

            {/* 空列表 */}
            {!loadingDefs && !defsError && definitions.length === 0 && (
              <div className="py-6 text-center text-[10px] text-muted-foreground">
                暂无 SOP 定义<br />
                <span className="text-[9px]">请到 SOP 引擎面板创建</span>
              </div>
            )}

            {/* SOP 列表 */}
            {!loadingDefs && definitions.map(def => (
              <DropdownMenuItem
                key={def.id}
                onSelect={() => handleSelectDef(def)}
                className="flex flex-col items-start gap-1 py-2 px-2 cursor-pointer focus:bg-violet-500/5"
              >
                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-[12px]">{triggerIcon(def.triggerType)}</span>
                  <span className="text-[12px] font-semibold truncate flex-1">{def.name}</span>
                  <span className={`text-[9px] px-1 py-px rounded font-medium ${
                    def.triggerType === 'manual'
                      ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}>
                    {triggerLabel(def.triggerType)}
                  </span>
                </div>
                {def.description && (
                  <span className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed pl-5">
                    {def.description}
                  </span>
                )}
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground pl-5">
                  <span>{def.nodes.length} 节点</span>
                  <span>·</span>
                  <span>v{def.version}</span>
                  <span>·</span>
                  <span>{def.category}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 运行确认 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!starting) { setDialogOpen(v); if (!v) setSelectedDef(null) } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-violet-500" />
              启动 SOP
            </DialogTitle>
            <DialogDescription>
              确认为当前客户启动此 SOP 流程，启动后将自动执行各节点 Skill。
            </DialogDescription>
          </DialogHeader>

          {selectedDef && (
            <div className="space-y-3 py-1">
              {/* SOP 信息 */}
              <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px]">{triggerIcon(selectedDef.triggerType)}</span>
                  <span className="text-[13px] font-semibold">{selectedDef.name}</span>
                  <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1">
                    {triggerLabel(selectedDef.triggerType)}
                  </Badge>
                </div>
                {selectedDef.description && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {selectedDef.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span>{selectedDef.nodes.length} 节点</span>
                  <span>·</span>
                  <span>{selectedDef.category}</span>
                  <span>·</span>
                  <span>v{selectedDef.version}</span>
                </div>
              </div>

              {/* 客户信息预填 */}
              <div className="space-y-1.5">
                <div className="text-[10px] text-muted-foreground font-medium">客户信息（自动填充）</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <div className="text-[9px] text-muted-foreground">客户 ID</div>
                    <div className="text-[11px] font-mono truncate">{lead.id}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <div className="text-[9px] text-muted-foreground">客户名称</div>
                    <div className="text-[11px] font-semibold truncate">{lead.userName}</div>
                  </div>
                </div>

                {/* 最近消息 */}
                <div className="p-2 rounded-lg bg-secondary/50">
                  <div className="text-[9px] text-muted-foreground mb-0.5">最近消息（作为初始上下文）</div>
                  <div className="text-[11px] leading-relaxed line-clamp-2 max-h-[40px] overflow-hidden">
                    {lastMessagePreview}
                  </div>
                </div>

                {/* 身份向量 */}
                <div className="p-2 rounded-lg bg-secondary/50">
                  <div className="text-[9px] text-muted-foreground mb-1">身份向量 IdentityVector</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(identity).map(([k, v]) => (
                      <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-background font-mono">
                        {k}: <span className="text-primary font-semibold">{v.toFixed(0)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={handleCancel} disabled={starting} size="sm">
              取消
            </Button>
            <Button
              onClick={handleStart}
              disabled={starting || !selectedDef}
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {starting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  启动中…
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1" />
                  启动 SOP
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// 2. SopInstanceCard — 当前客户运行中 SOP 状态卡片
// ═══════════════════════════════════════════════════════════════
export function SopInstanceCard() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)

  const [instances, setInstances] = useState<SopInstanceDTO[]>([])
  const [definitions, setDefinitions] = useState<SopDefinitionDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, 'pause' | 'abort' | undefined>>({})

  // 记录上次每个实例的状态，用于检测 transition → toast
  const prevStatusRef = useRef<Record<string, string>>({})
  // 防止重复 toast（同一 instanceId + 同一 transition 只通知一次）
  const notifiedRef = useRef<Set<string>>(new Set())

  // 定义缓存：按 sopDefinitionId 索引
  const defMap = new Map(definitions.map(d => [d.id, d]))

  // 拉取当前客户的实例
  const loadInstances = useCallback(async (silent = false) => {
    if (!lead) {
      setInstances([])
      return
    }
    if (!silent) setLoading(true)
    try {
      const all = await fetchSopInstances()
      // 筛选当前客户
      const mine = all.filter(i => i.customerId === lead.id)
      setInstances(mine)

      // 检测状态转换 → toast
      for (const inst of mine) {
        const prev = prevStatusRef.current[inst.id]
        const transitionKey = `${inst.id}:${prev}:${inst.status}`
        if (prev && prev !== inst.status && !notifiedRef.current.has(transitionKey)) {
          notifiedRef.current.add(transitionKey)
          handleStatusTransition(prev as SopInstanceDTO['status'], inst)
        }
        prevStatusRef.current[inst.id] = inst.status
      }

      // 派发状态变化事件（通知其他订阅者）
      window.dispatchEvent(new CustomEvent(SOP_STATUS_CHANGED_EVENT, {
        detail: { customerId: lead.id, instances: mine },
      }))
    } catch (e) {
      // 静默失败，不打扰用户
      console.warn('[SopInstanceCard] 拉取失败:', e)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [lead])

  // 拉取定义（仅一次）
  useEffect(() => {
    let cancelled = false
    fetchSopDefinitions().then(defs => {
      if (!cancelled) setDefinitions(defs)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // 切换 lead 时立即拉取一次 + 重置通知记录
  useEffect(() => {
    prevStatusRef.current = {}
    notifiedRef.current.clear()
    loadInstances()
  }, [lead?.id, loadInstances])

  // 监听 SopRunButton 启动事件 → 立即刷新
  useEffect(() => {
    const handler = () => loadInstances(true)
    window.addEventListener(SOP_STARTED_EVENT, handler)
    return () => window.removeEventListener(SOP_STARTED_EVENT, handler)
  }, [loadInstances])

  // 轮询：仅当有 running 实例时每 3 秒拉一次
  const hasRunning = instances.some(i => i.status === 'running')
  useEffect(() => {
    if (!hasRunning) return
    const timer = setInterval(() => loadInstances(true), 3000)
    return () => clearInterval(timer)
  }, [hasRunning, loadInstances])

  // 状态转换处理：完成/失败 → toast
  const handleStatusTransition = async (
    prev: SopInstanceDTO['status'],
    inst: SopInstanceDTO,
  ) => {
    if (prev === 'running' && inst.status === 'completed') {
      const def = defMap.get(inst.sopDefinitionId)
      const total = def?.nodes.length || 0
      toast.success(`✅ SOP「${inst.sopName}」已完成`, {
        description: total > 0 ? `${total} 个节点全部成功` : '所有节点执行完毕',
      })
      appendOpsLog('info', `[SOP] ✅「${inst.sopName}」已完成 - 客户：${inst.customerName || ''}（${total} 节点）`)
    } else if (prev === 'running' && inst.status === 'failed') {
      // 拉取失败节点的详情
      try {
        const logs = await fetchSopInstanceLogs(inst.id)
        const failedLog = logs.find(l => l.status === 'failed')
        const nodeName = failedLog?.nodeName || '未知'
        const errMsg = failedLog?.errorMessage || '未知错误'
        toast.error(`❌ SOP「${inst.sopName}」执行失败`, {
          description: `节点「${nodeName}」错误：${errMsg}`,
        })
        appendOpsLog('error', `[SOP] ❌「${inst.sopName}」失败 - 节点「${nodeName}」错误：${errMsg}`)
      } catch {
        toast.error(`❌ SOP「${inst.sopName}」执行失败`)
        appendOpsLog('error', `[SOP] ❌「${inst.sopName}」执行失败（详情获取失败）`)
      }
    } else if (prev === 'running' && inst.status === 'aborted') {
      toast.info(`⏹ SOP「${inst.sopName}」已终止`)
      appendOpsLog('warn', `[SOP] ⏹「${inst.sopName}」已终止 - 客户：${inst.customerName || ''}`)
    } else if (prev === 'running' && inst.status === 'paused') {
      // 暂停通常由用户主动触发，已在该操作处单独 toast，不重复
    }
  }

  // 暂停 / 终止
  const handlePause = async (inst: SopInstanceDTO) => {
    setActionLoading(prev => ({ ...prev, [inst.id]: 'pause' }))
    try {
      await pauseSop(inst.id)
      toast.info(`⏸ SOP「${inst.sopName}」已暂停`)
      appendOpsLog('info', `[SOP] ⏸ 暂停「${inst.sopName}」`)
      // 立即刷新
      await loadInstances(true)
    } catch (e) {
      toast.error('暂停失败', { description: e instanceof Error ? e.message : '' })
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[inst.id]; return n })
    }
  }

  const handleAbort = async (inst: SopInstanceDTO) => {
    setActionLoading(prev => ({ ...prev, [inst.id]: 'abort' }))
    try {
      await abortSop(inst.id)
      toast.warning(`⏹ SOP「${inst.sopName}」已终止`)
      appendOpsLog('warn', `[SOP] ⏹ 终止「${inst.sopName}」`)
      await loadInstances(true)
    } catch (e) {
      toast.error('终止失败', { description: e instanceof Error ? e.message : '' })
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[inst.id]; return n })
    }
  }

  if (!lead) return null
  if (instances.length === 0) return null

  // 排序：running 优先，其次按 updatedAt 倒序
  const sorted = [...instances].sort((a, b) => {
    const order: Record<string, number> = { running: 0, paused: 1, failed: 2, aborted: 3, completed: 4 }
    return (order[a.status] ?? 5) - (order[b.status] ?? 5) || b.updatedAt - a.updatedAt
  })

  return (
    <div className="p-4 border-b border-border/60">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-md bg-violet-500/10 flex items-center justify-center">
          <Bot className="w-3 h-3 text-violet-500" />
        </div>
        <h3 className="text-[12px] font-semibold tracking-wide">SOP 执行状态</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">
          {instances.length} 个实例
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => loadInstances()}
              className="text-muted-foreground hover:text-foreground p-0.5"
              aria-label="刷新 SOP 实例"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">刷新</TooltipContent>
        </Tooltip>
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {sorted.map(inst => {
            const def = defMap.get(inst.sopDefinitionId)
            const progress = computeInstanceProgress(inst, def)
            const currentNodeName = resolveCurrentNodeName(inst, def)
            const isRunning = inst.status === 'running'
            const isPaused = inst.status === 'paused'
            const canControl = isRunning || isPaused
            const action = actionLoading[inst.id]

            return (
              <motion.div
                key={inst.id}
                layout
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={`p-2.5 rounded-xl border transition-colors ${
                  isRunning ? 'border-emerald-500/30 bg-emerald-500/[0.03]' :
                  inst.status === 'failed' ? 'border-rose-500/30 bg-rose-500/[0.03]' :
                  inst.status === 'paused' ? 'border-amber-500/30 bg-amber-500/[0.03]' :
                  'border-border/60 bg-secondary/30'
                }`}
              >
                {/* 头部：名称 + 状态徽章 */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`text-[10px] ${isRunning ? 'animate-pulse' : ''}`}>
                    {isRunning ? '▶' : inst.status === 'paused' ? '⏸' : inst.status === 'completed' ? '✅' : inst.status === 'failed' ? '❌' : '⏹'}
                  </span>
                  <span className="text-[11px] font-semibold truncate flex-1">{inst.sopName}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${statusBadgeClass(inst.status)}`}>
                    {statusLabel(inst.status)}
                  </span>
                </div>

                {/* 当前节点 */}
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5">
                  {isRunning ? <Zap className="w-2.5 h-2.5 text-emerald-500" /> : <Clock className="w-2.5 h-2.5" />}
                  <span>当前节点：</span>
                  <span className="text-foreground font-medium truncate">{currentNodeName}</span>
                </div>

                {/* 进度条 */}
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-0.5">
                    <span>进度</span>
                    <span className="font-mono">
                      {progress.completed}/{progress.total} · {progress.percent}%
                    </span>
                  </div>
                  <Progress
                    value={progress.percent}
                    className={`h-1.5 ${
                      inst.status === 'failed' ? '[&>[data-slot=progress-indicator]]:bg-rose-500' :
                      inst.status === 'paused' ? '[&>[data-slot=progress-indicator]]:bg-amber-500' :
                      inst.status === 'completed' ? '[&>[data-slot=progress-indicator]]:bg-sky-500' : ''
                    }`}
                  />
                </div>

                {/* 底部：时间 + 控制按钮 */}
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {new Date(inst.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 启动
                  </span>
                  {canControl && (
                    <div className="flex items-center gap-1">
                      {isRunning && (
                        <button
                          onClick={() => handlePause(inst)}
                          disabled={!!action}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 disabled:opacity-50 apple-btn"
                          aria-label="暂停 SOP"
                        >
                          {action === 'pause' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Pause className="w-2.5 h-2.5" />}
                          暂停
                        </button>
                      )}
                      <button
                        onClick={() => handleAbort(inst)}
                        disabled={!!action}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] rounded bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 disabled:opacity-50 apple-btn"
                        aria-label="终止 SOP"
                      >
                        {action === 'abort' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Square className="w-2.5 h-2.5" />}
                        终止
                      </button>
                    </div>
                  )}
                  {inst.status === 'completed' && (
                    <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      {inst.completedAt ? new Date(inst.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''} 完成
                    </span>
                  )}
                  {inst.status === 'failed' && (
                    <span className="flex items-center gap-0.5 text-[9px] text-rose-600 dark:text-rose-400">
                      <AlertCircle className="w-2.5 h-2.5" />
                      执行失败
                    </span>
                  )}
                  {inst.status === 'aborted' && (
                    <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                      <Hand className="w-2.5 h-2.5" />
                      已终止
                    </span>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
