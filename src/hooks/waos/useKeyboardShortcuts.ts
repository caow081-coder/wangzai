'use client'

/**
 * 旺财 · 全局键盘快捷键 Hook（Sprint 5-3）
 *
 * 快捷键表：
 *  Ctrl/Cmd + K        — 打开命令面板（即使输入框也响应）
 *  Ctrl/Cmd + 1        — 切换到「聊天」tab
 *  Ctrl/Cmd + 2        — 切换到「朋友圈」tab
 *  Ctrl/Cmd + 3        — 切换到「视频号」tab
 *  Ctrl/Cmd + 4        — 打开设置
 *  Ctrl/Cmd + 5        — 打开 SOP 引擎 tab
 *  J / K               — 上下切换客户（会话列表，输入框内不响应）
 *  R                   — 快速回复（当前选中客户，输入框内不响应）
 *  ?                   — 显示快捷键帮助面板
 *  Escape              — 关闭弹窗（沿用既有逻辑）
 *
 * 与 useKeyboardNav 并存：本 hook 仅处理 ⌘+数字 / ⌘+K / ? 等新增快捷键，
 * J/K/R/Escape 仍由 useKeyboardNav 处理（避免重复触发）。
 *
 * ShortcutsHelp 弹窗的开关通过事件总线通信：
 *  - useKeyboardShortcuts 派发 'waos:toggle-shortcuts-help' 事件
 *  - ShortcutsHelp 监听该事件并响应
 * 这样可以解耦 hook 与组件，避免循环依赖。
 */

import { useEffect } from 'react'
import { useOpsStore } from '@/store/useOpsStore'
import { toast } from 'sonner'

/** 切换快捷键帮助面板的自定义事件名 */
export const TOGGLE_SHORTCUTS_HELP_EVENT = 'waos:toggle-shortcuts-help'

/** 派发「切换快捷键帮助」事件（供其他组件 / 设置按钮复用） */
export function toggleShortcutsHelp() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TOGGLE_SHORTCUTS_HELP_EVENT))
}

export function useKeyboardShortcuts() {
  const setClientTab = useOpsStore(s => s.setClientTab)
  const openSettings = useOpsStore(s => s.openSettings)
  const openCommandPalette = useOpsStore(s => s.openCommandPalette)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (target?.isContentEditable ?? false)

      // ─── 全局快捷键（即使输入框内也响应）─────────────────
      // Ctrl/Cmd + K：打开命令面板
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        openCommandPalette()
        return
      }

      // ─── 模块切换快捷键（输入框内不响应）─────────────────
      if (isMod && !isInput) {
        if (e.key === '1') {
          e.preventDefault()
          setClientTab('chat')
          toast.info('已切换到「聊天」', { duration: 1200 })
          return
        }
        if (e.key === '2') {
          e.preventDefault()
          setClientTab('moments')
          toast.info('已切换到「朋友圈」', { duration: 1200 })
          return
        }
        if (e.key === '3') {
          e.preventDefault()
          setClientTab('channels')
          toast.info('已切换到「视频号」', { duration: 1200 })
          return
        }
        if (e.key === '4') {
          e.preventDefault()
          openSettings()
          return
        }
        if (e.key === '5') {
          e.preventDefault()
          setClientTab('sop')
          toast.info('已切换到「SOP 引擎」', { duration: 1200 })
          return
        }
      }

      // ─── 单键快捷键（输入框内不响应）─────────────────────
      if (isInput || isMod) return

      // ? 显示快捷键帮助（Shift+/ = ?，所以判断 e.key === '?'）
      if (e.key === '?') {
        e.preventDefault()
        toggleShortcutsHelp()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setClientTab, openSettings, openCommandPalette])
}

// ─── 快捷键定义表（供 ShortcutsHelp 展示）────────────────────
export interface ShortcutDef {
  keys: string[]
  description: string
  group: 'navigation' | 'action' | 'help'
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: ['Ctrl/⌘', 'K'], description: '打开命令面板', group: 'navigation' },
  { keys: ['Ctrl/⌘', '1'], description: '切换到「聊天」', group: 'navigation' },
  { keys: ['Ctrl/⌘', '2'], description: '切换到「朋友圈」', group: 'navigation' },
  { keys: ['Ctrl/⌘', '3'], description: '切换到「视频号」', group: 'navigation' },
  { keys: ['Ctrl/⌘', '4'], description: '打开「设置」', group: 'navigation' },
  { keys: ['Ctrl/⌘', '5'], description: '打开「SOP 引擎」', group: 'navigation' },
  { keys: ['J'], description: '下一个客户（会话列表）', group: 'action' },
  { keys: ['K'], description: '上一个客户（会话列表）', group: 'action' },
  { keys: ['R'], description: '快速回复（当前选中客户）', group: 'action' },
  { keys: ['/'], description: '聚焦搜索 / 打开命令面板', group: 'action' },
  { keys: ['Esc'], description: '关闭当前弹窗', group: 'action' },
  { keys: ['?'], description: '显示本快捷键帮助', group: 'help' },
]
