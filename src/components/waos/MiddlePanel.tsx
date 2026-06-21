'use client'

import { useOpsStore, useSelectedLead, type Stage, type LeadMessage } from '@/store/useOpsStore'
import {
  MessageSquare, Send, UserCog, Hand, CheckCircle2, Flame,
  ArrowUpRight, Sparkles, Shield, Bot, User, AlertTriangle,
  RefreshCw, ChevronRight, Tag, Clock, Zap,
} from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { AuditTimeline } from './AuditTimeline'
import { LeadJourney } from './LeadJourney'

const STAGES: Stage[] = ['new', 'engaged', 'qualified', 'hot', 'converted', 'churned', 'blocked']
const STAGE_LABEL: Record<Stage, string> = {
  new: '新建',
  engaged: '已互动',
  qualified: '已资质',
  hot: '高意向',
  converted: '已成交',
  churned: '已流失',
  blocked: '人工接管',
  warm: '意向中',
  cold: '冷线索',
}

export function MiddlePanel(_props?: { embedded?: boolean }) {
  const lead = useSelectedLead()

  if (!lead) {
    return <EmptyMiddle />
  }

  return <LeadDetail lead={lead} />
}

function EmptyMiddle() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 flex items-center justify-center mb-4 border border-emerald-500/20">
        <Sparkles className="w-7 h-7 text-emerald-400/70" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">等待线索接入</h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">
        从左侧选择一个线索，或等待实时事件流推送新的高意向用户进入运营控制台。
      </p>
      <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/70">
        <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-white/10">J</kbd>
        <span>下一个</span>
        <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-white/10">K</kbd>
        <span>上一个</span>
        <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-white/10">C</kbd>
        <span>生成线索</span>
      </div>
    </div>
  )
}

