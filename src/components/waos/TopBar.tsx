'use client'

// 旺财顶栏（精简版 UI-COMPACT）
// 设计原则：顶栏只保留"高频核心操作"，所有长尾功能收进设置 Dialog / AI 大脑 Dialog
// 从左到右：
//   1. 旺财 logo
//   2. 多微信号切换
//   3. 人设切换（含"编辑人设"入口）
//   4. 焦点三态（自动跟进 / 置顶 / 勿扰）
//   5. flex-1 占位
//   6. 实时指标（线索 / 队列 — 更紧凑）
//   7. 搜索
//   8. 连接状态点
//   9. 微信连接（登录+启动+停止 三合一）
//  10. AI 大脑（合并：原"AI大脑" + "大模型对接" — 打开统一 Dialog）
//  11. 通知
//  12. 主题切换（浅 / 深 / 自动 — 单按钮循环）
//  13. 全局熔断
//  14. 设置（齿轮 — 点击打开 SettingsDialog，原 6 数字快捷键作为 Dialog 顶部入口）

import { useOpsStore } from '@/store/useOpsStore'
import {
  Bell, Settings, ChevronDown, Flame, Search, Power,
  Sun, Moon, Monitor, Brain, MessageCircle, Pencil, Store,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

// 主题循环顺序：light → dark → auto → light ...
const THEME_CYCLE = ['light', 'dark', 'auto'] as const
const THEME_LABEL: Record<typeof THEME_CYCLE[number], string> = {
  light: '浅色',
  dark: '深色',
  auto: '自动',
}

export function TopBar() {
  const activePersonaId = useOpsStore(s => s.activePersonaId)
  const personas = useOpsStore(s => s.personas)
  const setActivePersona = useOpsStore(s => s.setActivePersona)
  const openSettings = useOpsStore(s => s.openSettings)
  const openNotifications = useOpsStore(s => s.openNotifications)
  const openPersonaEditor = useOpsStore(s => s.openPersonaEditor)
  const openPersonaMarket = useOpsStore(s => s.openPersonaMarket)
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
  const metrics = useOpsStore(s => s.metrics)
  const killSwitchActive = useOpsStore(s => s.killSwitchActive)
  const toggleKillSwitch = useOpsStore(s => s.toggleKillSwitch)
  const theme = useOpsStore(s => s.settings.theme)
  const updateSettings = useOpsStore(s => s.updateSettings)

  const [personaMenuOpen, setPersonaMenuOpen] = useState(false)
  const unreadCount = notifications.filter(n => !n.read).length
  const activePersona = personas.find(p => p.id === activePersonaId) || personas[0]

  // 主题循环切换：light → dark → auto → light
  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme as typeof THEME_CYCLE[number] ?? 'auto')
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
    updateSettings({ theme: next })
    toast.info(`主题切换：${THEME_LABEL[next]}`)
  }
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <header className="h-14 shrink-0 flex items-center px-3 gap-2 bg-card/80 backdrop-blur-xl border-b border-border/60">
      {/* 1. Logo — 旺财 */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-lg overflow-hidden shadow-sm ring-1 ring-emerald-500/20">
          <img src="/wangcai-logo.png" alt="旺财" className="w-full h-full object-cover" />
        </div>
        <span className="font-bold text-[15px] tracking-tight hidden sm:inline bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">旺财</span>
      </div>

      {/* 2. 多微信号切换 */}
      <WechatAccountSwitcher />

      {/* 3. 人设切换（含编辑入口） */}
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
              {/* 编辑人设入口 + 新建人设入口 + 模板市场入口 */}
              <div className="border-t border-border/60 mt-1 pt-1">
                <button
                  onClick={() => { openPersonaEditor(activePersona?.id ?? null); setPersonaMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors apple-btn"
                >
                  <Pencil className="w-3 h-3" />
                  ✏️ 编辑当前人设
                </button>
                <button
                  onClick={() => { const newId = useOpsStore.getState().createPersona(); useOpsStore.getState().openPersonaEditor(newId); setPersonaMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors apple-btn"
                >
                  <span className="text-[12px] leading-none">＋</span>
                  ✨ 新建人设
                </button>
                <button
                  onClick={() => { openPersonaMarket(); setPersonaMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 transition-colors apple-btn"
                >
                  <Store className="w-3 h-3" />
                  📋 模板市场
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 4. 焦点三态 */}
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

      {/* 5. 占位 */}
      <div className="flex-1" />

      {/* 6. 实时关键指标（紧凑） */}
      <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
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

      {/* 7. 搜索 */}
      <button
        onClick={() => openCommandPalette()} aria-label="搜索"
        className="flex items-center gap-1 px-2 h-8 rounded-lg text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors apple-btn shrink-0"
      >
        <Search className="w-3.5 h-3.5" />
        <kbd className="text-[9px] px-1 py-0.5 rounded bg-muted border border-border/60 hidden sm:inline">/</kbd>
      </button>

      {/* 8. 连接状态点 */}
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${connection === 'connected' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}
        title={connection === 'connected' ? '已连接' : '连接中'}
      />

      {/* 9. 微信连接（登录+启动+停止 三合一） */}
      <button
        onClick={() => {
          if (!wechatReal.loggedIn) {
            toast.info('正在唤起微信登录…', { description: '请在 Electron 端扫码完成登录' })
            wechatLogin()
          } else if (!wechatReal.running) {
            toast.info('正在启动自动回复…', { description: 'AI 大脑即将接管新消息' })
            wechatStart()
          } else {
            toast.warning('已停止微信自动回复', { description: '机器人不再自动接管新消息' })
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
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 flex items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
            {wechatReal.messageCount}
          </span>
        )}
      </button>

      {/* 10. AI 大脑（统一入口：原 AI 大脑 + 大模型对接 合并） */}
      <button
        onClick={() => setBrainOpen(true)}
        className={`relative w-8 h-8 rounded-lg transition-colors apple-btn shrink-0 flex items-center justify-center ${
          Object.keys(modelCookies).length > 0
            ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
            : 'hover:bg-muted text-muted-foreground'
        }`}
        title="AI 大脑 — 模型配置 / 逆向扫码 / 测试统计"
        aria-label="AI 大脑"
      >
        <Brain className="w-4 h-4" />
        {Object.keys(modelCookies).length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 flex items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
            {Object.keys(modelCookies).length}
          </span>
        )}
      </button>

      {/* 11. 通知 */}
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

      {/* 12. 主题切换（单按钮循环：light → dark → auto） */}
      <button
        onClick={cycleTheme}
        className="w-8 h-8 rounded-lg hover:bg-muted transition-colors apple-btn shrink-0 flex items-center justify-center"
        title={`主题：${THEME_LABEL[theme as typeof THEME_CYCLE[number]] ?? '自动'}（点击切换）`}
        aria-label="主题切换"
      >
        <ThemeIcon className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* 13. 全局熔断核按钮 */}
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

      {/* 14. 设置（齿轮 — 原 6 数字快捷键收进这里） */}
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
