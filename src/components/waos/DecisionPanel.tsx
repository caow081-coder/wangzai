'use client'

import { useOpsStore, type LeadForm } from '@/store/useOpsStore'
import {
  Sparkles, Flame, TrendingUp, Clock, Tag, ChevronRight, ChevronDown,
  MessageSquare, ArrowUpRight, Hand, CheckCircle2, Bot, User, Shield,
  Star, Zap, Eye, AlertTriangle, Cpu, Loader2, Car, Wallet, Smile, Home,
} from 'lucide-react'
import { toast } from 'sonner'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
// Phase 6: 工作台 SOP 触发器（运行按钮 + 实例状态卡片）
import { SopRunButton, SopInstanceCard } from './SopRunner'

export function DecisionPanel() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* 顶部固定监控条 */}
      <MonitorBar />

      {/* 压测监控面板（可折叠，始终显示） */}
      <StressMonitorPanel />

      {/* 滚动区域 */}
      <div className="flex-1 min-h-0 overflow-y-auto waos-scrollbar">
        {!lead ? <EmptyState /> : (
          <>
            {/* 客户头部 */}
            <LeadHeader />

            {/* SOP 执行状态卡片（Phase 6：紧跟客户信息，展示当前客户运行中的 SOP 实例）*/}
            <SopInstanceCard />

        {/* SalesCopilot (AI 副驾 4字段) */}
        <SalesCopilot />

        {/* 动态线索表单 4 字段（模块7） */}
        <LeadFormSection key={lead.id} />

        {/* 成交/流失预测 */}
        <Predictions />

        {/* 快捷动作（提到前面）*/}
        <Actions />

        {/* Phase 6: 运行 SOP 下拉按钮（紧跟快捷动作） */}
        <div className="px-3 pb-3 -mt-1">
          <SopRunButton />
        </div>

        {/* 推荐话术（提到前面）*/}
        <ReplySuggestions />

        {/* 客户记忆 L1-L4 */}
        <CustomerMemory />

        {/* WHY THIS DECISION */}
        <WhyDecision />

        {/* 状态机 */}
        <StateMachine />

        {/* Persona */}
        <PersonaCard />
          </>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-4 shadow-sm">
        <Sparkles className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-[15px] font-semibold mb-1">WAOS 决策面板</h3>
      <p className="text-[12px] text-muted-foreground max-w-[240px] leading-relaxed">
        从左侧微信客户端选择一位客户，查看 AI 决策依据、状态流转、推荐话术
      </p>
    </div>
  )
}

