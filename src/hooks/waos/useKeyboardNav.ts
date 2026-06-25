'use client'

/**
 * WAOS 键盘快捷键 — 极简版
 *
 * 核心操作：
 *  J / ↓   — 下一个客户
 *  K / ↑   — 上一个客户
 *  R       — AI 写回复
 *  /       — 搜索
 *  Escape  — 关闭弹窗
 */

import { useEffect } from 'react'
import { useOpsStore } from '@/store/useOpsStore'
import { toast } from 'sonner'

export function useKeyboardNav() {
  const moveCursor = useOpsStore(s => s.moveCursor)
  const selectedLeadId = useOpsStore(s => s.selectedLeadId)
  const openReplyStudio = useOpsStore(s => s.openReplyStudio)
  const closeReplyStudio = useOpsStore(s => s.closeReplyStudio)
  const closeCommandPalette = useOpsStore(s => s.closeCommandPalette)
  const commandPaletteOpen = useOpsStore(s => s.commandPaletteOpen)
  const replyStudioOpen = useOpsStore(s => s.replyStudioOpen)
  const openCommandPalette = useOpsStore(s => s.openCommandPalette)
  const setClientTab = useOpsStore(s => s.setClientTab)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const tag = target?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable

      if (e.key === 'Escape') {
        if (replyStudioOpen) closeReplyStudio()
        else if (commandPaletteOpen) closeCommandPalette()
        return
      }

      if (isInput) return

      if (e.key === '/') {
        e.preventDefault()
        openCommandPalette()
        return
      }

      if (e.metaKey || e.ctrlKey) return

      switch (e.key.toLowerCase()) {
        case 'j':
        case 'arrowdown':
          e.preventDefault()
          moveCursor('down')
          break
        case 'k':
        case 'arrowup':
          e.preventDefault()
          moveCursor('up')
          break
        case 'r':
          e.preventDefault()
          if (selectedLeadId) {
            openReplyStudio(selectedLeadId)
          }
          break
        case '1':
          e.preventDefault()
          setClientTab('chat')
          break
        case '2':
          e.preventDefault()
          setClientTab('moments')
          break
        case '3':
          e.preventDefault()
          setClientTab('contacts')
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    moveCursor, selectedLeadId, openReplyStudio, closeReplyStudio, closeCommandPalette,
    commandPaletteOpen, replyStudioOpen, openCommandPalette, setClientTab,
  ])
}
