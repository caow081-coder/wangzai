'use client'

import { useOpsStore } from '@/store/useOpsStore'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Keyboard } from 'lucide-react'

const KEYS: { key: string; desc: string; cat: string }[] = [
  { key: 'J / ↓', desc: 'Move cursor down', cat: 'Navigation' },
  { key: 'K / ↑', desc: 'Move cursor up', cat: 'Navigation' },
  { key: '/', desc: 'Open command palette', cat: 'Navigation' },
  { key: 'Escape', desc: 'Close modal / palette', cat: 'Navigation' },

  { key: 'R', desc: 'Open AI Reply Studio', cat: 'Action' },
  { key: 'E', desc: 'Force-escalate to HOT queue', cat: 'Action' },
  { key: 'H', desc: 'Hand off to human operator', cat: 'Action' },
  { key: 'Space', desc: 'Mark current lead as done', cat: 'Action' },

  { key: '1', desc: 'Focus mode: FOLLOW (hot auto-steals)', cat: 'Focus' },
  { key: '2', desc: 'Focus mode: PIN (lock current)', cat: 'Focus' },
  { key: '3', desc: 'Focus mode: DND (quiet)', cat: 'Focus' },
  { key: 'P', desc: 'Alias for PIN', cat: 'Focus' },

  { key: 'C', desc: 'Spawn a new simulated lead', cat: 'System' },
  { key: 'L', desc: 'Clear event stream logs', cat: 'System' },
  { key: '?', desc: 'Show this help', cat: 'System' },
]

export function HelpOverlay() {
  // This is triggered by typing ? — but for simplicity, render the help via toast
  // and an inline overlay the user can dismiss. We piggy-back on settings state? 
  // Actually, let's just use a separate state for help.
  // For simplicity, we don't render anything here — the toast in useKeyboardNav
  // already shows the cheat sheet.
  return null
}