// ─── 折叠区段通用组件（UI-COMPACT：长尾 section 默认折叠）─────
function CollapsibleSection({
  icon, title, badge, defaultOpen = false, children,
}: {
  icon: React.ReactNode
  title: string
  badge?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  // 使用 div + role="button" 而非 <button>：避免 badge 中包含 <button>（如「编辑人设」）
  // 时触发 React DOM 嵌套警告 "button cannot contain a nested button"
  const handleToggle = () => setOpen(o => !o)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleToggle()
    }
  }
  return (
    <div className="border-b border-border/60">
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors apple-btn cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
      >
        <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <h3 className="text-[12px] font-semibold flex-1 text-left truncate">{title}</h3>
        {badge}
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── 顶部固定监控条 ──────────────────────────────────────────
function MonitorBar() {
  const metrics = useOpsStore(s => s.metrics)
  const circuitState = useOpsStore(s => s.llmCircuitState)
  const handoffCount = useOpsStore(s => s.handoffQueue.length)
  const antiBan = useOpsStore(s => s.antiBanStats)
  const eventBus = useOpsStore(s => s.eventBusStats)
  const openProDrawer = useOpsStore(s => s.openProDrawer)

  // 紧凑版（UI-COMPACT）：高度从 ~h-9 缩到 ~h-7，字号普遍 -1px
  return (
    <div className="shrink-0 grid grid-cols-5 gap-px bg-border/40 border-b border-border/60">
      {/* HOT */}
      <button
        onClick={() => { openProDrawer(); window.dispatchEvent(new CustomEvent('waos:proTab', { detail: 'scheduler' })) }}
        className="bg-card px-1.5 py-1.5 hover:bg-muted/50 active:bg-muted transition-colors text-center group apple-btn"
      >
        <div className={`text-[14px] font-bold font-mono leading-none ${metrics.hotCount > 0 ? 'text-rose-500' : 'text-muted-foreground'}`}>
          {metrics.hotCount}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">热门</div>
      </button>

      {/* 队列 */}
      <button
        onClick={() => { openProDrawer(); window.dispatchEvent(new CustomEvent('waos:proTab', { detail: 'scheduler' })) }}
        className="bg-card px-1.5 py-1.5 hover:bg-muted/50 active:bg-muted transition-colors text-center group apple-btn"
      >
        <div className={`text-[14px] font-bold font-mono leading-none ${metrics.queueDepth > 10 ? 'text-amber-500' : 'text-foreground'}`}>
          {metrics.queueDepth}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">队列</div>
      </button>

      {/* AI 熔断 */}
      <button
        onClick={() => { openProDrawer(); window.dispatchEvent(new CustomEvent('waos:proTab', { detail: 'ai' })) }}
        className="bg-card px-1.5 py-1.5 hover:bg-muted/50 active:bg-muted transition-colors text-center group apple-btn"
      >
        <div className={`text-[12px] font-bold font-mono leading-none ${
          circuitState === 'open' ? 'text-rose-500' :
          circuitState === 'half-open' ? 'text-amber-500' : 'text-emerald-500'
        }`}>
          {circuitState === 'open' ? '熔断' : circuitState === 'half-open' ? '探测' : '正常'}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">AI</div>
      </button>

      {/* 人工接管 */}
      <button
        onClick={() => { openProDrawer(); window.dispatchEvent(new CustomEvent('waos:proTab', { detail: 'channel' })) }}
        className="bg-card px-1.5 py-1.5 hover:bg-muted/50 active:bg-muted transition-colors text-center group apple-btn"
      >
        <div className={`text-[14px] font-bold font-mono leading-none ${handoffCount > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
          {handoffCount}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">接管</div>
      </button>

      {/* 事件总线 */}
      <button
        onClick={() => { openProDrawer(); window.dispatchEvent(new CustomEvent('waos:proTab', { detail: 'infra' })) }}
        className="bg-card px-1.5 py-1.5 hover:bg-muted/50 active:bg-muted transition-colors text-center group apple-btn"
      >
        <div className={`text-[14px] font-bold font-mono leading-none ${eventBus.pending > 10 ? 'text-amber-500' : 'text-foreground'}`}>
          {eventBus.pending}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">待处理</div>
      </button>
    </div>
  )
}

// ─── SalesCopilot AI 副驾（紧凑 1 行 4 列）────────────────────
function SalesCopilot() {
  const copilot = useOpsStore(s => s.salesCopilot)
  if (!copilot) return null

  const probColor = copilot.dealProbability >= 70 ? 'text-emerald-600' : copilot.dealProbability >= 40 ? 'text-amber-600' : 'text-muted-foreground'

  // 4 字段紧凑横排：成交概率 / 当前阶段 / 推荐策略 / 下一步
  const cells = [
    { label: '成交', value: `${copilot.dealProbability}%`, color: probColor, title: `成交概率 ${copilot.dealProbability}%` },
    { label: '阶段', value: copilot.stage, color: 'text-foreground', title: '当前阶段' },
    { label: '策略', value: copilot.strategy, color: 'text-primary', title: '推荐策略' },
    { label: '下一步', value: copilot.nextAction, color: 'text-foreground', title: '下一步动作' },
  ]

  return (
    <div className="p-3 border-b border-border/60">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center">
          <Bot className="w-3 h-3 text-primary" />
        </div>
        <h3 className="text-[12px] font-semibold">AI 副驾</h3>
        <span className="text-[9px] text-muted-foreground">决策依据</span>
        {copilot.riskFlag && (
          <span className="ml-auto flex items-center gap-1 text-[9px] text-rose-600">
            <AlertTriangle className="w-2.5 h-2.5" />
            {copilot.riskFlag}
          </span>
        )}
        {copilot.recommendedCase && (
          <span className="flex items-center gap-1 text-[9px] text-emerald-600">
            <CheckCircle2 className="w-2.5 h-2.5" />
            {copilot.recommendedCase}
          </span>
        )}
      </div>

      {/* 4 字段 1 行 4 列紧凑横排 */}
      <div className="grid grid-cols-4 gap-1.5">
        {cells.map((c, i) => (
          <div key={i} className="p-1.5 rounded-lg bg-secondary/50 min-w-0" title={c.title}>
            <div className="text-[9px] text-muted-foreground mb-0.5">{c.label}</div>
            <div className={`text-[11px] font-semibold truncate ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 动态线索表单 4 字段（模块7）──────────────────────────────
// 字段：意向车型 / 预算范围 / 情绪状态 / 家庭情况
// 修改后 2 秒内字段背景绿色高亮闪烁，2 秒后恢复
const CAR_MODELS = ['C级', 'GLC', 'GLE', 'E级', 'S级', 'GLC Coupe', 'EQE', '迈巴赫', 'AMG', '其他']
const BUDGET_RANGES = ['30万以下', '30-50万', '50-80万', '80-120万', '120万以上']
const FAMILY_STATUS = ['单身', '情侣', '小家庭三口', '二孩家庭', '三代同堂']

// 情绪状态 emoji：0=愤怒 / 50=平静 / 100=兴奋
function emotionEmoji(v: number): string {
  if (v < 20) return '😡'  // 愤怒
  if (v < 40) return '😠'  // 不满
  if (v < 60) return '😐'  // 平静
  if (v < 80) return '🙂'  // 满意
  return '🤩'  // 兴奋
}
function emotionLabel(v: number): string {
  if (v < 20) return '愤怒'
  if (v < 40) return '不满'
  if (v < 60) return '平静'
  if (v < 80) return '满意'
  return '兴奋'
}

function LeadFormSection() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)
  const updateLeadForm = useOpsStore(s => s.updateLeadForm)

  // 字段闪烁控制：每个字段记录一个时间戳，2 秒内显示绿色高亮
  // 用 ref + state 双轨：ref 立即写入、state 触发渲染
  // 注：父组件用 key={lead.id} 强制切换线索时 remount，所以这里 useState 初始化即可，
  //     不需要 useEffect 同步外部 prop 变化（避免 setState-in-effect 反模式）。
  const [flash, setFlash] = useState<{ carModel: number; budgetRange: number; emotionState: number; familyStatus: number }>({
    carModel: 0, budgetRange: 0, emotionState: 0, familyStatus: 0,
  })
  const timersRef = useRef<Record<keyof LeadForm, ReturnType<typeof setTimeout> | null>>({
    carModel: null, budgetRange: null, emotionState: null, familyStatus: null,
  })

  // 情绪 Slider 本地状态：拖动过程中只更新本地，松手时（onValueCommit）才提交到 store + 触发闪烁
  // 避免拖动一次产生多次 version +1。初始化从当前 lead 读取（依赖 key remount）。
  const [localEmotion, setLocalEmotion] = useState<number>(
    () => lead?.leadForm?.emotionState ?? 50
  )

  // 卸载时清理所有未触发的定时器（cleanup-only，无 setState）
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(t => t && clearTimeout(t))
      timersRef.current = { carModel: null, budgetRange: null, emotionState: null, familyStatus: null }
    }
  }, [])

  if (!lead) return null

  const form = lead.leadForm || {}

  // 触发某字段闪烁：写入当前时间戳，2 秒后清零
  const triggerFlash = (key: keyof LeadForm) => {
    const now = Date.now()
    setFlash(prev => ({ ...prev, [key]: now }))
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]!)
    timersRef.current[key] = setTimeout(() => {
      setFlash(prev => ({ ...prev, [key]: 0 }))
      timersRef.current[key] = null
    }, 2000)
  }

  // 通用：更新某字段值并触发闪烁（用于 Select 类字段，每次都是一次完整提交）
  const handleUpdate = (key: keyof LeadForm, value: string | number) => {
    updateLeadForm(lead.id, { [key]: value } as Partial<LeadForm>)
    triggerFlash(key)
  }

  // Slider 专用：拖动中只更新本地视觉；松手时提交到 store + 触发闪烁
  const handleEmotionChange = (vals: number[]) => setLocalEmotion(vals[0])
  const handleEmotionCommit = (vals: number[]) => {
    // 只有值真正变化才提交（避免点击但不拖动也产生 +1）
    if (vals[0] !== (form.emotionState ?? 50)) {
      updateLeadForm(lead.id, { emotionState: vals[0] })
      triggerFlash('emotionState')
    }
  }

  // 闪烁动画配置：从 emerald/30 → emerald/10 → emerald/30 → transparent，2 秒
  const flashTransition = {
    backgroundColor: ['rgba(16,185,129,0.30)', 'rgba(16,185,129,0.10)', 'rgba(16,185,129,0.30)', 'rgba(16,185,129,0)'],
    transition: { duration: 2, times: [0, 0.33, 0.66, 1], ease: 'easeInOut' as const },
  }

  return (
    <div className="p-3 border-b border-border/60">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center">
          <Tag className="w-3 h-3 text-amber-500" />
        </div>
        <h3 className="text-[12px] font-semibold">线索表单</h3>
        <span className="text-[9px] text-muted-foreground">4 字段 · 实时回填</span>
        <span className="text-[9px] font-mono text-muted-foreground ml-auto">v{lead.version}</span>
      </div>

      {/* 4 字段 1 行 4 列紧凑横排（UI-COMPACT）*/}
      <div className="grid grid-cols-4 gap-1.5">
        {/* 意向车型 */}
        <motion.div
          className="rounded-lg p-1.5 min-w-0"
          animate={flash.carModel ? flashTransition : { backgroundColor: 'rgba(0,0,0,0)' }}
        >
          <Label className="text-[9px] text-muted-foreground mb-1 flex items-center gap-0.5">
            <Car className="w-2.5 h-2.5" /> 车型
          </Label>
          <Select
            value={form.carModel || ''}
            onValueChange={v => handleUpdate('carModel', v)}
          >
            <SelectTrigger className="h-7 text-[10px] w-full px-1.5" size="sm">
              <SelectValue placeholder="选择…" />
            </SelectTrigger>
            <SelectContent>
              {CAR_MODELS.map(m => (
                <SelectItem key={m} value={m} className="text-[11px]">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>

        {/* 预算范围 */}
        <motion.div
          className="rounded-lg p-1.5 min-w-0"
          animate={flash.budgetRange ? flashTransition : { backgroundColor: 'rgba(0,0,0,0)' }}
        >
          <Label className="text-[9px] text-muted-foreground mb-1 flex items-center gap-0.5">
            <Wallet className="w-2.5 h-2.5" /> 预算
          </Label>
          <Select
            value={form.budgetRange || ''}
            onValueChange={v => handleUpdate('budgetRange', v)}
          >
            <SelectTrigger className="h-7 text-[10px] w-full px-1.5" size="sm">
              <SelectValue placeholder="选择…" />
            </SelectTrigger>
            <SelectContent>
              {BUDGET_RANGES.map(b => (
                <SelectItem key={b} value={b} className="text-[11px]">{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>

        {/* 情绪状态（紧凑版：emoji + 小 Slider）*/}
        <motion.div
          className="rounded-lg p-1.5 min-w-0"
          animate={flash.emotionState ? flashTransition : { backgroundColor: 'rgba(0,0,0,0)' }}
        >
          <div className="flex items-center justify-between mb-1">
            <Label className="text-[9px] text-muted-foreground flex items-center gap-0.5">
              <Smile className="w-2.5 h-2.5" /> 情绪
            </Label>
            <span className="text-[10px] font-mono font-semibold tabular-nums">
              {emotionEmoji(localEmotion)}{localEmotion}
            </span>
          </div>
          <Slider
            value={[localEmotion]}
            min={0}
            max={100}
            step={1}
            onValueChange={handleEmotionChange}
            onValueCommit={handleEmotionCommit}
            className="w-full"
          />
        </motion.div>

        {/* 家庭情况 */}
        <motion.div
          className="rounded-lg p-1.5 min-w-0"
          animate={flash.familyStatus ? flashTransition : { backgroundColor: 'rgba(0,0,0,0)' }}
        >
          <Label className="text-[9px] text-muted-foreground mb-1 flex items-center gap-0.5">
            <Home className="w-2.5 h-2.5" /> 家庭
          </Label>
          <Select
            value={form.familyStatus || ''}
            onValueChange={v => handleUpdate('familyStatus', v)}
          >
            <SelectTrigger className="h-7 text-[10px] w-full px-1.5" size="sm">
              <SelectValue placeholder="选择…" />
            </SelectTrigger>
            <SelectContent>
              {FAMILY_STATUS.map(f => (
                <SelectItem key={f} value={f} className="text-[11px]">{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>
      </div>

      <AnimatePresence>
        {(flash.carModel || flash.budgetRange || flash.emotionState || flash.familyStatus) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 overflow-hidden"
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>已回填，版本号 +1 → v{lead.version}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── 成交/流失预测（紧凑版）───────────────────────────────
function Predictions() {
  const pred = useOpsStore(s => s.predictions)
  if (!pred) return null

  return (
    <div className="p-3 border-b border-border/60">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-purple-500/10 flex items-center justify-center">
          <TrendingUp className="w-3 h-3 text-purple-500" />
        </div>
        <h3 className="text-[12px] font-semibold">预测分析</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
          <div className="text-[10px] text-muted-foreground">成交概率</div>
          <div className="text-[16px] font-bold text-emerald-600 mt-0.5">{pred.dealProbability}%</div>
        </div>
        <div className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/20">
          <div className="text-[10px] text-muted-foreground">流失概率</div>
          <div className="text-[16px] font-bold text-rose-600 mt-0.5">{pred.churnProbability}%</div>
        </div>
      </div>

      <div className="mt-1.5 space-y-1 text-[10px]">
        <div className="flex items-center justify-between p-1.5 rounded bg-secondary/50">
          <span className="text-muted-foreground">最佳联系时间</span>
          <span className="font-semibold">{pred.bestContactTime}</span>
        </div>
        <div className="flex items-center justify-between p-1.5 rounded bg-secondary/50">
          <span className="text-muted-foreground">预估价值</span>
          <span className="font-semibold text-emerald-600">¥{pred.estimatedValue}</span>
        </div>
      </div>
    </div>
  )
}

// ─── 客户记忆 L1-L4（默认折叠）──────────────────────────────
function CustomerMemory() {
  const mem = useOpsStore(s => s.customerMemory)
  if (!mem) return null

  return (
    <CollapsibleSection
      icon={<Eye className="w-3 h-3 text-sky-500" />}
      title="客户记忆"
      badge={<span className="text-[9px] text-muted-foreground">4层引擎</span>}
    >
      {/* L1 短期记忆 */}
      <div className="mb-2">
        <div className="text-[10px] text-muted-foreground mb-1">L1 短期（最近{mem.l1_short.length}条）</div>
        <div className="space-y-0.5 max-h-20 overflow-y-auto waos-scrollbar">
          {mem.l1_short.slice(-5).map((m, i) => (
            <div key={i} className="text-[10px] truncate">
              <span className={`font-medium ${m.role === 'user' ? 'text-foreground' : 'text-primary'}`}>
                {m.role === 'user' ? '客户' : m.role === 'human' ? '人工' : 'AI'}:
              </span>
              <span className="text-muted-foreground ml-1">{m.content.slice(0, 40)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* L2 长期画像 */}
      {mem.l2_profile.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] text-muted-foreground mb-1">L2 画像</div>
          <div className="flex flex-wrap gap-1">
            {mem.l2_profile.map((p, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-foreground">{p.key}: {p.value}</span>
            ))}
          </div>
        </div>
      )}

      {/* L3 语义记忆 */}
      {mem.l3_semantic.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] text-muted-foreground mb-1">L3 语义检索</div>
          {mem.l3_semantic.map((s, i) => (
            <div key={i} className="text-[10px] p-1.5 rounded bg-sky-500/5 border border-sky-500/20">
              <span className="text-foreground">{s.memory}</span>
              <span className="text-[9px] text-muted-foreground ml-1">({(s.score * 100).toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      )}

      {/* L4 决策记忆 */}
      {mem.l4_decision.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">L4 决策记忆</div>
          {mem.l4_decision.map((d, i) => (
            <div key={i} className="text-[10px] flex items-center gap-1.5 p-1.5 rounded bg-emerald-500/5 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span className="text-foreground">{d.strategy}</span>
              <span className="text-emerald-600 font-semibold">{d.result}</span>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}

// ─── 压测监控面板 ────────────────────────────────────────────
function StressMonitorPanel() {
  const sm = useOpsStore(s => s.stressMonitor)
  const startStressMonitor = useOpsStore(s => s.startStressMonitor)
  const stopStressMonitor = useOpsStore(s => s.stopStressMonitor)
  const [expanded, setExpanded] = useState(false)

  const durationMin = sm.startedAt ? Math.floor((Date.now() - sm.startedAt) / 60000) : 0
  const intervalMin = Math.floor(sm.intervalMs / 60000)
  const lastRoundAgo = sm.lastRoundAt ? Math.floor((Date.now() - sm.lastRoundAt) / 1000) : 0

  return (
    <div className="shrink-0 border-b border-border/60 bg-card">
      {/* 头部条 */}
      <div className="px-3 py-1.5 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${sm.running ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
        <span className="text-[10px] font-semibold">压测监控</span>
        {sm.running && (
          <span className="text-[9px] font-mono text-muted-foreground">
            第{sm.currentRound}轮 · {durationMin}分钟 · 每{intervalMin}分钟
          </span>
        )}
        <div className="flex-1" />
        {sm.running ? (
          <button onClick={stopStressMonitor} className="px-2 py-0.5 text-[10px] rounded bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 apple-btn">
            停止
          </button>
        ) : (
          <button onClick={startStressMonitor} className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 apple-btn">
            启动压测
          </button>
        )}
        <button onClick={() => setExpanded(!expanded)} className="p-0.5 text-muted-foreground hover:text-foreground" aria-label={expanded ? '收起压测监控' : '展开压测监控'} aria-expanded={expanded}>
          <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* 统计行（始终显示） */}
      {sm.currentRound > 0 && (
        <div className="px-3 pb-1.5 flex items-center gap-3 text-[10px] font-mono">
          <span className="text-emerald-600">✅{sm.totalPass}</span>
          <span className={sm.totalFail > 0 ? 'text-rose-600' : 'text-muted-foreground'}>❌{sm.totalFail}</span>
          <span className="text-amber-600">⚠️{sm.totalWarn}</span>
          <span className="text-muted-foreground ml-auto">{lastRoundAgo}秒前</span>
        </div>
      )}

      {/* 展开详情 */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* 上一轮结果 */}
          {sm.lastRoundResults.length > 0 && (
            <div>
              <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1">第{sm.currentRound}轮结果 ({sm.lastRoundResults.length}项)</div>
              <div className="space-y-0.5 max-h-40 overflow-y-auto waos-scrollbar">
                {sm.lastRoundResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className={r.status === 'PASS' ? 'text-emerald-500' : r.status === 'FAIL' ? 'text-rose-500' : 'text-amber-500'}>
                      {r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️'}
                    </span>
                    <span className="text-muted-foreground w-12">{r.category}</span>
                    <span className="text-foreground flex-1 truncate">{r.test}</span>
                    <span className="text-muted-foreground truncate max-w-[120px]">{r.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 历史趋势 */}
          {sm.history.length > 1 && (
            <div>
              <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1">历史趋势 (最近{sm.history.length}轮)</div>
              <div className="flex items-end gap-0.5 h-12">
                {sm.history.map((h, i) => {
                  const total = h.pass + h.fail + h.warn
                  const passPct = total > 0 ? (h.pass / total) * 100 : 0
                  const hasFail = h.fail > 0
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center" title={`第${h.round}轮: ✅${h.pass} ❌${h.fail} ${h.duration}ms`}>
                      <div className={`w-full rounded-sm ${hasFail ? 'bg-rose-500/60' : 'bg-emerald-500/60'}`} style={{ height: `${Math.max(4, passPct * 0.4)}px` }} />
                      <span className="text-[7px] text-muted-foreground mt-0.5">{h.round}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 错误列表 */}
          {sm.errors.length > 0 && (
            <div>
              <div className="text-[9px] font-semibold text-rose-500 uppercase mb-1">错误记录 ({sm.errors.length})</div>
              <div className="space-y-0.5 max-h-20 overflow-y-auto waos-scrollbar">
                {sm.errors.slice(-10).map((e, i) => (
                  <div key={i} className="text-[9px] font-mono text-rose-600">
                    [R{e.round}] {e.category}/{e.test}: {e.msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 说明 */}
          <div className="text-[9px] text-muted-foreground pt-1 border-t border-border/40">
            真实时间压测 · 每{intervalMin}分钟自动执行一轮 · 每轮覆盖12个维度(页面/AI/安全11项/渠道/LLM/逆向/API/并发/攻击向量10项) · 不停运行直到手动停止
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 客户头部（紧凑版：p-4 → p-3，意向分/标签同栏）─────────
function LeadHeader() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)
  if (!lead) return null

  const isHot = lead.stage === 'hot'
  const isConverted = lead.stage === 'converted'

  // 英文标签翻译成中文
  const tagMap: Record<string, string> = {
    'high_intent': '意向高',
    'price_sensitive': '价格敏感',
    'high_value': '高价值',
    'product_education': '需科普',
    'referral': '转介绍',
    'converted': '已成交',
  }

  return (
    <div className="p-3 border-b border-border/60">
      <div className="flex items-start gap-2.5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-[14px] font-semibold text-white shrink-0 shadow-sm"
          style={{ background: lead.personaColor || '#86868b' }}
        >
          {lead.userName.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[14px] font-semibold truncate">{lead.userName}</h2>
            {isHot && <Flame className="w-3.5 h-3.5 text-rose-500" />}
            {isConverted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
            <span className={`ml-auto px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${
              isHot ? 'bg-rose-500/10 text-rose-600' :
              isConverted ? 'bg-emerald-500/10 text-emerald-600' :
              lead.stage === 'blocked' ? 'bg-amber-500/10 text-amber-600' :
              'bg-secondary text-muted-foreground'
            }`}>
              {stageLabel(lead.stage)}
            </span>
          </div>
          {/* 意向分 + 标签同一行（紧凑）*/}
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground flex-wrap">
            <span>{sourceLabel(lead.source)}</span>
            <span>·</span>
            <span className="font-semibold text-foreground">意向{lead.priorityScore.toFixed(0)}分</span>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {timeAgo(lead.lastTouchAt)}
            </span>
            {lead.tags.map(t => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
                #{tagMap[t] || t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── WHY THIS DECISION ───────────────────────────────────────
function WhyDecision() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)
  if (!lead) return null

  const f = lead.features
  const reasons = [
    { label: '意图极强', value: f.intent, score: lead.intentScore, icon: <TrendingUp className="w-3 h-3" />, positive: f.intent > 20 },
    { label: '高价值标签', value: f.value, score: lead.valueScore, icon: <Tag className="w-3 h-3" />, positive: f.value > 20 },
    { label: '阶段分', value: f.stage, score: null, icon: <Star className="w-3 h-3" />, positive: f.stage > 15 },
    { label: '人设匹配', value: f.persona, score: null, icon: <Bot className="w-3 h-3" />, positive: f.persona > 5 },
    { label: '最近活跃', value: f.recency, score: null, icon: <Clock className="w-3 h-3" />, positive: f.recency > 50 },
    { label: '渠道权重', value: f.channel, score: null, icon: <Zap className="w-3 h-3" />, positive: f.channel > 50 },
  ].filter(r => r.positive)

  return (
    <CollapsibleSection
      icon={<Eye className="w-3 h-3 text-primary" />}
      title="AI 为什么这么回复？"
      badge={<span className="text-[10px] text-muted-foreground">意向{lead.priorityScore.toFixed(0)}分 · 关键因素</span>}
    >
      <ul className="space-y-1.5">
        {reasons.length > 0 ? reasons.map((r, i) => (
          <li key={i} className="flex items-center gap-2 text-[12px]">
            <span className="text-primary">{r.icon}</span>
            <span className="flex-1">{r.label}</span>
            {r.score !== null && (
              <span className="text-[10px] text-muted-foreground font-mono">分值: {r.score.toFixed(0)}</span>
            )}
            <span className="text-[10px] font-mono font-semibold text-primary">+{r.value.toFixed(1)}</span>
          </li>
        )) : (
          <li className="text-[11px] text-muted-foreground">暂无正向特征</li>
        )}
      </ul>

      {f.penalty < 0 && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-rose-600">
          <Shield className="w-3 h-3" />
          <span>扣分: {f.penalty.toFixed(1)} {lead.isSpam ? '(广告号)' : lead.alreadyCustomer ? '(已购客户)' : ''}</span>
        </div>
      )}
    </CollapsibleSection>
  )
}

// ─── 状态机 ──────────────────────────────────────────────────
function StateMachine() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)
  if (!lead) return null

  const flow = [
    { id: 'new', label: '新客户' },
    { id: 'engaged', label: '沟通中' },
    { id: 'qualified', label: '意向高' },
    { id: 'hot', label: '热门' },
    { id: 'converted', label: '已成交' },
  ]
  const currentIdx = flow.findIndex(s => s.id === lead.stage)
  const isChurned = lead.stage === 'churned'
  const isBlocked = lead.stage === 'blocked'

  return (
    <CollapsibleSection
      icon={<ChevronRight className="w-3 h-3 text-sky-500" />}
      title="客户阶段"
      badge={(isChurned || isBlocked) ? (
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
          isBlocked ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'
        }`}>
          {isBlocked ? '人工接管' : '已流失'}
        </span>
      ) : undefined}
    >
      <div className="flex items-center gap-0.5 overflow-x-auto waos-scrollbar-x">
        {flow.map((s, i) => {
          const isPast = currentIdx > i
          const isCurrent = currentIdx === i
          return (
            <div key={s.id} className="flex items-center shrink-0">
              <div className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                isCurrent ? 'bg-primary text-primary-foreground shadow-sm' :
                isPast ? 'bg-primary/10 text-primary/70' :
                'bg-muted/50 text-muted-foreground'
              }`}>
                {s.label}
              </div>
              {i < flow.length - 1 && (
                <ChevronRight className={`w-3 h-3 mx-0.5 ${isPast ? 'text-primary/40' : 'text-muted-foreground/30'}`} />
              )}
            </div>
          )
        })}
      </div>
    </CollapsibleSection>
  )
}

// ─── Persona ────────────────────────────────────────────────
function PersonaCard() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)
  const activePersonaId = useOpsStore(s => s.activePersonaId)
  const personas = useOpsStore(s => s.personas)
  const setActivePersona = useOpsStore(s => s.setActivePersona)
  const openPersonaEditor = useOpsStore(s => s.openPersonaEditor)
  const autoOptimizePersona = useOpsStore(s => s.autoOptimizePersona)
  const [optimizing, setOptimizing] = useState(false)
  if (!lead) return null

  const persona = personas.find(p => p.id === activePersonaId) || personas[0]

  const handleOptimize = async () => {
    setOptimizing(true)
    await autoOptimizePersona(persona.id)
    setOptimizing(false)
    toast.success('AI 已自动校准人设参数')
  }

  return (
    <CollapsibleSection
      icon={<Bot className="w-3 h-3 text-amber-500" />}
      title="AI 人设"
      badge={
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">成交率 {(persona.cvr * 100).toFixed(0)}%</span>
          <button
            onClick={(e) => { e.stopPropagation(); openPersonaEditor(persona.id) }}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="编辑人设"
            aria-label="编辑人设"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
        </div>
      }
    >
      <div className="p-3 rounded-xl bg-secondary/50 flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${persona.gradient} flex items-center justify-center text-[16px] shrink-0`}>
          {persona.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold">{persona.name}</div>
          <div className="text-[10px] text-muted-foreground">{persona.description}</div>
        </div>
        {persona.autoOptimize && (
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">自动优化</span>
        )}
      </div>

      {/* 性格参数可视化 */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[
          { label: '亲和力', value: persona.personality.warmth },
          { label: '专业度', value: persona.personality.professionalism },
          { label: '幽默感', value: persona.personality.humor },
          { label: '紧迫感', value: persona.personality.pressure },
          { label: '耐心度', value: persona.personality.patience },
          { label: '权威感', value: persona.personality.authority },
        ].map((p, i) => (
          <div key={i} className="p-1.5 rounded-lg bg-secondary/50">
            <div className="text-[8px] text-muted-foreground">{p.label}</div>
            <div className="h-1 bg-muted rounded-full mt-0.5 overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${p.value}%` }} />
            </div>
            <div className="text-[8px] font-mono text-foreground mt-0.5">{p.value}</div>
          </div>
        ))}
      </div>

      {/* 人设切换 */}
      <div className="flex gap-1 mt-2 flex-wrap">
        {personas.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePersona(p.id)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all apple-btn ${
              p.id === activePersonaId ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
            title={p.name}
          >
            {p.avatar} {p.shortName}
          </button>
        ))}
      </div>

      {/* 人设专属能力（从 extendedActions 读取）*/}
      <div className="mt-3">
        <div className="text-[10px] text-muted-foreground mb-1.5">{persona.shortName}专属能力：</div>
        <div className="flex flex-wrap gap-1.5">
          {persona.extendedActions?.map((a) => (
            <button
              key={a.id}
              onClick={() => { useOpsStore.getState().setClientDraft(a.prompt); toast.success(`已应用：${a.label}`) }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-card border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all apple-btn"
            >
              <span>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* 自动校准按钮 */}
      <button
        onClick={handleOptimize}
        disabled={optimizing}
        className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-purple-500/10 text-purple-600 text-[11px] font-medium hover:bg-purple-500/20 transition-colors apple-btn disabled:opacity-50"
      >
        {optimizing ? (
          <><Loader2 className="w-3 h-3 animate-spin" /> AI 正在校准...</>
        ) : (
          <><Cpu className="w-3 h-3" /> AI 自动校准优化</>
        )}
      </button>
      <div className="text-[9px] text-muted-foreground mt-1 text-center">
        优化幅度: <span className={persona.optimizationScore >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{persona.optimizationScore >= 0 ? '+' : ''}{persona.optimizationScore.toFixed(1)}</span>
      </div>
    </CollapsibleSection>
  )
}

// ─── 推荐话术 ────────────────────────────────────────────────
function ReplySuggestions() {
  const suggestions = useOpsStore(s => s.replySuggestions)
  const loading = useOpsStore(s => s.suggestionsLoading)
  const applySuggestion = useOpsStore(s => s.applySuggestion)
  const generateReplySuggestions = useOpsStore(s => s.generateReplySuggestions)
  const activePersonaId = useOpsStore(s => s.activePersonaId)
  const personas = useOpsStore(s => s.personas)
  const persona = personas.find(p => p.id === activePersonaId) || personas[0]

  return (
    <div className="p-3 border-b border-border/60">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-emerald-500" />
        </div>
        <h3 className="text-[12px] font-semibold tracking-wide">推荐话术</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">{persona.shortName}风格</span>
        <button
          onClick={() => generateReplySuggestions()}
          className="p-1 rounded hover:bg-muted transition-colors apple-btn"
          aria-label="刷新推荐话术"
          title="刷新推荐话术"
          disabled={loading}
        >
          <svg className={`w-3 h-3 text-muted-foreground ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-9 rounded-lg bg-muted/50 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-2">暂无推荐</p>
      ) : (
        <div className="space-y-1.5">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              onClick={() => applySuggestion(s)}
              className="w-full text-left p-2 rounded-lg bg-card border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all apple-btn group"
            >
              <div className="flex items-start gap-1.5">
                <span className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">{i + 1}</span>
                <p className="flex-1 text-[11px] leading-relaxed">{s.content}</p>
              </div>
              <div className="flex items-center gap-1.5 mt-1 pl-4">
                <span className="text-[8px] px-1 rounded bg-secondary text-muted-foreground">{intentLabel(s.intent)}</span>
                <span className="text-[8px] text-muted-foreground">{(s.confidence * 100).toFixed(0)}%</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 快捷动作（紧凑版：大按钮 → 一行 4 个小图标按钮组）────────
function Actions() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)
  const openReplyStudio = useOpsStore(s => s.openReplyStudio)
  const sendClientAction = useOpsStore(s => s.sendClientAction)
  const markRead = useOpsStore(s => s.markRead)
  if (!lead) return null

  const actions = [
    {
      label: '回复', shortcut: 'R',
      icon: <MessageSquare className="w-3.5 h-3.5" />,
      cls: 'bg-primary text-primary-foreground hover:bg-primary/90',
      onClick: () => openReplyStudio(lead.id),
    },
    {
      label: '优先', shortcut: 'E',
      icon: <ArrowUpRight className="w-3.5 h-3.5" />,
      cls: 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20',
      onClick: () => sendClientAction('force_priority', lead.id),
    },
    {
      label: '转人工', shortcut: 'H',
      icon: <Hand className="w-3.5 h-3.5" />,
      cls: 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20',
      onClick: () => sendClientAction('human_handoff', lead.id),
    },
    {
      label: '完成', shortcut: '␣',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      cls: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      onClick: () => { markRead(lead.id); sendClientAction('mark_done', lead.id) },
    },
  ]

  return (
    <div className="p-3">
      <div className="flex items-center gap-1.5">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.onClick}
            aria-label={a.label}
            title={`${a.label} (${a.shortcut})`}
            className={`flex-1 flex items-center justify-center gap-1 h-8 rounded-lg text-[11px] font-medium active:scale-[0.98] transition-all apple-btn ${a.cls}`}
          >
            {a.icon}
            <span className="hidden sm:inline">{a.label}</span>
            <kbd className="text-[8px] px-0.5 py-px rounded bg-black/10 dark:bg-white/10">{a.shortcut}</kbd>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── 工具函数 ────────────────────────────────────────────────
function sourceLabel(source: string): string {
  return { wechat_dm: '微信私聊', comment: '评论', video: '视频号', douyin: '抖音' }[source] || source
}

function stageLabel(stage: string): string {
  return {
    new: '新建', engaged: '互动中', qualified: '已资质', hot: 'HOT',
    converted: '已成交', churned: '已流失', blocked: '人工接管',
  }[stage] || stage
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return `${Math.floor(diff / 86400000)}d`
}

function intentLabel(intent: string): string {
  return { greeting: '破冰', price: '价格', objection: '异议', closing: '成交', followup: '跟进', empathy: '共情' }[intent] || intent
}