function LeadDetail({ lead }: { lead: NonNullable<ReturnType<typeof useSelectedLead>> }) {
  const openReplyStudio = useOpsStore(s => s.openReplyStudio)
  const sendClientAction = useOpsStore(s => s.sendClientAction)
  const markRead = useOpsStore(s => s.markRead)
  const selectLead = useOpsStore(s => s.selectLead)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Lead header ─── */}
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border/60 bg-card">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-foreground shadow-lg"
              style={{ background: lead.personaColor || '#52525b', boxShadow: `0 0 20px ${lead.personaColor}30` }}
            >
              {lead.userName.slice(0, 1)}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-card flex items-center justify-center
              ${lead.stage === 'hot' ? 'bg-rose-500' :
                lead.stage === 'converted' ? 'bg-emerald-500' :
                lead.stage === 'blocked' ? 'bg-orange-500' :
                lead.stage === 'churned' ? 'bg-zinc-600' :
                'bg-sky-500'}`}>
              {lead.stage === 'hot' && <Flame className="w-2 h-2 text-foreground" />}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold text-foreground truncate">{lead.userName}</h2>
              <span className="text-[10px] font-mono text-muted-foreground">{lead.externalId}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
              <span>via {lead.source}</span>
              <span className="text-muted-foreground/70">·</span>
              <span>variant: <span className="font-mono text-emerald-400">{lead.variant || '—'}</span></span>
              <span className="text-muted-foreground/70">·</span>
              <Clock className="w-3 h-3" />
              <span className="font-mono">{timeAgo(lead.lastTouchAt)}</span>
            </div>
          </div>

          {/* Priority score ring */}
          <div className="shrink-0 flex flex-col items-center">
            <PriorityRing score={lead.priorityScore} />
            <span className="text-[9px] font-mono text-muted-foreground mt-1">PRIORITY</span>
          </div>
        </div>

        {/* Tags */}
        {lead.tags.length > 0 && (
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <Tag className="w-3 h-3 text-muted-foreground" />
            {lead.tags.map(t => (
              <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-foreground border border-border/60">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ─── Scrollable body ─── */}
      <div className="flex-1 min-h-0 overflow-y-auto waos-scrollbar">
        {/* WHY THIS DECISION */}
        <WhyDecision lead={lead} />

        {/* State machine */}
        <StateMachine currentStage={lead.stage} />

        {/* Lead Journey (new) */}
        <LeadJourney />

        {/* Persona card */}
        <PersonaCard lead={lead} />

        {/* Audit timeline (new) */}
        <AuditTimeline />

        {/* Conversation thread */}
        <ConversationThread lead={lead} />
      </div>

      {/* ─── Action bar ─── */}
      <div className="shrink-0 px-4 py-3 border-t border-border/40 bg-card">
        <div className="flex items-center gap-2">
          <ActionButton
            onClick={() => openReplyStudio(lead.id)}
            icon={<MessageSquare className="w-3.5 h-3.5" />}
            label="快速回复"
            kbd="R"
            tone="primary"
          />
          <ActionButton
            onClick={() => {
              sendClientAction('force_priority', lead.id)
              toast.success('已强制提权', { description: `${lead.userName} → HOT 队列 (P95)` })
            }}
            icon={<ArrowUpRight className="w-3.5 h-3.5" />}
            label="强制插队"
            kbd="E"
            tone="hot"
          />
          <ActionButton
            onClick={() => {
              sendClientAction('human_handoff', lead.id)
              toast.warning('已转人工接管', { description: 'AI 已挂起，等待运营响应' })
            }}
            icon={<Hand className="w-3.5 h-3.5" />}
            label="转人工"
            kbd="H"
            tone="warn"
          />
          <ActionButton
            onClick={() => {
              markRead(lead.id)
              sendClientAction('mark_done', lead.id)
              toast.success('已标记完成')
            }}
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            label="标记完成"
            kbd="␣"
            tone="default"
          />
          <div className="ml-auto flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            <span>{lead.messages?.length || 0} msgs</span>
            <span>·</span>
            <span>左侧客户端实时同步</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PriorityRing({ score }: { score: number }) {
  const r = 18
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const color = score >= 80 ? '#f43f5e' : score >= 50 ? '#f59e0b' : '#71717a'
  return (
    <div className="relative w-12 h-12">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="oklch(1 0 0 / 8%)" strokeWidth="3" />
        <circle
          cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold font-mono" style={{ color }}>{score.toFixed(0)}</span>
      </div>
    </div>
  )
}

function WhyDecision({ lead }: { lead: NonNullable<ReturnType<typeof useSelectedLead>> }) {
  const f = lead.features
  const features = [
    { key: '意图分',  val: f.intent,   weight: '40%', desc: `intent=${lead.intentScore.toFixed(0)}` },
    { key: '价值分',  val: f.value,    weight: '30%', desc: `value=${lead.valueScore.toFixed(0)}` },
    { key: '阶段分',  val: f.stage,    weight: '20%', desc: `stage=${lead.stage}` },
    { key: '人设匹配', val: f.persona,  weight: '10%', desc: `persona=${lead.personaName?.split(' ')[0] || '—'}` },
    { key: '时间衰减', val: f.recency,  weight: '×decay', desc: `half-life=6h` },
    { key: '渠道权重', val: f.channel,  weight: '×channel', desc: `source=${lead.source}` },
    { key: '负向惩罚', val: f.penalty,  weight: '−penalty', desc: lead.isSpam ? 'spam+0.5' : lead.alreadyCustomer ? 'customer+0.3' : 'none' },
  ]
  const maxAbs = Math.max(...features.map(f => Math.abs(f.val)), 40)

  return (
    <section className="px-5 py-4 border-b border-border/40">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-3.5 bg-emerald-500 rounded-sm" />
        <h3 className="text-[11px] font-semibold tracking-wider text-foreground uppercase">Why this decision · 特征贡献分解</h3>
        <span className="text-[9px] font-mono text-muted-foreground/70 ml-auto">SHAP-like</span>
      </div>

      <div className="space-y-1.5">
        {features.map(feat => {
          const isNegative = feat.val < 0
          const width = Math.min(100, (Math.abs(feat.val) / maxAbs) * 100)
          return (
            <div key={feat.key} className="flex items-center gap-2 text-[11px] font-mono">
              <span className="w-16 text-muted-foreground text-right shrink-0">{feat.key}</span>
              <span className="w-14 text-[9px] text-muted-foreground/70 shrink-0">{feat.weight}</span>
              <div className="flex-1 h-4 bg-muted/50 rounded-sm relative overflow-hidden">
                <div
                  className={`h-full rounded-sm transition-all duration-500
                    ${isNegative ? 'bg-gradient-to-r from-rose-500/60 to-rose-500/30' :
                      feat.val > 30 ? 'bg-gradient-to-r from-emerald-500/60 to-emerald-500/30' :
                      'bg-gradient-to-r from-zinc-500/60 to-zinc-500/30'}`}
                  style={{ width: `${Math.max(2, width)}%` }}
                />
              </div>
              <span className={`w-12 text-right tabular-nums shrink-0 ${isNegative ? 'text-rose-400' : 'text-foreground'}`}>
                {feat.val > 0 ? '+' : ''}{feat.val.toFixed(1)}
              </span>
              <span className="w-32 text-[9px] text-muted-foreground/70 truncate shrink-0">{feat.desc}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 px-2.5 py-2 rounded-md bg-secondary/50 border border-border/40">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
          <Shield className="w-3 h-3 text-emerald-400" />
          <span>SafetyShield:</span>
          <span className="text-emerald-400">input sanitized</span>
          <span className="text-muted-foreground/70">·</span>
          <span>output filter:</span>
          <span className="text-emerald-400">active</span>
          {lead.isSpam && (
            <>
              <span className="text-muted-foreground/70">·</span>
              <span className="text-rose-400">SPAM flagged</span>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function StateMachine({ currentStage }: { currentStage: Stage }) {
  // Production flow:
  // new → engaged → qualified → hot → converted
  //                                  ↘ churned
  // blocked can be reached from any state (人工接管)
  const flow: Stage[] = ['new', 'engaged', 'qualified', 'hot', 'converted']
  const currentIdx = flow.indexOf(currentStage)
  const isChurned = currentStage === 'churned'
  const isBlocked = currentStage === 'blocked'

  return (
    <section className="px-5 py-4 border-b border-border/40">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-3.5 bg-sky-500 rounded-sm" />
        <h3 className="text-[11px] font-semibold tracking-wider text-foreground uppercase">State Machine · 状态机流转</h3>
        {isBlocked && (
          <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/30">
            人工接管
          </span>
        )}
        {isChurned && (
          <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-700/40 text-muted-foreground border border-zinc-700/40">
            已流失
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {flow.map((s, i) => {
          const isPast = currentIdx > i
          const isCurrent = currentIdx === i
          const isFuture = currentIdx < i
          return (
            <div key={s} className="flex items-center shrink-0">
              <div className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold border transition-all
                ${isCurrent ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/20' :
                  isPast ? 'bg-emerald-500/5 text-emerald-500/60 border-emerald-500/20' :
                  'bg-muted/50 text-muted-foreground border-border/60'}`}>
                {STAGE_LABEL[s]}
              </div>
              {i < flow.length - 1 && (
                <ChevronRight className={`w-3 h-3 mx-0.5 ${isPast ? 'text-emerald-500/60' : 'text-muted-foreground/40'}`} />
              )}
            </div>
          )
        })}
      </div>

      {(isChurned || isBlocked) && (
        <div className="mt-2 text-[10px] font-mono text-muted-foreground">
          当前状态: <span className={isBlocked ? 'text-orange-400' : 'text-muted-foreground'}>{STAGE_LABEL[currentStage]}</span>
          <span className="ml-2 text-muted-foreground/70">合法回退路径已记录至事件溯源</span>
        </div>
      )}
    </section>
  )
}

