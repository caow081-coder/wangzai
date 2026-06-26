'use client'

/**
 * 旺财 · 快捷键帮助面板（Sprint 5-3）
 *
 * 按 `?` 弹出，列出所有可用快捷键，按「导航 / 操作 / 帮助」分组。
 * 监听 useKeyboardShortcuts 派发的 'waos:toggle-shortcuts-help' 事件。
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Compass, Zap, HelpCircle, Keyboard,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { SHORTCUTS, TOGGLE_SHORTCUTS_HELP_EVENT, type ShortcutDef } from '@/hooks/waos/useKeyboardShortcuts'

const GROUP_META: Record<ShortcutDef['group'], {
  label: string
  icon: typeof Compass
  color: string
}> = {
  navigation: { label: '导航', icon: Compass, color: 'text-emerald-600 dark:text-emerald-400' },
  action: { label: '操作', icon: Zap, color: 'text-sky-600 dark:text-sky-400' },
  help: { label: '帮助', icon: HelpCircle, color: 'text-amber-600 dark:text-amber-400' },
}

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = () => setOpen(o => !o)
    window.addEventListener(TOGGLE_SHORTCUTS_HELP_EVENT, handler)
    return () => window.removeEventListener(TOGGLE_SHORTCUTS_HELP_EVENT, handler)
  }, [])

  // 按 group 分组
  const groups: ShortcutDef['group'][] = ['navigation', 'action', 'help']

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">旺财快捷键帮助</DialogTitle>
        <DialogDescription className="sr-only">
          查看旺财所有可用键盘快捷键
        </DialogDescription>

        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-border/60 bg-muted/30 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shrink-0">
            <Keyboard className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">旺财快捷键</h2>
            <p className="text-[11px] text-muted-foreground">让接客效率翻倍的 12 个快捷键</p>
          </div>
          <Badge variant="outline" className="text-[10px] h-5 px-1.5">
            <kbd className="font-mono">?</kbd> 召唤
          </Badge>
        </div>

        {/* 分组列表 */}
        <div className="max-h-[60vh] overflow-y-auto waos-scrollbar p-4 space-y-5">
          {groups.map((g) => {
            const meta = GROUP_META[g]
            const Icon = meta.icon
            const items = SHORTCUTS.filter(s => s.group === g)
            if (items.length === 0) return null
            return (
              <motion.div
                key={g}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {meta.label}
                  </span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <div className="space-y-1">
                  {items.map((s, i) => (
                    <div
                      key={`${s.description}-${i}`}
                      className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-1 shrink-0 min-w-[110px]">
                        {s.keys.map((k, j) => (
                          <span key={j} className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/80 text-[10px] font-mono font-semibold text-foreground shadow-sm">
                              {k}
                            </kbd>
                            {j < s.keys.length - 1 && (
                              <span className="text-[10px] text-muted-foreground/60">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-foreground/90 truncate">{s.description}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* 底部提示 */}
        <div className="px-5 py-3 border-t border-border/60 bg-muted/30 text-[10px] text-muted-foreground/80 leading-relaxed">
          💡 输入框内时，仅 <kbd className="px-1 py-0.5 rounded bg-muted border border-border/60 font-mono text-[9px]">Ctrl/⌘ + K</kbd> 等组合键生效，
          单键 J/K/R/? 会被输入框拦截。
        </div>
      </DialogContent>
    </Dialog>
  )
}
