'use client'

/**
 * WAOS Batch Action Bar
 *
 * A floating bar that appears when leads are selected in batch mode.
 * Supports:
 *  - Select all / clear selection
 *  - Batch actions: force_priority, human_handoff, mark_done, tag_high_intent
 *  - Shows count of selected leads
 *
 * Keyboard: B toggles batch mode, Esc clears selection
 */

import { useOpsStore } from '@/store/useOpsStore'
import {
  ArrowUpRight, Hand, CheckCircle2, Tag, X, CheckSquare, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

export function BatchActionBar() {
  const batchMode = useOpsStore(s => s.batchMode)
  const selectedLeadIds = useOpsStore(s => s.selectedLeadIds)
  const leads = useOpsStore(s => s.leads)
  const toggleBatchMode = useOpsStore(s => s.toggleBatchMode)
  const toggleLeadSelection = useOpsStore(s => s.toggleLeadSelection)
  const selectAllLeads = useOpsStore(s => s.selectAllLeads)
  const clearSelection = useOpsStore(s => s.clearSelection)
  const batchAction = useOpsStore(s => s.batchAction)

  if (!batchMode) return null

  const selectedCount = selectedLeadIds.size
  const totalCount = leads.length

  const handleBatchAction = (action: string, label: string) => {
    if (selectedCount === 0) {
      toast.warning('请先选择至少一个线索')
      return
    }
    batchAction(action)
    toast.success(`${label}完成`, { description: `${selectedCount} 个线索已处理` })
  }

  return (
    <div className="shrink-0 h-12 bg-sky-500/10 border-t border-b border-sky-500/30 flex items-center px-4 gap-3 backdrop-blur">
      {/* Selection info */}
      <div className="flex items-center gap-2 shrink-0">
        <CheckSquare className="w-4 h-4 text-sky-400" />
        <span className="text-xs font-mono text-sky-300 font-semibold">
          已选 <span className="text-base text-sky-200">{selectedCount}</span> / {totalCount}
        </span>
      </div>

      <div className="w-px h-5 bg-sky-500/30 shrink-0" />

      {/* Select all / clear */}
      <button
        onClick={() => selectAllLeads()}
        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono text-sky-300 hover:bg-sky-500/20 border border-sky-500/30 transition-colors shrink-0"
      >
        <CheckSquare className="w-3 h-3" />
        全选
      </button>
      <button
        onClick={() => clearSelection()}
        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono text-zinc-400 hover:bg-accent border border-border transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
        清空选择
      </button>

      <div className="w-px h-5 bg-sky-500/30 shrink-0" />

      {/* Batch actions */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-muted-foreground uppercase mr-1">批量操作:</span>
        <BatchButton
          icon={<ArrowUpRight className="w-3 h-3" />}
          label="强制插队"
          onClick={() => handleBatchAction('force_priority', '批量强制插队')}
          tone="hot"
        />
        <BatchButton
          icon={<Hand className="w-3 h-3" />}
          label="转人工"
          onClick={() => handleBatchAction('human_handoff', '批量转人工')}
          tone="warn"
        />
        <BatchButton
          icon={<CheckCircle2 className="w-3 h-3" />}
          label="标记完成"
          onClick={() => handleBatchAction('mark_done', '批量标记完成')}
          tone="good"
        />
        <BatchButton
          icon={<Tag className="w-3 h-3" />}
          label="打标 high_intent"
          onClick={() => handleBatchAction('tag_high_intent', '批量打标')}
          tone="default"
        />
      </div>

      <div className="flex-1" />

      {/* Exit batch mode */}
      <button
        onClick={() => toggleBatchMode()}
        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 border border-border transition-colors shrink-0"
        title="退出批量模式 (B)"
      >
        <X className="w-3 h-3" />
        退出批量
      </button>
    </div>
  )
}

function BatchButton({
  icon, label, onClick, tone = 'default',
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  tone?: 'hot' | 'warn' | 'good' | 'default'
}) {
  const cls = {
    hot: 'text-rose-300 hover:bg-rose-500/20 border-rose-500/40',
    warn: 'text-orange-300 hover:bg-orange-500/20 border-orange-500/40',
    good: 'text-emerald-300 hover:bg-emerald-500/20 border-emerald-500/40',
    default: 'text-zinc-300 hover:bg-accent border-border',
  }[tone]
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono font-semibold border transition-colors ${cls}`}
    >
      {icon}
      {label}
    </button>
  )
}