function PersonaCard({ lead }: { lead: NonNullable<ReturnType<typeof useSelectedLead>> }) {
  if (!lead.personaName) return null
  return (
    <section className="px-5 py-4 border-b border-border/40">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-3.5 bg-amber-500 rounded-sm" />
        <h3 className="text-[11px] font-semibold tracking-wider text-foreground uppercase">Persona · AI 销售角色</h3>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/40">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-foreground shrink-0"
          style={{ background: lead.personaColor || '#52525b' }}
        >
          <Bot className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-foreground">{lead.personaName}</div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            via Persona Arbitration · top-1 by historical CVR
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-[10px] font-mono text-muted-foreground">CVR</span>
          <span className="text-sm font-bold font-mono text-emerald-400">{((Math.random() * 0.3 + 0.2) * 100).toFixed(1)}%</span>
        </div>
      </div>
    </section>
  )
}

function ConversationThread({ lead }: { lead: NonNullable<ReturnType<typeof useSelectedLead>> }) {
  const messages = lead.messages || []
  if (messages.length === 0) {
    return (
      <section className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-3.5 bg-purple-500 rounded-sm" />
          <h3 className="text-[11px] font-semibold tracking-wider text-foreground uppercase">Conversation · 会话上下文 (max 10 turns)</h3>
        </div>
        <div className="text-[11px] text-muted-foreground/70 text-center py-6">暂无消息</div>
      </section>
    )
  }
  return (
    <section className="px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-3.5 bg-purple-500 rounded-sm" />
        <h3 className="text-[11px] font-semibold tracking-wider text-foreground uppercase">Conversation · 会话上下文 (max 10 turns)</h3>
        <span className="text-[9px] font-mono text-muted-foreground/70 ml-auto">{messages.length} msgs · ContextManager</span>
      </div>

      <div className="space-y-3">
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} leadPersonaColor={lead.personaColor} />
        ))}
      </div>
    </section>
  )
}

