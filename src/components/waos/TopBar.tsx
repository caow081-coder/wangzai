'use client'

import { useOpsStore } from '@/store/useOpsStore'
import { Bell, Settings, ChevronDown, Sparkles, Flame, Bot, Radio, Clock, TrendingUp, Lock, Search, Power, Sun, Moon, Monitor, Brain, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

const MODULE_TABS = [
  { id: 'scheduler',  num: '1', label: '定时任务', icon: <Flame className="w-3.5 h-3.5" /> },
  { id: 'ai',         num: '2', label: 'AI设置',  icon: <Bot className="w-3.5 h-3.5" /> },
  { id: 'channel',    num: '3', label: '全渠道', icon: <Radio className="w-3.5 h-3.5" /> },
  { id: 'lifecycle',  num: '4', label: '客户跟进', icon: <Clock className="w-3.5 h-3.5" /> },
  { id: 'attribution',num: '5', label: '效果分析', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { id: 'infra',      num: '6', label: '系统设置', icon: <Lock className="w-3.5 h-3.5" /> },
] as const

export function TopBar() {
  const activePersonaId = useOpsStore(s => s.activePersonaId)
  const personas = useOpsStore(s => s.personas)
  const setActivePersona = useOpsStore(s => s.setActivePersona)
  const openSettings = useOpsStore(s => s.openSettings)
  const openNotifications = useOpsStore(s => s.openNotifications)
  const setBrainOpen = useOpsStore(s => s.setBrainOpen)
  const modelCookies = useOpsStore(s => s.modelCookies)
  const wechatReal = useOpsStore(s => s.wechatReal)
  const wechatLogin = useOpsStore(s => s.wechatLogin)
  const wechatStart = useOpsStore(s => s.wechatStart)
  const wechatStop = useOpsStore(s => s.wechatStop)
  const notifications = useOpsStore(s => s.notifications)
  const openCommandPalette = useOpsStore(s => s.openCommandPalette)
  const connection = useOpsStore(s => s.connection)
  const focusMode = useOpsStore(s => s.focusMode)
  const setFocusMode = useOpsStore(s => s.setFocusMode)
  const openProDrawer = useOpsStore(s => s.openProDrawer)
  const metrics = useOpsStore(s => s.metrics)
  const killSwitchActive = useOpsStore(s => s.killSwitchActive)
  const toggleKillSwitch = useOpsStore(s => s.toggleKillSwitch)
  const theme = useOpsStore(s => s.settings.theme)
  const updateSettings = useOpsStore(s => s.updateSettings)

  const [personaMenuOpen, setPersonaMenuOpen] = useState(false)
  const unreadCount = notifications.filter(n => !n.read).length
  const activePersona = personas.find(p => p.id === activePersonaId) || personas[0]

  const openModule = (tab: string) => {
    openProDrawer()
    window.dispatchEvent(new CustomEvent('waos:proTab', { detail: tab }))
  }

  return (
    <header className="h-14 shrink-0 flex items-center px-4 gap-3 bg-card/80 backdrop-blur-xl border-b border-border/60">
      {/* Logo — 旺财 */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-lg overflow-hidden shadow-sm ring-1 ring-emerald-500/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wangcai-logo.png" alt="旺财" className="w-full h-full object-cover" />
        </div>
        <span className="font-bold text-[15px] tracking-tight hidden sm:inline bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">旺财</span>
      </div>

      {/* 多微信号切换 */}
      <WechatAccountSwitcher />

      {/* 人设切换 */}
      <div className="relative shrink-0">
        <button
          onClick={() => setPersonaMenuOpen(o => !o)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors apple-btn"
        >
          <span className="text-base">{activePersona?.avatar}</span>
          <span className="text-[12px] font-semibold hidden md:inline">{activePersona?.shortName}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
        {personaMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPersonaMenuOpen(false)} />
            <div className="absolute top-full left-0 mt-1 w-64 bg-card rounded-xl shadow-lg border border-border/60 py-1.5 z-50">
              {personas.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setActivePersona(p.id); setPersonaMenuOpen(false) }}
                  className={`w-full flex items-start gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left ${p.id === activePersonaId ? 'bg-muted/50' : ''}`}
                >
                  <span className="text-xl shrink-0 mt-0.5">{p.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold">{p.shortName}</span>
                      <span className="text-[9px] text-muted-foreground">成交率 {(p.cvr * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">{p.description}</div>
                  </div>
                  {p.id === activePersonaId && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 焦点三态 */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted shrink-0 h-8">
        {([
          { id: 'FOLLOW' as const, label: '自动跟进', color: 'text-emerald-600' },
          { id: 'PIN' as const,    label: '置顶', color: 'text-sky-600' },
          { id: 'DND' as const,    label: '勿扰', color: 'text-muted-foreground' },
        ]).map(m => (
          <button
            key={m.id}
            onClick={() => setFocusMode(m.id)}
            className={`px-2.5 h-7 rounded-md text-[10px] font-medium transition-all apple-btn flex items-center ${
              focusMode === m.id ? `bg-card shadow-sm ${m.color}` : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 6大模块快捷入口 */}
      <div className="flex items-center gap-0.5 shrink-0">
        {MODULE_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => openModule(t.id)}
            className="flex items-center gap-1 px-2.5 h-8 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors apple-btn"
            title={`模块${t.num}: ${t.label}`}
          >
            <span className="text-[8px] opacity-40 font-mono">{t.num}</span>
            {t.icon}
            <span className="hidden lg:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* 实时关键指标 */}
      <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground hidden sm:inline">线索</span>
          <span className="font-semibold">{metrics.activeLeads}</span>
        </span>
        <span className="flex items-center gap-1">
          <Flame className="w-3 h-3 text-rose-500" />
          <span className="font-semibold text-rose-500">{metrics.hotCount}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground hidden sm:inline">队列</span>
          <span className="font-semibold">{metrics.queueDepth}</span>
        </span>
      </div>

      {/* 搜索 */}
      <button
        onClick={() => openCommandPalette()} aria-label="搜索"
        className="flex items-center gap-1 px-2 h-8 rounded-lg text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors apple-btn shrink-0"
      >
        <Search className="w-3.5 h-3.5" />
        <kbd className="text-[9px] px-1 py-0.5 rounded bg-muted border border-border/60 hidden sm:inline">/</kbd>
      </button>

      {/* 连接状态 */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connection === 'connected' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} title={connection === 'connected' ? '已连接' : '连接中'} />

      {/* 真实微信接入 (ClawBot) */}
      <button
        onClick={() => {
          if (!wechatReal.loggedIn) {
            wechatLogin()
          } else if (!wechatReal.running) {
            wechatStart()
          } else {
            wechatStop()
          }
        }}
        className={`relative w-8 h-8 rounded-lg transition-colors apple-btn shrink-0 flex items-center justify-center ${
          wechatReal.running
            ? 'bg-emerald-500/20 text-emerald-600 animate-pulse'
            : wechatReal.loggedIn
            ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
            : 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20'
        }`}
        title={
          wechatReal.running ? '🟢 微信自动回复运行中 — 点击停止'
          : wechatReal.loggedIn ? '✅ 微信已登录 — 点击启动自动回复'
          : '❌ 微信未登录 — 点击扫码登录'
        }
        aria-label="微信连接"
      >
        <MessageCircle className="w-4 h-4" />
        {wechatReal.running && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
        )}
        {wechatReal.messageCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 flex items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
            {wechatReal.messageCount}
          </span>
        )}
      </button>

      {/* AI 大脑 — 多模型登录入口 */}
      <button
        onClick={() => setBrainOpen(true)}
        className={`relative w-8 h-8 rounded-lg transition-colors apple-btn shrink-0 flex items-center justify-center ${
          Object.keys(modelCookies).length > 0
            ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
            : 'hover:bg-muted text-muted-foreground'
        }`}
        title="AI 大脑 — 登录各平台模型" aria-label="AI 大脑"
      >
        <Brain className="w-4 h-4" />
        {Object.keys(modelCookies).length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 flex items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
            {Object.keys(modelCookies).length}
          </span>
        )}
      </button>

      {/* 通知 */}
      <button
        onClick={() => openNotifications()} aria-label="通知"
        className="relative w-8 h-8 rounded-lg hover:bg-muted transition-colors apple-btn shrink-0 flex items-center justify-center"
      >
        <Bell className="w-4 h-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* 苹果风三态主题切换: 自动/浅色/深色 */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted shrink-0 h-8">
        {([
          { id: 'auto' as const, icon: <Monitor className="w-3 h-3" />, label: '自动' },
          { id: 'light' as const, icon: <Sun className="w-3 h-3" />, label: '浅色' },
          { id: 'dark' as const, icon: <Moon className="w-3 h-3" />, label: '深色' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => { updateSettings({ theme: t.id }); toast.info(`主题: ${t.label}`) }}
            className={`flex items-center justify-center w-7 h-7 rounded-md text-[10px] font-medium transition-all apple-btn ${
              theme === t.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* 全局熔断核按钮 */}
      <button
        onClick={() => {
          toggleKillSwitch()
          toast[killSwitchActive ? 'success' : 'error'](
            killSwitchActive ? '🟢 自动化已恢复' : '🔴 全局熔断已激活',
            { description: killSwitchActive ? '所有自动化恢复正常' : '所有自动化已停止，只读模式' }
          )
        }}
        className={`w-8 h-8 rounded-lg transition-colors apple-btn shrink-0 flex items-center justify-center ${
          killSwitchActive ? 'bg-rose-500/20 text-rose-600 animate-pulse' : 'hover:bg-muted text-muted-foreground'
        }`}
        title={killSwitchActive ? '🔴 熔断中 — 点击恢复' : '全局熔断（一键停止所有自动化）'}
      >
        <Power className="w-4 h-4" />
      </button>

      {/* 设置 */}
      <button
        onClick={() => openSettings()} aria-label="设置"
        className="w-8 h-8 rounded-lg hover:bg-muted transition-colors apple-btn shrink-0 flex items-center justify-center"
      >
        <Settings className="w-4 h-4 text-muted-foreground" />
      </button>
    </header>
  )
}

// ─── 多微信号切换器 ──────────────────────────────────────────
function WechatAccountSwitcher() {
  const accounts = useOpsStore(s => s.wechatAccounts)
  const activeId = useOpsStore(s => s.activeWechatId)
  const switchAccount = useOpsStore(s => s.switchWechatAccount)
  const [open, setOpen] = useState(false)
  const active = accounts.find(a => a.id === activeId)

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg hover:bg-muted transition-colors apple-btn"
      >
        <span className="text-[14px]">{active?.avatar}</span>
        <span className="text-[11px] font-medium hidden md:inline">{active?.name.split('-')[1] || active?.name}</span>
        {active && active.unreadCount > 0 && (
          <span className="min-w-[14px] h-3.5 px-1 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {active.unreadCount}
          </span>
        )}
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-64 bg-card rounded-xl shadow-lg border border-border/60 py-1.5 z-50">
            <div className="px-3 py-1 text-[9px] font-semibold text-muted-foreground uppercase">微信号切换</div>
            {accounts.map(a => (
              <button
                key={a.id}
                onClick={() => { switchAccount(a.id); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left ${a.id === activeId ? 'bg-muted/50' : ''}`}
              >
                <span className="text-[18px] shrink-0">{a.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground">{a.phone} · {a.leadCount}客户</div>
                </div>
                {a.unreadCount > 0 && (
                  <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {a.unreadCount}
                  </span>
                )}
                {a.id === activeId && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
