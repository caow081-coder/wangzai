'use client'

import { useOpsStore, type CustomerInsight } from '@/store/useOpsStore'
import {
  Sparkles, TrendingUp, Clock, Tag, Star, Flame, RefreshCw,
  CheckCircle2, AlertCircle, ArrowUpRight, MessageSquare, Zap, Eye, ChevronRight, User, Bot, Heart
} from 'lucide-react'

export function AIAssistant() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)
  const leads = useOpsStore(s => s.leads)
  const selectLead = useOpsStore(s => s.selectLead)

  if (!lead) {
    return <EmptyState />
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto waos-scrollbar">
      {/* 客户卡片 */}
      <CustomerCard />

      {/* AI 推荐话术 */}
      <ReplySuggestions />

      {/* 客户洞察 */}
      <CustomerInsightCard />

      {/* 客户列表（精简） */}
      <CustomerList />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-4 shadow-sm">
        <Sparkles className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-[15px] font-semibold mb-1">AI 私域助手已就绪</h3>
      <p className="text-[12px] text-muted-foreground max-w-[240px] leading-relaxed">
        选中一位客户，我会帮你分析意图、推荐话术、管理优先级，让你聊得更高效
      </p>
    </div>
  )
}

// ─── 客户卡片 ────────────────────────────────────────────────
function CustomerCard() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)
  const insight = useOpsStore(s => s.customerInsight)
  const sendClientAction = useOpsStore(s => s.sendClientAction)
  const openReplyStudio = useOpsStore(s => s.openReplyStudio)

  if (!lead) return null

  const priorityStars = insight ? (
    insight.priority === 'hot' ? 4 :
    insight.priority === 'high' ? 3 :
    insight.priority === 'medium' ? 2 : 1
  ) : 1

  return (
    <div className="p-4 border-b border-border/60">
      {/* 头像 + 名字 + 优先级 */}
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-[16px] font-semibold text-white shrink-0"
          style={{ background: lead.personaColor || '#86868b' }}
        >
          {lead.userName.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[15px] font-semibold truncate">{lead.userName}</h2>
            {lead.stage === 'hot' && <Flame className="w-3.5 h-3.5 text-rose-500" />}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {/* 优先级星星 */}
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4].map(i => (
                <Star
                  key={i}
                  className={`w-3 h-3 ${i <= priorityStars ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">
              {lead.source === 'wechat_dm' ? '微信' : lead.source === 'douyin' ? '抖音' : lead.source === 'video' ? '视频号' : '评论'}
            </span>
          </div>
        </div>
      </div>

      {/* 标签 */}
      {lead.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {lead.tags.map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* 快捷操作 */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => openReplyStudio(lead.id)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors apple-btn"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          AI 写回复
        </button>
        <button
          onClick={() => sendClientAction('force_priority', lead.id)}
          className="flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg bg-secondary text-secondary-foreground text-[11px] font-medium hover:bg-secondary/80 transition-colors apple-btn"
          title="提升优先级"
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => sendClientAction('human_handoff', lead.id)}
          className="flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg bg-secondary text-secondary-foreground text-[11px] font-medium hover:bg-secondary/80 transition-colors apple-btn"
          title="转人工"
        >
          <User className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => sendClientAction('mark_done', lead.id)}
          className="flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg bg-secondary text-secondary-foreground text-[11px] font-medium hover:bg-secondary/80 transition-colors apple-btn"
          title="标记完成"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── AI 推荐话术 ─────────────────────────────────────────────
function ReplySuggestions() {
  const suggestions = useOpsStore(s => s.replySuggestions)
  const loading = useOpsStore(s => s.suggestionsLoading)
  const applySuggestion = useOpsStore(s => s.applySuggestion)
  const generateReplySuggestions = useOpsStore(s => s.generateReplySuggestions)
  const activePersonaId = useOpsStore(s => s.activePersonaId)
  const personas = useOpsStore(s => s.personas)
  const persona = personas.find(p => p.id === activePersonaId) || personas[0]

  return (
    <div className="p-4 border-b border-border/60">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-[11px]">
          {persona.avatar}
        </div>
        <div className="flex-1">
          <div className="text-[12px] font-semibold">AI 推荐话术</div>
          <div className="text-[10px] text-muted-foreground">{persona.shortName}风格 · 基于客户最新消息</div>
        </div>
        <button
          onClick={() => generateReplySuggestions()}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors apple-btn"
          title="重新生成"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 rounded-xl bg-muted/50 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-[11px] text-muted-foreground">暂无推荐，选中客户后自动生成</p>
        </div>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              onClick={() => applySuggestion(s)}
              className="w-full text-left p-3 rounded-xl bg-card border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all apple-btn group"
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{i + 1}</span>
                <p className="flex-1 text-[12px] leading-relaxed">{s.content}</p>
              </div>
              <div className="flex items-center gap-2 mt-2 pl-5">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
                  {intentLabel(s.intent)}
                </span>
                <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <Zap className="w-2.5 h-2.5 text-amber-400" />
                  <span>{(s.confidence * 100).toFixed(0)}%</span>
                </div>
                <span className="text-[9px] text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                  点击应用 →
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function intentLabel(intent: string): string {
  return {
    greeting: '破冰问候',
    price: '价格异议',
    objection: '异议处理',
    closing: '促成成交',
    followup: '跟进催单',
    empathy: '共情安抚',
  }[intent] || intent
}

// ─── 客户洞察 ────────────────────────────────────────────────
function CustomerInsightCard() {
  const insight = useOpsStore(s => s.customerInsight)
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)

  if (!insight || !lead) return null

  const priorityColor = {
    hot: 'text-rose-500 bg-rose-500/10',
    high: 'text-amber-500 bg-amber-500/10',
    medium: 'text-blue-500 bg-blue-500/10',
    low: 'text-muted-foreground bg-muted',
  }[insight.priority]

  const priorityLabel = { hot: 'HOT 紧急', high: '高优先级', medium: '中优先级', low: '低优先级' }[insight.priority]

  return (
    <div className="p-4 border-b border-border/60">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[12px] font-semibold">客户洞察</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ml-auto ${priorityColor}`}>
          {priorityLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <InsightMetric
          icon={<TrendingUp className="w-3 h-3" />}
          label="购买意图"
          value={`${insight.intentScore.toFixed(0)}`}
          max={100}
          color="emerald"
        />
        <InsightMetric
          icon={<Tag className="w-3 h-3" />}
          label="预估价值"
          value={`¥${insight.estimatedValue}`}
          color="amber"
        />
      </div>

      <div className="mt-2 space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">当前阶段</span>
          <span className="font-medium">{stageLabel(insight.stage)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">对话轮数</span>
          <span className="font-medium">{insight.journeyLength} 轮</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">最近活跃</span>
          <span className="font-medium flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {insight.lastActiveHours < 1 ? '刚刚' : `${insight.lastActiveHours.toFixed(1)}h 前`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">情绪倾向</span>
          <span className={`font-medium flex items-center gap-1 ${
            insight.sentiment === 'positive' ? 'text-emerald-600' :
            insight.sentiment === 'negative' ? 'text-rose-600' : 'text-muted-foreground'
          }`}>
            {insight.sentiment === 'positive' ? '😊 积极' : insight.sentiment === 'negative' ? '😟 消极' : '😐 中性'}
          </span>
        </div>
      </div>
    </div>
  )
}

function InsightMetric({ icon, label, value, max, color }: { icon: React.ReactNode; label: string; value: string; max?: number; color: string }) {
  const colorClass = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
  }[color] || 'text-foreground'

  return (
    <div className="p-2.5 rounded-xl bg-secondary/50">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`text-[15px] font-bold mt-0.5 ${colorClass}`}>{value}</div>
      {max && (
        <div className="h-1 rounded-full bg-muted mt-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full ${color === 'emerald' ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(100, (Number(value) / max) * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

function stageLabel(stage: string): string {
  return {
    new: '🆕 新线索',
    engaged: '💬 互动中',
    qualified: '📋 已资质',
    hot: '🔥 高意向',
    converted: '✅ 已成交',
    churned: '❄️ 已流失',
    blocked: '🤝 人工接管',
  }[stage] || stage
}

// ─── 客户列表（精简） ────────────────────────────────────────
function CustomerList() {
  const leads = useOpsStore(s => s.leads)
  const selectedLeadId = useOpsStore(s => s.selectedLeadId)
  const selectLead = useOpsStore(s => s.selectLead)

  // 按优先级排序，取前 8 个
  const sorted = [...leads].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 8)

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[12px] font-semibold">优先客户</span>
        <span className="text-[10px] text-muted-foreground">· 按优先级排序</span>
      </div>
      <div className="space-y-1">
        {sorted.map(lead => {
          const active = lead.id === selectedLeadId
          return (
            <button
              key={lead.id}
              onClick={() => selectLead(lead.id)}
              className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-left apple-btn ${
                active ? 'bg-primary/10' : 'hover:bg-muted/50'
              }`}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                style={{ background: lead.personaColor || '#86868b' }}
              >
                {lead.userName.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium truncate">{lead.userName}</div>
                <div className="text-[10px] text-muted-foreground truncate">{lead.lastMessage}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {lead.stage === 'hot' && <Flame className="w-3 h-3 text-rose-500" />}
                <span className={`text-[10px] font-mono font-semibold ${
                  lead.priorityScore >= 80 ? 'text-rose-500' :
                  lead.priorityScore >= 50 ? 'text-amber-500' : 'text-muted-foreground'
                }`}>
                  {lead.priorityScore.toFixed(0)}
                </span>
              </div>
              {active && <ChevronRight className="w-3 h-3 text-primary shrink-0" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
