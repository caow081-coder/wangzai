'use client'

import { useOpsStore } from '@/store/useOpsStore'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Flame, Bot, Radio, Clock, TrendingUp, Lock, X, Shield, Zap, Cpu,
  AlertTriangle, Send, Heart, MessageSquare, Image as ImageIcon, Mic,
  Activity, Filter, GitBranch, Users, Bell, CheckCircle2, Play, Pause,
  RefreshCw, Plus, Eye, Database, Loader2,
} from 'lucide-react'
import { SchedulerView, MetricsView, FunnelView, AbView } from './RightPanel'
import { useState } from 'react'
import { toast } from 'sonner'

type Panel = 'scheduler' | 'ai' | 'channel' | 'lifecycle' | 'attribution' | 'infra' | 'metrics' | 'funnel' | 'ab' | 'audit' | 'llm' | 'crm'

// 通俗命名 + 介绍
const TABS: { id: Panel; label: string; icon: React.ReactNode; module: string; desc: string }[] = [
  { id: 'scheduler',  label: '谁先回',     icon: <Flame className="w-3.5 h-3.5" />,      module: '1', desc: '线索排队与优先级' },
  { id: 'ai',         label: 'AI 大脑',    icon: <Bot className="w-3.5 h-3.5" />,        module: '2', desc: '回复生成与安全' },
  { id: 'llm',        label: '大模型对接', icon: <Cpu className="w-3.5 h-3.5" />,        module: '2', desc: 'API/本地/代理/豆包逆向' },
  { id: 'channel',    label: '多平台',     icon: <Radio className="w-3.5 h-3.5" />,      module: '3', desc: '微信/抖音/视频号 + 防封' },
  { id: 'lifecycle',  label: '主动营销',   icon: <Clock className="w-3.5 h-3.5" />,      module: '4', desc: '唤醒/群发/客诉拦截' },
  { id: 'attribution',label: '效果复盘',   icon: <TrendingUp className="w-3.5 h-3.5" />, module: '5', desc: 'AB测试/漏斗/人设进化' },
  { id: 'infra',      label: '系统健康',   icon: <Lock className="w-3.5 h-3.5" />,       module: '6', desc: '事件总线/锁/监控' },
  { id: 'metrics',    label: '数据看板',   icon: <Activity className="w-3.5 h-3.5" />,   module: '6', desc: '实时指标' },
  { id: 'funnel',     label: '转化漏斗',   icon: <Filter className="w-3.5 h-3.5" />,     module: '5', desc: '从曝光到成交' },
  { id: 'ab',         label: 'AB 实验',    icon: <GitBranch className="w-3.5 h-3.5" />,  module: '5', desc: '人设/话术对比' },
  { id: 'audit',      label: '操作记录',   icon: <Shield className="w-3.5 h-3.5" />,     module: '6', desc: '谁做了什么' },
  { id: 'crm',        label: 'CRM 线索',  icon: <Database className="w-3.5 h-3.5" />,   module: '8', desc: '线索表 + 乐观锁' },
]

