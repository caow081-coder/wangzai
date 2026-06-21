'use client'

/**
 * WAOS 专业控制台模式 — 完整底层架构
 *
 * 3 列布局:
 *  - 左: 微信客户端 (聊天/朋友圈/通讯录)
 *  - 中: 线索详情 (WHY决策 + 状态机 + 旅程 + 审计 + 对话)
 *  - 右: 功能区 (7 个 tab: 线索/详情/调度器/指标/漏斗/AB/审计)
 *
 * 底部: EventStream 事件流（在 page.tsx 中渲染）
 *
 * 这就是 WAOS 的完整底层架构，与 AI 助手模式共享同一 store 数据。
 */

import { useOpsStore } from '@/store/useOpsStore'
import { WeChatClient } from './WeChatClient'
import { MiddlePanel } from './MiddlePanel'
import {
  Inbox, User, Flame, Activity, Filter, GitBranch, Shield,
} from 'lucide-react'
import { SchedulerView, MetricsView, FunnelView, AbView } from './RightPanel'

type Panel = 'inbox' | 'detail' | 'scheduler' | 'metrics' | 'funnel' | 'ab' | 'audit'

const TABS: { id: Panel; label: string; icon: React.ReactNode }[] = [
  { id: 'inbox',     label: '线索',     icon: <Inbox className="w-3.5 h-3.5" /> },
  { id: 'detail',    label: '详情',     icon: <User className="w-3.5 h-3.5" /> },
  { id: 'scheduler', label: '调度器',   icon: <Flame className="w-3.5 h-3.5" /> },
  { id: 'metrics',   label: '指标',     icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'funnel',    label: '漏斗',     icon: <Filter className="w-3.5 h-3.5" /> },
  { id: 'ab',        label: 'A/B',     icon: <GitBranch className="w-3.5 h-3.5" /> },
  { id: 'audit',     label: '审计',     icon: <Shield className="w-3.5 h-3.5" /> },
]

export function ProConsole() {
  const proPanel = useOpsStore(s => s.proPanel)
  const setProPanel = useOpsStore(s => s.setProPanel)
  const auditLog = useOpsStore(s => s.auditLog)
  const selectLead = useOpsStore(s => s.selectLead)

  return (
    <div className="flex flex-1 min-h-0 gap-px bg-border/40">
      {/* 左: 微信客户端 */}
      <aside className="w-[360px] min-w-[300px] max-w-[420px] bg-card flex flex-col min-h-0 shrink-0">
        <WeChatClient />
      </aside>

      {/* 中: 线索详情 */}
      <main className="flex-1 min-w-0 bg-background flex flex-col min-h-0">
        <MiddlePanel embedded />
      </main>

      {/* 右: 功能区 */}
      <aside className="w-[380px] min-w-[320px] max-w-[440px] bg-card flex flex-col min-h-0 shrink-0">
        {/* Tab header */}
        <div className="shrink-0 px-2 py-2 border-b border-border/60 bg-card">
          <div className="flex items-center gap-0.5 overflow-x-auto waos-scrollbar-x">
            {TABS.map(t => {
              const active = proPanel === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setProPanel(t.id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all shrink-0 ${
                    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Panel body */}
        <div className="flex-1 min-h-0 overflow-y-auto waos-scrollbar">
          {proPanel === 'inbox' && <InboxPanel />}
          {proPanel === 'detail' && <DetailPanel />}
          {proPanel === 'scheduler' && <SchedulerView />}
          {proPanel === 'metrics' && <MetricsView />}
          {proPanel === 'funnel' && <FunnelView />}
          {proPanel === 'ab' && <AbView />}
          {proPanel === 'audit' && <AuditPanel />}
        </div>
      </aside>
    </div>
  )
}

// ─── 线索收件箱（精简版，复用 LeftPanel 逻辑）─────────────────
function InboxPanel() {
  const leads = useOpsStore(s => s.leads)
  const selectedLeadId = useOpsStore(s => s.selectedLeadId)
  const selectLead = useOpsStore(s => s.selectLead)

  return (
    <div className="p-2">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
        线索收件箱 · {leads.length}
      </div>
      <ul className="space-y-0.5">
        {leads.map(lead => {
          const active = lead.id === selectedLeadId
          return (
            <li
              key={lead.id}
              onClick={() => selectLead(lead.id)}
              className={`p-2 rounded-lg cursor-pointer transition-colors ${
                active ? 'bg-primary/10' : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                  style={{ background: lead.personaColor || '#86868b' }}
                >
                  {lead.userName.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{lead.userName}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{lead.lastMessage}</div>
                </div>
                <span className={`text-[10px] font-mono font-semibold ${
                  lead.priorityScore >= 80 ? 'text-rose-500' :
                  lead.priorityScore >= 50 ? 'text-amber-500' : 'text-muted-foreground'
                }`}>
                  {lead.priorityScore.toFixed(0)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function DetailPanel() {
  return (
    <div className="p-3 text-center text-[11px] text-muted-foreground">
      详情已在中间面板显示
    </div>
  )
}

function AuditPanel() {
  const auditLog = useOpsStore(s => s.auditLog)
  const selectLead = useOpsStore(s => s.selectLead)

  return (
    <div className="p-2">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
        审计日志 · {auditLog.length}
      </div>
      {auditLog.length === 0 ? (
        <div className="text-center py-8 text-[11px] text-muted-foreground">暂无审计记录</div>
      ) : (
        <ul className="space-y-1">
          {auditLog.slice(0, 80).map(entry => (
            <li
              key={entry.id}
              onClick={() => entry.leadId && selectLead(entry.leadId)}
              className="px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-mono text-primary font-semibold">{entry.action}</span>
                {entry.from && entry.to && (
                  <span className="text-[9px] font-mono text-muted-foreground">{entry.from}→{entry.to}</span>
                )}
                <span className="text-[8px] px-1 rounded bg-muted text-muted-foreground ml-auto">{entry.actor}</span>
              </div>
              <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
                {new Date(entry.ts).toLocaleString('zh-CN', { hour12: false })}
                {entry.reason && ` · ${entry.reason}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
