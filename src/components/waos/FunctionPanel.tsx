'use client'

/**
 * WAOS Function Panel — 右侧可切换功能区
 *
 * 新布局核心：左侧微信客户端固定不变，右侧功能区可切换。
 * Tab 切换：
 *  - inbox:     线索收件箱（LeftPanel 原内容）
 *  - detail:    线索详情（MiddlePanel 原内容，含 WHY/状态机/旅程/审计/对话）
 *  - scheduler: 调度器（HOT/WARM/COLD 队列 + Worker Pool）
 *  - metrics:   指标大屏
 *  - funnel:    转化漏斗
 *  - ab:        A/B 实验
 *  - audit:     审计日志
 */

import { useOpsStore } from '@/store/useOpsStore'
import {
  Inbox, User, Flame, Activity, Filter, GitBranch, Shield, X,
} from 'lucide-react'
import { LeftPanel } from './LeftPanel'
import { MiddlePanel } from './MiddlePanel'
import { RightPanel } from './RightPanel'
import { AuditTimeline } from './AuditTimeline'

type Panel = 'inbox' | 'detail' | 'scheduler' | 'metrics' | 'funnel' | 'ab' | 'audit'

const TABS: { id: Panel; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'inbox',     label: '线索',     icon: <Inbox className="w-3.5 h-3.5" />,     hint: '1' },
  { id: 'detail',    label: '详情',     icon: <User className="w-3.5 h-3.5" />,       hint: '2' },
  { id: 'scheduler', label: '调度器',   icon: <Flame className="w-3.5 h-3.5" />,      hint: '3' },
  { id: 'metrics',   label: '指标',     icon: <Activity className="w-3.5 h-3.5" />,   hint: '4' },
  { id: 'funnel',    label: '漏斗',     icon: <Filter className="w-3.5 h-3.5" />,     hint: '5' },
  { id: 'ab',        label: 'A/B',     icon: <GitBranch className="w-3.5 h-3.5" />,   hint: '6' },
  { id: 'audit',     label: '审计',     icon: <Shield className="w-3.5 h-3.5" />,     hint: '7' },
]

export function FunctionPanel() {
  const panel = useOpsStore(s => s.functionPanel)
  const setFunctionPanel = useOpsStore(s => s.setFunctionPanel)

  return (
    <div className="flex flex-col h-full min-h-0 bg-[oklch(0.145_0_0)]">
      {/* Tab header */}
      <div className="shrink-0 px-2 py-2 border-b border-[oklch(1_0_0/8%)] bg-[oklch(0.18_0_0)]">
        <div className="flex items-center gap-0.5 overflow-x-auto waos-scrollbar-x">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider px-2 shrink-0 hidden lg:inline">
            功能区
          </span>
          {TABS.map(t => {
            const active = panel === t.id
            return (
              <button
                key={t.id}
                onClick={() => setFunctionPanel(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono font-semibold border transition-all shrink-0
                  ${active
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-[oklch(1_0_0/5%)]'}`}
                title={`${t.label} (${t.hint})`}
              >
                {t.icon}
                <span>{t.label}</span>
                <kbd className={`text-[9px] px-1 py-px rounded ${active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-black/30 text-zinc-600'}`}>
                  {t.hint}
                </kbd>
              </button>
            )
          })}
        </div>
      </div>

      {/* Panel body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {panel === 'inbox' && (
          <div className="h-full">
            <LeftPanel embedded />
          </div>
        )}
        {panel === 'detail' && (
          <div className="h-full">
            <MiddlePanel embedded />
          </div>
        )}
        {panel === 'scheduler' && (
          <div className="h-full overflow-y-auto waos-scrollbar">
            <SchedulerPanel />
          </div>
        )}
        {panel === 'metrics' && (
          <div className="h-full overflow-y-auto waos-scrollbar">
            <MetricsPanel />
          </div>
        )}
        {panel === 'funnel' && (
          <div className="h-full overflow-y-auto waos-scrollbar">
            <FunnelPanel />
          </div>
        )}
        {panel === 'ab' && (
          <div className="h-full overflow-y-auto waos-scrollbar">
            <AbPanel />
          </div>
        )}
        {panel === 'audit' && (
          <div className="h-full overflow-y-auto waos-scrollbar">
            <AuditPanel />
          </div>
        )}
      </div>
    </div>
  )
}

// Re-export the scheduler/metrics/funnel/ab views from RightPanel
// We import them directly for the embedded mode
import { SchedulerView, MetricsView, FunnelView, AbView } from './RightPanel'
import { useOpsStore as useStore } from '@/store/useOpsStore'

function SchedulerPanel() {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Flame className="w-4 h-4 text-rose-400" />
        <h2 className="text-sm font-semibold text-white">调度器 · 多级优先队列</h2>
      </div>
      <SchedulerView />
    </div>
  )
}

function MetricsPanel() {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Activity className="w-4 h-4 text-emerald-400" />
        <h2 className="text-sm font-semibold text-white">系统指标 · 可观测性</h2>
      </div>
      <MetricsView />
    </div>
  )
}

function FunnelPanel() {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Filter className="w-4 h-4 text-purple-400" />
        <h2 className="text-sm font-semibold text-white">转化漏斗 · 归因</h2>
      </div>
      <FunnelView />
    </div>
  )
}

function AbPanel() {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3 px-1">
        <GitBranch className="w-4 h-4 text-emerald-400" />
        <h2 className="text-sm font-semibold text-white">A/B 实验框架</h2>
      </div>
      <AbView />
    </div>
  )
}

function AuditPanel() {
  const auditLog = useStore(s => s.auditLog)
  const selectLead = useStore(s => s.selectLead)
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Shield className="w-4 h-4 text-orange-400" />
        <h2 className="text-sm font-semibold text-white">审计日志 · 操作留痕</h2>
        <span className="text-[10px] font-mono text-zinc-500 ml-auto">{auditLog.length} entries</span>
      </div>
      {auditLog.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-xs">暂无审计记录</div>
      ) : (
        <ul className="space-y-1">
          {auditLog.slice(0, 100).map(entry => (
            <li
              key={entry.id}
              onClick={() => entry.leadId && selectLead(entry.leadId)}
              className="px-3 py-2 rounded-md bg-[oklch(0.18_0_0)] border border-[oklch(1_0_0/6%)] hover:bg-[oklch(1_0_0/4%)] cursor-pointer transition-colors"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-mono text-emerald-400 font-semibold">{entry.action}</span>
                {entry.from && entry.to && (
                  <span className="text-[10px] font-mono text-zinc-500">{entry.from} → {entry.to}</span>
                )}
                <span className="text-[9px] font-mono px-1.5 py-px rounded bg-[oklch(1_0_0/8%)] text-zinc-400 ml-auto">
                  {entry.actor}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[9px] font-mono text-zinc-600">
                <span>{new Date(entry.ts).toLocaleString('zh-CN', { hour12: false })}</span>
                {entry.leadId && <span>· lead={entry.leadId.slice(0, 12)}</span>}
                {entry.reason && <span className="truncate">· {entry.reason}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