export function ProDrawer() {
  const open = useOpsStore(s => s.proDrawerOpen)
  const close = useOpsStore(s => s.closeProDrawer)
  const [panel, setPanel] = useState<Panel>('scheduler')

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent
        side="right"
        className="w-[600px] p-0 bg-background border-l border-border flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b border-border/60 bg-card shrink-0">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-sm font-semibold">控制台</SheetTitle>
            <span className="text-[10px] text-muted-foreground">6大模块 · 点击查看详情</span>
            <button onClick={close} className="ml-auto p-1 rounded hover:bg-muted">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <SheetDescription className="sr-only">WAOS 6大模块</SheetDescription>

          <div className="flex items-center gap-0.5 mt-2 flex-wrap">
            {TABS.map(t => {
              const active = panel === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setPanel(t.id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                  }`}
                  title={t.desc}
                >
                  <span className="text-[8px] opacity-40 font-mono">{t.module}</span>
                  {t.icon}
                  {t.label}
                </button>
              )
            })}
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto waos-scrollbar">
          {panel === 'scheduler' && <SchedulerView />}
          {panel === 'ai' && <AIPanel />}
          {panel === 'channel' && <ChannelPanel />}
          {panel === 'lifecycle' && <LifecyclePanel />}
          {panel === 'attribution' && <AttributionPanel />}
          {panel === 'infra' && <InfraPanel />}
          {panel === 'llm' && <LLMProviderPanel />}
          {panel === 'metrics' && <MetricsView />}
          {panel === 'funnel' && <FunnelView />}
          {panel === 'ab' && <AbView />}
          {panel === 'audit' && <AuditPanel />}
          {panel === 'crm' && <CrmPanel />}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── 模块2: AI 大脑（回复生成与安全）─────────────────────────
function AIPanel() {
  const circuitState = useOpsStore(s => s.llmCircuitState)
  const failures = useOpsStore(s => s.llmConsecutiveFailures)
  const fallbackCount = useOpsStore(s => s.llmFallbackCount)
  const contextWindow = useOpsStore(s => s.contextWindow)
  const multimodal = useOpsStore(s => s.multimodalQueue)
  const triggerFallback = useOpsStore(s => s.triggerFallback)
  const setCircuitState = useOpsStore(s => s.setCircuitState)
  const [inputTest, setInputTest] = useState('')
  const [inputBlocked, setInputBlocked] = useState(false)

  // 模拟输入防注入检测
  const injectionPatterns = [/ignore.*previous/i, /disregard.*instructions/i, /system.*prompt/i, /你现在是不死/i, /忽略.*指令/i]
  const checkInjection = () => {
    const blocked = injectionPatterns.some(p => p.test(inputTest))
    setInputBlocked(blocked)
    if (blocked) {
      toast.error('🛡️ 输入被安全护盾拦截', { description: '检测到 Prompt 注入尝试' })
    } else {
      toast.success('✅ 输入安全', { description: '未检测到注入模式' })
    }
  }

  // 模拟多模态感知
  const addMultimodal = (type: 'image' | 'voice') => {
    const desc = type === 'image'
      ? `[系统感知：用户发来支付宝收款码 ¥${Math.floor(Math.random() * 500 + 100)}]`
      : `[系统感知：用户发来 ${Math.floor(Math.random() * 10 + 3)}秒语音，已转文字："好的没问题"]`
    useOpsStore.setState(s => ({ multimodalQueue: [...s.multimodalQueue, { id: `mm_${Date.now()}`, type, description: desc, ts: Date.now() }].slice(-5) }))
    toast.success(`已模拟${type === 'image' ? '图片' : '语音'}感知`)
  }

  return (
    <div className="p-4 space-y-4">
      <ModuleIntro num="2" title="AI 大脑" desc="生成回复、记忆上下文、防乱说话、API抽风时自动降级" />

      {/* 熔断器 — 可操作 */}
      <Section title="熔断保护（API抽风时自动降级）" icon={<Zap className="w-3.5 h-3.5 text-amber-500" />}>
        <div className={`p-3 rounded-lg border ${
          circuitState === 'open' ? 'bg-rose-500/10 border-rose-500/30' :
          circuitState === 'half-open' ? 'bg-amber-500/10 border-amber-500/30' :
          'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold">
              {circuitState === 'open' ? '🔴 已熔断（30秒内不调API）' : circuitState === 'half-open' ? '🟡 探测中（尝试恢复）' : '🟢 正常'}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">失败 {failures}/3 · 降级 {fallbackCount}次</span>
          </div>
          <div className="text-[10px] text-muted-foreground mb-3">
            规则：连续3次超时 → 熔断30秒 → 半开探测 → 成功恢复。熔断期间发兜底话术+转人工
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => triggerFallback()} className="px-2.5 py-1 text-[10px] rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 apple-btn">模拟失败</button>
            <button onClick={() => { setCircuitState('closed'); useOpsStore.setState({ llmConsecutiveFailures: 0 }); toast.success('熔断器已重置') }} className="px-2.5 py-1 text-[10px] rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 apple-btn">重置恢复</button>
          </div>
        </div>
      </Section>

      {/* 多轮记忆 — 可视化窗口 */}
      <Section title="多轮记忆（滑动窗口防Token爆炸）" icon={<MessageSquare className="w-3.5 h-3.5 text-sky-500" />}>
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center justify-between text-[11px] mb-2">
            <span>保留最近 <b className="font-mono">{contextWindow}</b> 轮对话</span>
            <span className="text-[10px] text-muted-foreground">超出自动截断</span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className={`flex-1 h-6 rounded ${i < contextWindow ? 'bg-sky-500/60' : 'bg-muted'}`} title={`第${i + 1}轮`} />
            ))}
          </div>
        </div>
      </Section>

      {/* 多模态感知 — 可添加 */}
      <Section title="多模态感知（图片/语音自动转文字）" icon={<ImageIcon className="w-3.5 h-3.5 text-purple-500" />}>
        <div className="flex gap-1.5 mb-2">
          <button onClick={() => addMultimodal('image')} className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 apple-btn">
            <ImageIcon className="w-3 h-3" /> 模拟收图
          </button>
          <button onClick={() => addMultimodal('voice')} className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 apple-btn">
            <Mic className="w-3 h-3" /> 模拟收语音
          </button>
        </div>
        <div className="space-y-1">
          {multimodal.length === 0 ? (
            <div className="p-2 text-center text-[10px] text-muted-foreground bg-secondary/50 rounded">暂无多模态输入</div>
          ) : multimodal.map(m => (
            <div key={m.id} className="flex items-center gap-2 p-2 rounded bg-purple-500/5 border border-purple-500/20">
              {m.type === 'image' ? <ImageIcon className="w-3 h-3 text-purple-500" /> : <Mic className="w-3 h-3 text-purple-500" />}
              <span className="text-[10px] flex-1 font-mono">{m.description}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 双向安全护盾 — 可测试 */}
      <Section title="双向安全护盾（防注入+防违规）" icon={<Shield className="w-3.5 h-3.5 text-emerald-500" />}>
        <div className="p-3 rounded-lg bg-secondary/50 space-y-2">
          <div className="text-[10px] text-muted-foreground">测试输入防注入（输入"忽略之前指令"试试）:</div>
          <div className="flex gap-1.5">
            <input
              value={inputTest}
              onChange={e => setInputTest(e.target.value)}
              placeholder="输入测试文案…"
              className="flex-1 px-2 py-1 text-[11px] rounded bg-card border border-border/60 focus:outline-none focus:border-primary/40"
            />
            <button onClick={checkInjection} className="px-2.5 py-1 text-[10px] rounded bg-primary/10 text-primary hover:bg-primary/20 apple-btn">检测</button>
          </div>
          {inputBlocked && (
            <div className="text-[10px] text-rose-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> 已拦截：检测到 Prompt 注入
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

// ─── 模块3: 多平台（微信/抖音/视频号 + 防封）─────────────────
function ChannelPanel() {
  const channel = useOpsStore(s => s.activeChannel)
  const setChannel = useOpsStore(s => s.setActiveChannel)
  const antiBan = useOpsStore(s => s.antiBanStats)
  const handoffQueue = useOpsStore(s => s.handoffQueue)
  const resolveHandoff = useOpsStore(s => s.resolveHandoff)
  const addHandoff = useOpsStore(s => s.addHandoff)

  const channels = [
    { id: 'wechat' as const, label: '微信', color: '#07C160', desc: '私聊+朋友圈' },
    { id: 'wecom' as const,  label: '企业微信', color: '#5BB5F2', desc: '官方合规' },
    { id: 'douyin' as const, label: '抖音', color: '#FE2C55', desc: '评论+私信' },
    { id: 'video' as const,  label: '视频号', color: '#8B5CF6', desc: '评论+私信' },
  ]

  return (
    <div className="p-4 space-y-4">
      <ModuleIntro num="3" title="多平台" desc="统一管理微信/抖音/视频号，防封号，人工接管" />

      {/* 平台切换 — 可操作 */}
      <Section title="平台切换（选哪个平台的客户）" icon={<Radio className="w-3.5 h-3.5 text-cyan-500" />}>
        <div className="grid grid-cols-4 gap-2">
          {channels.map(c => (
            <button
              key={c.id}
              onClick={() => { setChannel(c.id); toast.success(`已切换到${c.label}`) }}
              className={`p-3 rounded-lg border text-center transition-all apple-btn ${
                channel === c.id ? 'text-white border-transparent' : 'bg-card border-border/60 hover:bg-muted/50'
              }`}
              style={channel === c.id ? { background: c.color } : {}}
            >
              <div className="text-[12px] font-semibold">{c.label}</div>
              <div className={`text-[9px] mt-0.5 ${channel === c.id ? 'text-white/80' : 'text-muted-foreground'}`}>{c.desc}</div>
            </button>
          ))}
        </div>
      </Section>

      {/* 防封引擎 — 可调参 */}
      <Section title="防封引擎（像真人一样发消息）" icon={<Shield className="w-3.5 h-3.5 text-amber-500" />}>
        <div className="space-y-2">
          <AntiBanRow label="看消息延迟" value={`${(antiBan.readingDelayMs / 1000).toFixed(1)}秒`} desc="收到消息先等一会再看" />
          <AntiBanRow label="打字延迟" value={`${(antiBan.typingDelayMs / 1000).toFixed(1)}秒`} desc="按字数算打字时间" />
          <AntiBanRow label="发送频控" value={`${antiBan.sentThisMin}/${antiBan.rateLimitPerMin} 每分钟`} desc="超了压队列" />
          <AntiBanRow label="文案防查重" value={antiBan.fingerprintApplied ? '已开启' : '关闭'} desc="末尾加随机空格" />
        </div>
        <button
          onClick={() => {
            useOpsStore.setState(s => ({ antiBanStats: { ...s.antiBanStats, sentThisMin: 0 } }))
            toast.success('频控计数已重置')
          }}
          className="mt-2 px-2.5 py-1 text-[10px] rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 apple-btn"
        >
          重置频控
        </button>
      </Section>

      {/* 人工接管 — 可添加/处理 */}
      <Section title={`人工接管（AI搞不定转给人）· ${handoffQueue.length}个待处理`} icon={<Users className="w-3.5 h-3.5 text-orange-500" />}>
        <button
          onClick={() => {
            const lead = useOpsStore.getState().leads[0]
            if (lead) { addHandoff(lead.id, lead.userName, '手动测试接管'); toast.success('已添加接管任务') }
          }}
          className="mb-2 px-2.5 py-1 text-[10px] rounded bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 apple-btn"
        >
          + 模拟添加接管
        </button>
        {handoffQueue.length === 0 ? (
          <div className="p-3 text-center text-[11px] text-muted-foreground bg-secondary/50 rounded-lg">暂无接管任务</div>
        ) : (
          <div className="space-y-1.5">
            {handoffQueue.map(h => (
              <div key={h.leadId + h.ts} className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/5 border border-orange-500/20">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold">{h.leadName}</div>
                  <div className="text-[9px] text-muted-foreground">{h.reason} · {new Date(h.ts).toLocaleTimeString('zh-CN', { hour12: false })}</div>
                </div>
                <span className="text-[9px] font-mono text-orange-600">P{h.priority}</span>
                <button onClick={() => { resolveHandoff(h.leadId); toast.success('已处理') }} className="px-2 py-1 text-[9px] rounded bg-orange-500/10 text-orange-600 hover:bg-orange-500/20">已处理</button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── 模块4: 主动营销（唤醒/群发/客诉）─────────────────────────
function LifecyclePanel() {
  const campaigns = useOpsStore(s => s.broadcastCampaigns)
  const wakeupTasks = useOpsStore(s => s.wakeupTasks)
  const addWakeupTask = useOpsStore(s => s.addWakeupTask)
  const triggerComplaint = useOpsStore(s => s.triggerComplaint)

  const simulateWakeup = (type: 'sleep_3d' | 'sleep_7d') => {
    const leads = useOpsStore.getState().leads
    const target = leads.find(l => l.stage === 'new' || l.stage === 'engaged')
    if (target) {
      addWakeupTask({
        id: `wakeup_${Date.now()}`,
        leadId: target.id,
        leadName: target.userName,
        type,
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        status: 'pending',
      })
      toast.success(`已创建${type === 'sleep_3d' ? '3天沉睡唤醒' : '7天沉睡唤醒'}任务`, { description: target.userName })
    }
  }

  return (
    <div className="p-4 space-y-4">
      <ModuleIntro num="4" title="主动营销" desc="沉睡客户唤醒、分群群发、客诉自动拦截" />

      {/* 沉睡唤醒 — 可触发 */}
      <Section title="沉睡唤醒（自动找回不说话的客户）" icon={<Clock className="w-3.5 h-3.5 text-blue-500" />}>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={() => simulateWakeup('sleep_3d')} className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-left hover:bg-blue-500/20 apple-btn">
            <div className="text-[11px] font-semibold text-blue-600">3天没说话的</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">→ 发避坑指南</div>
          </button>
          <button onClick={() => simulateWakeup('sleep_7d')} className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-left hover:bg-blue-500/20 apple-btn">
            <div className="text-[11px] font-semibold text-blue-600">7天没说话的</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">→ 发老客特惠</div>
          </button>
        </div>
        {wakeupTasks.length > 0 && (
          <div className="space-y-1">
            {wakeupTasks.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-2 p-1.5 rounded bg-blue-500/5 text-[10px]">
                <Clock className="w-3 h-3 text-blue-500" />
                <span className="flex-1">{t.leadName}</span>
                <span className="text-muted-foreground">{t.type === 'sleep_3d' ? '3天唤醒' : '7天唤醒'}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 群发排程 — 可查看进度 */}
      <Section title="分群群发（按标签定时发）" icon={<Send className="w-3.5 h-3.5 text-emerald-500" />}>
        <div className="space-y-2">
          {campaigns.map(c => (
            <div key={c.id} className="p-2.5 rounded-lg bg-secondary/50">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold">{c.name}</span>
                <span className="text-[9px] text-muted-foreground">{new Date(c.scheduledAt).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">#{c.tag}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(c.sent / c.total) * 100}%` }} />
                </div>
                <span className="text-[9px] font-mono">{c.sent}/{c.total}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground">频控：每人每天≤1次，每周≤2次</div>
      </Section>

      {/* 客诉拦截 — 可模拟 */}
      <Section title="客诉自动拦截（退款/骗子/投诉）" icon={<AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}>
        <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/20 mb-2">
          <div className="text-[10px] text-muted-foreground mb-1.5">监听关键词命中后：强制流失状态 + 拦截AI + P100人工接管</div>
          <div className="flex flex-wrap gap-1">
            {['退款', '骗子', '投诉', '报警', '315', '差评'].map(k => (
              <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600">{k}</span>
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            const lead = useOpsStore.getState().leads[0]
            if (lead) { triggerComplaint(lead.id, lead.userName); toast.error('已触发客诉拦截', { description: `${lead.userName} → 强制人工接管` }) }
          }}
          className="px-2.5 py-1 text-[10px] rounded bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 apple-btn"
        >
          模拟触发客诉
        </button>
      </Section>
    </div>
  )
}

// ─── 模块5: 效果复盘（AB/漏斗/人设进化）──────────────────────
function AttributionPanel() {
  const personaScores = useOpsStore(s => s.personaScores)
  const personas = useOpsStore(s => s.personas)
  const updatePersonaScore = useOpsStore(s => s.updatePersonaScore)

  return (
    <div className="p-4 space-y-4">
      <ModuleIntro num="5" title="效果复盘" desc="哪个话术/人设最赚钱？系统自动学习进化" />

      {/* 强化学习 — 可操作 */}
      <Section title="人设自我进化（成交加分/流失扣分）" icon={<Cpu className="w-3.5 h-3.5 text-purple-500" />}>
        <div className="space-y-2">
          {personas.map(p => {
            const score = personaScores[p.id] || 0
            const maxAbs = Math.max(...Object.values(personaScores).map(Math.abs), 15)
            const widthPct = (Math.abs(score) / maxAbs) * 100
            return (
              <div key={p.id} className="p-2.5 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[16px]">{p.avatar}</span>
                  <span className="text-[11px] font-semibold flex-1">{p.shortName}（{p.name.split('·')[1]?.trim() || p.name}）</span>
                  <span className={`text-[12px] font-mono font-bold ${score >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {score >= 0 ? '+' : ''}{score.toFixed(1)}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden flex mb-1.5">
                  {score >= 0 ? (
                    <div className="h-full bg-emerald-500 rounded-full ml-auto" style={{ width: `${widthPct}%` }} />
                  ) : (
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${widthPct}%` }} />
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { updatePersonaScore(p.id, 1.5); toast.success(`${p.shortName} +1.5（成交）`) }} className="flex-1 py-1 text-[9px] rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 apple-btn">+1.5 成交</button>
                  <button onClick={() => { updatePersonaScore(p.id, -1.0); toast.warning(`${p.shortName} -1.0（流失）`) }} className="flex-1 py-1 text-[9px] rounded bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 apple-btn">-1.0 流失</button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground">得分高的优先分配流量，系统越跑越聪明</div>
      </Section>

      {/* 归因路径 */}
      <Section title="转化归因（哪个渠道引来的最赚钱）" icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}>
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="text-[10px] text-muted-foreground mb-2">客户完整路径示例：</div>
          <div className="flex items-center gap-1 text-[10px] font-mono flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600">抖音评论</span>
            <span className="text-muted-foreground">→</span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">微信私信</span>
            <span className="text-muted-foreground">→</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">成交¥1299</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">首次触点 + 最终触点 + ROI 报表</div>
        </div>
      </Section>
    </div>
  )
}

// ─── 模块6: 系统健康 ─────────────────────────────────────────
function InfraPanel() {
  const eventBus = useOpsStore(s => s.eventBusStats)
  const health = useOpsStore(s => s.healthChecks)

  return (
    <div className="p-4 space-y-4">
      <ModuleIntro num="6" title="系统健康" desc="消息不丢、不重复、服务不崩" />

      <Section title="消息可靠性（Redis Streams）" icon={<Activity className="w-3.5 h-3.5 text-emerald-500" />}>
        <div className="grid grid-cols-4 gap-2">
          <InfraStat label="待处理" value={eventBus.pending} tone={eventBus.pending > 10 ? 'warn' : 'ok'} />
          <InfraStat label="已确认" value={eventBus.acked} tone="ok" />
          <InfraStat label="死信" value={eventBus.dlq} tone={eventBus.dlq > 0 ? 'warn' : 'ok'} />
          <InfraStat label="消费者" value={eventBus.consumers} tone="ok" />
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground">崩溃不丢消息 · 毒消息进死信队列 · 手动确认</div>
      </Section>

      <Section title="服务健康" icon={<Heart className="w-3.5 h-3.5 text-rose-500" />}>
        <div className="space-y-1.5">
          {health.map(h => (
            <div key={h.service} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
              <span className={`w-2 h-2 rounded-full ${h.status === 'ok' ? 'bg-emerald-500' : h.status === 'warn' ? 'bg-amber-500' : 'bg-rose-500'}`} />
              <span className="text-[11px] font-medium flex-1">{h.service}</span>
              <span className={`text-[10px] font-mono ${h.latency > 1000 ? 'text-rose-500' : h.latency > 300 ? 'text-amber-500' : 'text-emerald-600'}`}>{h.latency}ms</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ─── 大模型对接面板 ──────────────────────────────────────────
function LLMProviderPanel() {
  const providers = useOpsStore(s => s.llmProviders)
  const activeProviderId = useOpsStore(s => s.activeProviderId)
  const setActiveProvider = useOpsStore(s => s.setActiveProvider)
  const testProvider = useOpsStore(s => s.testProvider)
  const updateProvider = useOpsStore(s => s.updateProvider)
  const [testing, setTesting] = useState<string | null>(null)

  const typeLabels: Record<string, { label: string; color: string }> = {
    api:     { label: 'API 直连',    color: 'bg-emerald-500/10 text-emerald-600' },
    local:   { label: '本地模型',    color: 'bg-blue-500/10 text-blue-600' },
    proxy:   { label: '本地代理',    color: 'bg-amber-500/10 text-amber-600' },
    reverse: { label: '逆向直连',    color: 'bg-purple-500/10 text-purple-600' },
  }

  const handleTest = async (id: string) => {
    setTesting(id)
    await testProvider(id)
    setTesting(null)
  }

  return (
    <div className="p-4 space-y-3">
      <ModuleIntro num="2" title="大模型对接" desc="支持 API/本地/代理/豆包千问逆向，可多 Provider 按优先级路由" />

      {/* Provider 列表 */}
      {providers.map(p => {
        const isActive = p.id === activeProviderId
        const typeMeta = typeLabels[p.type] || typeLabels.api
        return (
          <div key={p.id} className={`p-3 rounded-xl border transition-all ${isActive ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-card'}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${typeMeta.color}`}>
                <Cpu className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-semibold">{p.name}</span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${typeMeta.color}`}>{typeMeta.label}</span>
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {p.config.model && `模型: ${p.config.model} · `}
                  {p.config.localUrl && `${p.config.localUrl} · `}
                  {p.config.browserEndpoint && `${p.config.browserEndpoint} · `}
                  {p.config.apiUrl && p.config.apiUrl !== 'z-ai-web-dev-sdk' && `${p.config.apiUrl} · `}
                  优先级 {p.priority}
                </div>
              </div>
              {/* 状态指示 */}
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${p.status === 'connected' ? 'bg-emerald-500' : p.status === 'error' ? 'bg-rose-500' : 'bg-muted-foreground/30'}`} />
                {p.latency && <span className="text-[9px] font-mono text-muted-foreground">{p.latency}ms</span>}
              </div>
            </div>

            {/* 统计 */}
            {p.totalCalls > 0 && (
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                <span>调用 {p.totalCalls}</span>
                <span>Token {p.totalTokens}</span>
                <span>成功率 {p.successRate}%</span>
                {p.totalCost > 0 && <span>费用 ¥{p.totalCost.toFixed(2)}</span>}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-1.5">
              <button
                onClick={() => setActiveProvider(p.id)}
                className={`px-2.5 py-1 text-[10px] rounded font-medium transition-colors apple-btn ${
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-foreground hover:bg-muted'
                }`}
              >
                {isActive ? '✓ 当前使用' : '设为当前'}
              </button>
              <button
                onClick={() => handleTest(p.id)}
                disabled={testing === p.id}
                className="px-2.5 py-1 text-[10px] rounded bg-secondary/50 text-foreground hover:bg-muted transition-colors apple-btn disabled:opacity-50"
              >
                {testing === p.id ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={() => updateProvider(p.id, { enabled: !p.enabled })}
                className={`px-2.5 py-1 text-[10px] rounded transition-colors apple-btn ${
                  p.enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                }`}
              >
                {p.enabled ? '已启用' : '已禁用'}
              </button>
            </div>

            {/* 逆向类型说明 */}
            {p.type === 'reverse' && (
              <div className="mt-2 p-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
                <div className="text-[9px] text-purple-600 font-semibold mb-0.5">
                  {p.config.reverseType === 'doubao' ? '🔥 豆包逆向（免费多模态，需登录Cookie）'
                  : p.config.reverseType === 'qianwen' ? '🌐 千问逆向（免费，需Cookie）'
                  : '🌐 浏览器直连'}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {p.config.reverseType === 'doubao'
                    ? '登录 doubao.com → F12 → Network → 复制 Cookie。支持看图+对话，免费。参考: github.com/LLM-Red-Team 或 github.com/Vinlic/doubao-reverse'
                    : p.config.reverseType === 'qianwen'
                    ? '登录 tongyi.aliyun.com → F12 → 复制 Cookie。参考: github.com/LLM-Red-Team/qwen-free-api'
                    : '通过浏览器 WebSocket 逆向接入'}
                </div>
              </div>
            )}

            {/* 可编辑配置（API Key / URL / Cookie）*/}
            <div className="mt-2 space-y-1.5">
              {/* API URL */}
              {(p.type === 'api' || p.type === 'proxy') && p.config.apiUrl && p.config.apiUrl !== 'z-ai-web-dev-sdk' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground w-14 shrink-0">API URL</span>
                  <input
                    type="text"
                    defaultValue={p.config.apiUrl}
                    onBlur={(e) => updateProvider(p.id, { config: { ...p.config, apiUrl: e.target.value } as any })}
                    className="flex-1 px-2 py-1 text-[10px] rounded bg-secondary/50 border border-border/40 focus:outline-none focus:border-primary/40 font-mono"
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
              )}
              {/* API Key */}
              {(p.type === 'api' || p.type === 'proxy') && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground w-14 shrink-0">API Key</span>
                  <input
                    type="password"
                    defaultValue={p.config.apiKey}
                    onBlur={(e) => updateProvider(p.id, { config: { ...p.config, apiKey: e.target.value } as any })}
                    className="flex-1 px-2 py-1 text-[10px] rounded bg-secondary/50 border border-border/40 focus:outline-none focus:border-primary/40 font-mono"
                    placeholder="sk-..."
                  />
                </div>
              )}
              {/* Model */}
              {(p.type === 'api' || p.type === 'local' || p.type === 'proxy') && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground w-14 shrink-0">模型名</span>
                  <input
                    type="text"
                    defaultValue={p.config.model}
                    onBlur={(e) => updateProvider(p.id, { config: { ...p.config, model: e.target.value } as any })}
                    className="flex-1 px-2 py-1 text-[10px] rounded bg-secondary/50 border border-border/40 focus:outline-none focus:border-primary/40 font-mono"
                    placeholder="gpt-4o-mini / qwen2:7b / glm-4"
                  />
                </div>
              )}
              {/* Local URL (Ollama) */}
              {p.type === 'local' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground w-14 shrink-0">本地地址</span>
                  <input
                    type="text"
                    defaultValue={p.config.localUrl}
                    onBlur={(e) => updateProvider(p.id, { config: { ...p.config, localUrl: e.target.value } as any })}
                    className="flex-1 px-2 py-1 text-[10px] rounded bg-secondary/50 border border-border/40 focus:outline-none focus:border-primary/40 font-mono"
                    placeholder="http://localhost:11434"
                  />
                </div>
              )}
              {/* Cookie (逆向) */}
              {p.type === 'reverse' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground w-14 shrink-0">Cookie</span>
                  <input
                    type="password"
                    defaultValue={p.config.cookie}
                    onBlur={(e) => updateProvider(p.id, { config: { ...p.config, cookie: e.target.value } as any })}
                    className="flex-1 px-2 py-1 text-[10px] rounded bg-secondary/50 border border-border/40 focus:outline-none focus:border-primary/40 font-mono"
                    placeholder="从浏览器F12复制Cookie..."
                  />
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* 添加新 Provider */}
      <div className="flex gap-1.5">
        <button
          onClick={() => {
            const newId = `provider_${Date.now()}`
            useOpsStore.getState().addProvider({
              id: newId, name: '自定义 API', type: 'api', enabled: false, priority: providers.length + 1,
              config: { apiUrl: '', apiKey: '', model: '', maxTokens: 1024, temperature: 0.7, timeout: 30000 },
              status: 'disconnected', totalCalls: 0, totalTokens: 0, totalCost: 0, successRate: 0,
            })
            toast.success('已添加 API Provider')
          }}
          className="flex-1 py-2.5 rounded-xl border-2 border-dashed border-border/60 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors apple-btn"
        >
          + API Provider
        </button>
        <button
          onClick={() => {
            const newId = `provider_${Date.now()}`
            useOpsStore.getState().addProvider({
              id: newId, name: 'Groq (免费超快)', type: 'api', enabled: false, priority: providers.length + 1,
              config: { apiUrl: 'https://api.groq.com/openai/v1', apiKey: '', model: 'llama-3.3-70b-versatile', maxTokens: 1024, temperature: 0.7, timeout: 30000 },
              status: 'disconnected', totalCalls: 0, totalTokens: 0, totalCost: 0, successRate: 0,
            })
            toast.success('已添加 Groq Provider', { description: '免费申请: console.groq.com' })
          }}
          className="flex-1 py-2.5 rounded-xl border-2 border-dashed border-border/60 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors apple-btn"
        >
          + Groq 免费
        </button>
        <button
          onClick={() => {
            const newId = `provider_${Date.now()}`
            useOpsStore.getState().addProvider({
              id: newId, name: 'Kimi (逆向免费)', type: 'reverse', enabled: false, priority: providers.length + 1,
              config: { reverseType: 'kimi', cookie: '', maxTokens: 4096, temperature: 0.7, timeout: 30000 },
              status: 'disconnected', totalCalls: 0, totalTokens: 0, totalCost: 0, successRate: 0,
            })
            toast.success('已添加 Kimi 逆向', { description: '128K长上下文，登录 kimi.moonshot.cn 获取Cookie' })
          }}
          className="flex-1 py-2.5 rounded-xl border-2 border-dashed border-border/60 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors apple-btn"
        >
          + Kimi 逆向
        </button>
      </div>

      {/* 说明 */}
      <div className="p-3 rounded-xl bg-secondary/50">
        <div className="text-[10px] font-semibold mb-1.5">支持的对接方式：</div>
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <div>🟢 <b>API 直连</b>：OpenAI / Z.AI / 通义 / 智谱 / DeepSeek — 需 Key+URL</div>
          <div>⚡ <b>Groq 免费</b>：console.groq.com 免费申请，500+tok/s 超快 — 需 Key</div>
          <div>🔵 <b>本地模型</b>：Ollama / vLLM — 需 localUrl，完全免费离线</div>
          <div>🟡 <b>本地代理</b>：中转代理 — 需 proxyUrl，隐藏 Key</div>
          <div>🟣 <b>豆包逆向</b>：免费多模态(看图+对话) — 需登录 Cookie</div>
          <div>🟣 <b>Kimi 逆向</b>：免费 128K 长上下文 — 需登录 Cookie</div>
        </div>
        <div className="text-[9px] text-muted-foreground mt-2 pt-2 border-t border-border/40">
          打包后用户在面板输入自己的 Key/URL/Cookie 即可。多 Provider 按优先级路由，主 Provider 失败自动降级。
          <br />
          <b>多模态</b>: VLM 看图 POST /api/waos/vlm · ASR 语音转文字 POST /api/waos/asr · TTS 人设语音 POST /api/waos/tts
          <br />
          <b>自动回复</b>: 微信/抖音/视频号 私信+评论+点赞 POST /api/waos/auto-reply
        </div>
      </div>

      {/* 逆向服务管理（固化到软件）*/}
      <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
        <div className="text-[10px] font-semibold mb-2">🔧 逆向服务管理（固化到软件）</div>

        {/* Groq 推荐 */}
        <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 mb-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] font-semibold text-emerald-600">⚡ Groq 官方免费层（推荐，最稳定）</span>
            <span className="text-[8px] px-1 rounded bg-emerald-500/10 text-emerald-600">无需Docker</span>
          </div>
          <div className="text-[9px] text-muted-foreground mb-1.5">
            注册 console.groq.com 即可，月 $500 免费，500+ tok/s 超快，支持 Llama 4 多模态 + Whisper 语音
          </div>
          <div className="flex gap-1.5">
            <input
              type="password"
              placeholder="gsk_... (Groq API Key)"
              className="flex-1 px-2 py-1 text-[10px] rounded bg-card border border-border/40 focus:outline-none focus:border-emerald-500/40 font-mono"
              onBlur={(e) => {
                const p = providers.find(p => p.id === 'groq')
                if (p) updateProvider('groq', { config: { ...p.config, apiKey: e.target.value } as any, enabled: !!e.target.value })
              }}
            />
            <button
              onClick={async () => {
                const p = providers.find(p => p.id === 'groq')
                if (p?.config.apiKey) {
                  toast.success('Groq Key 已保存', { description: '点击"设为当前"启用' })
                } else {
                  toast.warning('请先输入 Groq API Key')
                }
              }}
              className="px-2 py-1 text-[9px] rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
            >
              保存
            </button>
          </div>
        </div>

        {/* DeepSeek 推荐 */}
        <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 mb-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] font-semibold text-blue-600">🧠 DeepSeek 官方（极低价，国产最强）</span>
            <span className="text-[8px] px-1 rounded bg-blue-500/10 text-blue-600">无需Docker</span>
          </div>
          <div className="text-[9px] text-muted-foreground mb-1.5">
            ¥1/百万token，充 ¥10 用很久，OpenAI 兼容，支持 deepseek-reasoner 推理模型
          </div>
          <div className="flex gap-1.5">
            <input
              type="password"
              placeholder="sk-... (DeepSeek API Key)"
              className="flex-1 px-2 py-1 text-[10px] rounded bg-card border border-border/40 focus:outline-none focus:border-blue-500/40 font-mono"
              onBlur={(e) => {
                useOpsStore.getState().addProvider({
                  id: 'deepseek',
                  name: 'DeepSeek 官方',
                  type: 'api',
                  enabled: !!e.target.value,
                  priority: 2,
                  config: { apiUrl: 'https://api.deepseek.com/v1', apiKey: e.target.value, model: 'deepseek-chat', maxTokens: 4096, temperature: 0.7, timeout: 60000 },
                  status: e.target.value ? 'connected' : 'disconnected',
                  totalCalls: 0, totalTokens: 0, totalCost: 0, successRate: 0,
                })
              }}
            />
          </div>
        </div>

        {/* 豆包逆向 */}
        <div className="p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20 mb-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] font-semibold text-purple-600">🔥 豆包逆向（免费多模态，需Docker+Cookie）</span>
            <span className="text-[8px] px-1 rounded bg-purple-500/10 text-purple-600">逆向</span>
          </div>
          <div className="text-[9px] text-muted-foreground mb-1.5">
            免费看图+对话+文生图。需 Docker 运行 lza6/doubao-2api 镜像 + 登录 doubao.com 获取 Cookie。
            <br />
            <span className="text-amber-600">⚠️ 逆向天然不稳定，Cookie 可能过期，建议多账号轮询</span>
          </div>

          {/* Cookie 输入 */}
          <input
            type="password"
            placeholder="粘贴 doubao.com 的 Cookie（F12 → Network → 复制）"
            className="w-full px-2 py-1 text-[10px] rounded bg-card border border-border/40 focus:outline-none focus:border-purple-500/40 font-mono mb-1.5"
            id="doubao-cookie-input"
          />

          <div className="flex gap-1.5">
            <button
              onClick={() => {
                const cookieInput = document.getElementById('doubao-cookie-input') as HTMLInputElement
                const cookie = cookieInput?.value || ''
                if (!cookie) { toast.warning('请先粘贴 Cookie'); return }
                useOpsStore.getState().checkReverseService('doubao', cookie)
                toast.info('正在检查 Cookie 和 Docker 服务...')
              }}
              className="px-2 py-1 text-[9px] rounded bg-purple-500/10 text-purple-600 hover:bg-purple-500/20"
            >
              检查连接
            </button>
            <button
              onClick={() => {
                const cookieInput = document.getElementById('doubao-cookie-input') as HTMLInputElement
                const cookie = cookieInput?.value || ''
                if (!cookie) { toast.warning('请先粘贴 Cookie'); return }
                useOpsStore.getState().generateDockerCompose('doubao', cookie)
                toast.success('Docker 配置已下载', { description: '运行: docker compose -f docker-compose.reverse.yml up -d' })
              }}
              className="px-2 py-1 text-[9px] rounded bg-purple-500/10 text-purple-600 hover:bg-purple-500/20"
            >
              生成Docker配置
            </button>
          </div>

          {/* 安装步骤 */}
          <details className="mt-2">
            <summary className="text-[9px] text-muted-foreground cursor-pointer hover:text-foreground">📋 安装步骤（点击展开）</summary>
            <ol className="text-[9px] text-muted-foreground mt-1 space-y-0.5 list-decimal pl-4">
              <li>安装 Docker: <span className="font-mono">https://docker.com</span></li>
              <li>登录 doubao.com（建议无痕模式）</li>
              <li>F12 → Network → 点任意请求 → 复制 Cookie 值</li>
              <li>粘贴到上方输入框</li>
              <li>点"生成Docker配置"下载 yml 文件</li>
              <li>运行 <span className="font-mono">docker compose -f docker-compose.reverse.yml up -d</span></li>
              <li>等待 5 秒后点"检查连接"</li>
            </ol>
          </details>
        </div>

        {/* 稳定性说明 */}
        <div className="text-[9px] text-muted-foreground mt-2">
          <b>稳定性排序</b>：Groq 官方 {'>'} DeepSeek 官方 {'>'} 豆包逆向
          <br />
          逆向方案参考: github.com/lza6/doubao-2api (212⭐, 2026-06活跃)
        </div>
      </div>
    </div>
  )
}

// ─── 审计日志 ────────────────────────────────────────────────
function AuditPanel() {
  const auditLog = useOpsStore(s => s.auditLog)
  const selectLead = useOpsStore(s => s.selectLead)
  return (
    <div className="p-4">
      <ModuleIntro num="6" title="操作记录" desc="谁在什么时间做了什么" />
      {auditLog.length === 0 ? (
        <div className="text-center py-8 text-[11px] text-muted-foreground">暂无记录</div>
      ) : (
        <ul className="space-y-1 mt-3">
          {auditLog.slice(0, 100).map(entry => (
            <li key={entry.id} onClick={() => entry.leadId && selectLead(entry.leadId)} className="px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-mono text-primary font-semibold">{entry.action}</span>
                {entry.from && entry.to && <span className="text-[9px] font-mono text-muted-foreground">{entry.from}→{entry.to}</span>}
                <span className="text-[8px] px-1 rounded bg-muted text-muted-foreground ml-auto">{entry.actor}</span>
              </div>
              <div className="text-[9px] font-mono text-muted-foreground mt-0.5">{new Date(entry.ts).toLocaleString('zh-CN', { hour12: false })}{entry.reason && ` · ${entry.reason}`}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── 模块8: CRM 线索表 + 乐观锁测试 ─────────────────────────────
function CrmPanel() {
  const leads = useOpsStore(s => s.leads)
  const clientViewLeadId = useOpsStore(s => s.clientViewLeadId)
  const selectLead = useOpsStore(s => s.selectLead)
  const testOptimisticLock = useOpsStore(s => s.testOptimisticLock)

  // 乐观锁测试状态
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    conflict: boolean
    message: string
    oldVersion: number
    newVersion: number
    leadId: string
    leadName: string
  } | null>(null)

  // 当前选中线索（默认用 clientViewLeadId）
  const selectedLead = leads.find(l => l.id === clientViewLeadId) || leads[0] || null

  // 点击"乐观锁测试"按钮
  const handleTestLock = async () => {
    if (!selectedLead || testing) return
    setTesting(true)
    setResult(null)
    try {
      const r = await testOptimisticLock(selectedLead.id)
      setResult({ ...r, leadId: selectedLead.id, leadName: selectedLead.userName })
      if (r.success) {
        toast.success('乐观锁更新成功', { description: `${selectedLead.userName} v${r.oldVersion} → v${r.newVersion}` })
      } else if (r.conflict) {
        toast.error('乐观锁冲突', { description: `${selectedLead.userName} 当前 v${r.newVersion}，请刷新后重试` })
      }
    } catch (e) {
      toast.error('测试异常', { description: String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <ModuleIntro num="8" title="CRM 线索" desc="5 列线索表（姓名/意向/价值/状态/版本号）+ 乐观锁冲突测试" />

      {/* 线索表格 5 列 */}
      <Section title="线索列表（点击行选中后测试乐观锁）" icon={<Database className="w-3.5 h-3.5 text-emerald-500" />}>
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="text-[11px] font-semibold">姓名</TableHead>
                <TableHead className="text-[11px] font-semibold text-right">意向分</TableHead>
                <TableHead className="text-[11px] font-semibold text-right">价值分</TableHead>
                <TableHead className="text-[11px] font-semibold">状态</TableHead>
                <TableHead className="text-[11px] font-semibold text-center">版本号</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-[11px] text-muted-foreground py-8">
                    暂无线索
                  </TableCell>
                </TableRow>
              ) : (
                leads.map(lead => {
                  const isSelected = lead.id === selectedLead?.id
                  return (
                    <TableRow
                      key={lead.id}
                      onClick={() => selectLead(lead.id)}
                      data-state={isSelected ? 'selected' : undefined}
                      className={`cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      <TableCell className="text-[12px] font-medium">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: lead.personaColor || '#94a3b8' }}
                          />
                          {lead.userName}
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px] font-mono text-right tabular-nums">
                        <ScoreBadge score={lead.intentScore} />
                      </TableCell>
                      <TableCell className="text-[11px] font-mono text-right tabular-nums">
                        <ScoreBadge score={lead.valueScore} />
                      </TableCell>
                      <TableCell>
                        <StageBadge stage={lead.stage} />
                      </TableCell>
                      <TableCell className="text-center">
                        <VersionBadge version={lead.version} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* 乐观锁测试按钮 */}
      <Section
        title="乐观锁测试（模拟并发冲突）"
        icon={<Lock className="w-3.5 h-3.5 text-amber-500" />}
      >
        <div className="p-3 rounded-lg bg-secondary/50 border border-border/60 space-y-2.5">
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            选中线索：<b className="text-foreground">{selectedLead?.userName || '—'}</b>
            <span className="ml-2 text-[10px] font-mono">当前版本 v{selectedLead?.version ?? 0}</span>
          </div>
          <div className="text-[10px] text-muted-foreground leading-relaxed">
            规则：v1 时直接推进 stage → v2（成功）；v2+ 时模拟用 v-1 过期更新（应冲突失败）。
            真实场景下 Prisma 用 <code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[9px]">where:{`{ id, version }`}</code> 条件更新，命中 0 行即视为冲突。
          </div>
          <button
            onClick={handleTestLock}
            disabled={!selectedLead || testing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 active:scale-[0.98] transition-all apple-btn disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {testing ? '测试中…' : '乐观锁测试'}
          </button>

          {/* 冲突 / 成功提示 */}
          {result && (
            <div
              className={`mt-1 px-3 py-2 rounded-md text-[11px] font-medium leading-relaxed border ${
                result.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400'
              }`}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-1.5">
                {result.success
                  ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                <span>{result.message}</span>
              </div>
              <div className="text-[9px] font-mono mt-1 opacity-80">
                lead={result.leadName} · old v{result.oldVersion} → new v{result.newVersion}
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

// ─── CRM 表格专用 Badge ────────────────────────────────────────
// version 列颜色按版本号递增：v1 灰 / v2 蓝 / v3 绿 / v4+ 橙
function VersionBadge({ version }: { version: number }) {
  const colorMap: Record<string, string> = {
    v1: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30',
    v2: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
    v3: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    v4plus: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  }
  const key = version <= 0 ? 'v1' : version === 1 ? 'v1' : version === 2 ? 'v2' : version === 3 ? 'v3' : 'v4plus'
  return (
    <Badge variant="outline" className={`text-[10px] font-mono font-semibold ${colorMap[key]}`}>
      v{version}
    </Badge>
  )
}

// 意向分 / 价值分小徽标（数字 + 颜色暗示）
function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'text-rose-600 dark:text-rose-400'
    : score >= 60 ? 'text-amber-600 dark:text-amber-400'
    : score >= 40 ? 'text-sky-600 dark:text-sky-400'
    : 'text-muted-foreground'
  return <span className={`font-semibold ${color}`}>{score}</span>
}

// 状态机徽标
function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    new:        { label: '新建',    cls: 'bg-muted text-muted-foreground border-border' },
    engaged:    { label: '互动中',  cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30' },
    qualified:  { label: '已资质',  cls: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30' },
    warm:       { label: '温',      cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
    hot:        { label: 'HOT',     cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30' },
    converted:  { label: '已成交',  cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
    churned:    { label: '已流失',  cls: 'bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30' },
    blocked:    { label: '已接管',  cls: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30' },
    cold:       { label: '冷',      cls: 'bg-slate-500/15 text-slate-500 dark:text-slate-400 border-slate-500/30' },
  }
  const item = map[stage] || { label: stage, cls: 'bg-muted text-muted-foreground border-border' }
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold ${item.cls}`}>
      {item.label}
    </Badge>
  )
}

// ─── 通用组件 ────────────────────────────────────────────────
function ModuleIntro({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="p-3 rounded-xl bg-gradient-to-br from-primary/5 to-transparent border border-primary/10">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">{num}</span>
        <h2 className="text-[14px] font-semibold">{title}</h2>
      </div>
      <p className="text-[11px] text-muted-foreground">{desc}</p>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        {icon}
        <span className="text-[11px] font-semibold text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  )
}

function AntiBanRow({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
      <div className="flex-1"><div className="text-[11px] font-medium">{label}</div><div className="text-[9px] text-muted-foreground">{desc}</div></div>
      <span className="text-[11px] font-mono font-semibold">{value}</span>
    </div>
  )
}

function InfraStat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'down' }) {
  const color = tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-rose-600'
  return (
    <div className="p-2 rounded-lg bg-secondary/50 text-center">
      <div className={`text-[16px] font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}
