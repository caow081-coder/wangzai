'use client'

import { useOpsStore, useUnreadNotificationsCount, type NotificationItem, type NotificationLevel } from '@/store/useOpsStore'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Bell, Flame, AlertTriangle, Hand, Info, CheckCircle2, Trash2, CheckCheck, ExternalLink,
} from 'lucide-react'

const LEVEL_META: Record<NotificationLevel, { color: string; bg: string; border: string; icon: React.ReactNode; label: string }> = {
  critical: { color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    icon: <Hand className="w-3.5 h-3.5" />,         label: '紧急' },
  hot:      { color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  icon: <Flame className="w-3.5 h-3.5" />,        label: 'HOT' },
  warn:     { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: <AlertTriangle className="w-3.5 h-3.5" />, label: '警告' },
  info:     { color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     icon: <Info className="w-3.5 h-3.5" />,          label: '信息' },
}

export function NotificationsDrawer() {
  const open = useOpsStore(s => s.notificationsOpen)
  const close = useOpsStore(s => s.closeNotifications)
  const notifications = useOpsStore(s => s.notifications)
  const markRead = useOpsStore(s => s.markNotificationRead)
  const markAllRead = useOpsStore(s => s.markAllNotificationsRead)
  const clear = useOpsStore(s => s.clearNotifications)
  const selectLead = useOpsStore(s => s.selectLead)

  const handleClick = (n: NotificationItem) => {
    markRead(n.id)
    if (n.leadId) {
      selectLead(n.leadId)
      close()
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent
        side="right"
        className="w-[400px] p-0 bg-[oklch(0.165_0_0)] border-[oklch(1_0_0/12%)] text-zinc-100"
      >
        <SheetHeader className="px-4 py-3 border-b border-[oklch(1_0_0/8%)] bg-[oklch(0.18_0_0)]">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bell className="w-4 h-4 text-emerald-400" />
              {notifications.some(n => !n.read) && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              )}
            </div>
            <SheetTitle className="text-sm font-semibold text-white">
              通知中心
            </SheetTitle>
            <span className="text-[10px] font-mono text-zinc-500">
              ({notifications.filter(n => !n.read).length} unread / {notifications.length} total)
            </span>
          </div>
          <SheetDescription className="text-[11px] text-zinc-400 sr-only">
            实时关键事件流 — HOT 线索接入、AI 熔断降级、安全护盾拦截、人工接管等
          </SheetDescription>
          <p className="text-[11px] text-zinc-400 mt-1">
            实时关键事件流 — HOT 线索接入、AI 熔断降级、安全护盾拦截、人工接管等
          </p>
        </SheetHeader>

        {/* Toolbar */}
        <div className="shrink-0 px-3 py-2 border-b border-[oklch(1_0_0/8%)] flex items-center gap-1.5">
          <button
            onClick={markAllRead}
            disabled={notifications.every(n => n.read)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-zinc-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-[oklch(1_0_0/8%)] disabled:opacity-40 transition-colors"
          >
            <CheckCheck className="w-3 h-3" />
            全部已读
          </button>
          <button
            onClick={clear}
            disabled={notifications.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 border border-[oklch(1_0_0/8%)] disabled:opacity-40 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            清空
          </button>
          <div className="ml-auto flex items-center gap-1 text-[9px] font-mono text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>实时推送中</span>
          </div>
        </div>

        {/* Notifications list */}
        <div className="flex-1 min-h-0 overflow-y-auto waos-scrollbar">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-[oklch(1_0_0/5%)] flex items-center justify-center mb-3">
                <CheckCircle2 className="w-5 h-5 text-zinc-600" />
              </div>
              <p className="text-xs font-mono text-zinc-500 mb-1">暂无通知</p>
              <p className="text-[10px] text-zinc-600">系统运行平稳，无关键事件</p>
            </div>
          ) : (
            <ul className="divide-y divide-[oklch(1_0_0/5%)]">
              {notifications.map(n => {
                const meta = LEVEL_META[n.level]
                return (
                  <li
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`px-3 py-2.5 cursor-pointer hover:bg-[oklch(1_0_0/4%)] transition-colors group ${!n.read ? meta.bg + ' border-l-2 border-l-' + n.level : 'border-l-2 border-l-transparent'}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`shrink-0 w-7 h-7 rounded-full ${meta.bg} ${meta.border} border flex items-center justify-center ${meta.color}`}>
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-[12px] font-semibold ${!n.read ? 'text-white' : 'text-zinc-400'}`}>
                            {n.title}
                          </span>
                          <span className={`text-[9px] font-mono px-1 py-px rounded ${meta.bg} ${meta.color} border ${meta.border} ml-auto`}>
                            {meta.label}
                          </span>
                          {!n.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                          )}
                        </div>
                        <p className={`text-[11px] mt-0.5 ${!n.read ? 'text-zinc-300' : 'text-zinc-500'}`}>
                          {n.message}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 text-[9px] font-mono text-zinc-600">
                          <span>{new Date(n.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                          {n.leadName && (
                            <>
                              <span>·</span>
                              <span className="text-zinc-500">{n.leadName}</span>
                            </>
                          )}
                          {n.traceId && (
                            <>
                              <span>·</span>
                              <span className="truncate">{n.traceId.slice(0, 14)}</span>
                            </>
                          )}
                          {n.leadId && (
                            <ExternalLink className="w-2.5 h-2.5 ml-auto opacity-0 group-hover:opacity-60" />
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
