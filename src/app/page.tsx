'use client'

import { useEffect, useState } from 'react'
import { useOpsStore } from '@/store/useOpsStore'
import { useKeyboardNav } from '@/hooks/waos/useKeyboardNav'
import { useKeyboardShortcuts } from '@/hooks/waos/useKeyboardShortcuts'
import { usePersistence } from '@/hooks/waos/usePersistence'
import { TopBar } from '@/components/waos/TopBar'
import { WeChatClient } from '@/components/waos/WeChatClient'
import { DecisionPanel } from '@/components/waos/DecisionPanel'
import { EventStream } from '@/components/waos/EventStream'
import { ProDrawer } from '@/components/waos/ProDrawer'
import { ReplyStudio } from '@/components/waos/ReplyStudio'
import { CommandPalette } from '@/components/waos/CommandPalette'
import { NotificationsDrawer } from '@/components/waos/NotificationsDrawer'
import { SettingsDialog } from '@/components/waos/SettingsDialog'
import { PersonaEditor } from '@/components/waos/PersonaEditor'
import { PersonaMarket } from '@/components/waos/PersonaMarket'
import { DashboardPanel } from '@/components/waos/DashboardPanel'
import { DownloadFloat } from '@/components/waos/DownloadFloat'
import { BrainSettings } from '@/components/waos/BrainSettings'
import { Splashscreen } from '@/components/waos/Splashscreen'
import { ErrorBoundary } from '@/components/waos/ErrorBoundary'
import { UpdateChecker } from '@/components/waos/UpdateChecker'
import { KnowledgePanel } from '@/components/waos/KnowledgePanel'
import { Onboarding } from '@/components/waos/Onboarding'
import { ShortcutsHelp } from '@/components/waos/ShortcutsHelp'

export default function Home() {
  const connect = useOpsStore(s => s.connect)
  const disconnect = useOpsStore(s => s.disconnect)
  const connection = useOpsStore(s => s.connection)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useKeyboardNav()
  useKeyboardShortcuts()
  usePersistence()

  // Sprint 5-1: 首次启动 Onboarding 引导
  useEffect(() => {
    try {
      const completed = localStorage.getItem('waos_onboarding_completed') === 'true'
      if (!completed) {
        // 等 Splashscreen 淡出后再弹出（2.5s），避免视觉打架
        const t = setTimeout(() => setShowOnboarding(true), 2800)
        return () => clearTimeout(t)
      }
    } catch {
      // localStorage 被禁用（隐私模式）— 不弹引导
    }
  }, [])

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      <Splashscreen />
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 flex flex-col bg-secondary/30 border-r border-border/60">
          <ErrorBoundary>
            <WeChatClient />
          </ErrorBoundary>
        </div>
        {/* 右侧决策面板：加宽到 460px，最小 380px，最大 560px，避免内容拥挤 */}
        <div className="w-[460px] min-w-[380px] max-w-[560px] flex flex-col bg-background border-l border-border/60">
          <ErrorBoundary>
            <DecisionPanel />
          </ErrorBoundary>
        </div>
      </div>
      {/* 底部事件流：深色背景用设计 token 而非硬编码 zinc-950 */}
      <div className="h-[140px] min-h-[100px] max-h-[200px] bg-zinc-950 dark:bg-zinc-950 border-t border-border">
        <EventStream />
      </div>
      <ReplyStudio />
      <CommandPalette />
      <NotificationsDrawer />
      <SettingsDialog />
      <PersonaEditor />
      <PersonaMarket />
      <DashboardPanel />
      <ProDrawer />
      <BrainSettings />
      <KnowledgePanel />
      <DownloadFloat />
      <UpdateChecker />
      {/* Sprint 5-1: 首次启动引导 */}
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}
      {/* Sprint 5-3: 快捷键帮助面板（按 ? 召唤）*/}
      <ShortcutsHelp />
      {connection !== 'connected' && (
        <div className="fixed top-16 right-4 z-50 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/30 backdrop-blur">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mr-1.5 align-middle" />
          {connection === 'connecting' ? '连接中…' : '重连中…'}
        </div>
      )}
    </div>
  )
}