function MessageBubble({ msg, leadPersonaColor }: { msg: LeadMessage; leadPersonaColor?: string }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'
  const isHuman = msg.role === 'human'

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row' : 'flex-row-reverse'}`}>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: isUser ? '#3f3f46' : isHuman ? '#ea580c' : leadPersonaColor || '#71717a',
        }}
      >
        {isUser ? <User className="w-3.5 h-3.5 text-foreground" /> :
         isHuman ? <Hand className="w-3.5 h-3.5 text-foreground" /> :
         <Bot className="w-3.5 h-3.5 text-foreground" />}
      </div>
      <div className={`max-w-[78%] ${isUser ? '' : 'items-end'}`}>
        <div className="flex items-center gap-1.5 mb-0.5 text-[9px] font-mono text-muted-foreground">
          <span>{isUser ? '用户' : isHuman ? '人工' : 'AI'}</span>
          <span>·</span>
          <span>{(() => {
            // LeadMessage 类型已声明 createdAt?/ts?，直接读取无需 as any
            const rawTs: string | number | undefined = msg.createdAt ?? msg.ts
            const d = rawTs ? new Date(rawTs) : null
            return d && !isNaN(d.getTime()) ? d.toLocaleTimeString('zh-CN', { hour12: false }) : '--'
          })()}</span>
          {msg.latency && (<><span>·</span><span className="text-emerald-500/70">{msg.latency}ms</span></>)}
          {msg.tokensUsed && (<><span>·</span><span>{msg.tokensUsed} tok</span></>)}
        </div>
        <div
          className={`px-3 py-2 rounded-lg text-[12px] leading-relaxed
            ${isUser ? 'bg-muted/50 text-foreground rounded-tl-sm' :
              isHuman ? 'bg-orange-500/15 text-orange-100 border border-orange-500/30 rounded-tr-sm' :
              'bg-[oklch(0.22_0_0)] text-foreground border border-border/60 rounded-tr-sm'}`}
        >
          {msg.content}
        </div>
        {msg.safetyFiltered && (
          <div className="mt-1 flex items-center gap-1 text-[9px] font-mono text-amber-400">
            <AlertTriangle className="w-2.5 h-2.5" />
            <span>SafetyShield 拦截: {msg.safetyReason}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ActionButton({
  onClick, icon, label, kbd, tone = 'default',
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  kbd: string
  tone?: 'primary' | 'hot' | 'warn' | 'default'
}) {
  const cls = {
    primary: 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40',
    hot: 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/40',
    warn: 'bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border-orange-500/40',
    default: 'bg-muted/50 hover:bg-muted text-foreground border-border/60',
  }[tone]
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold border transition-colors ${cls}`}
    >
      {icon}
      <span>{label}</span>
      <kbd className="text-[9px] px-1 py-px rounded bg-black/30 border border-white/10 opacity-70 group-hover:opacity-100">{kbd}</kbd>
    </button>
  )
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
