'use client'

import { useOpsStore, type LeadMessage } from '@/store/useOpsStore'
import {
  MessageCircle, Camera, Users, Send, Smile, Plus, ChevronLeft, MoreVertical,
  Heart, MessageSquare, Shield, Loader2, Clock, Sparkles, Search, Phone, Video,
  PanelLeft, Image as ImageIcon, FileText, Scissors, ScreenShare, Folder,
  ChevronRight, X, Zap, AlertTriangle, Monitor, Star, Grid3x3, Settings as SettingsIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { MomentsPanel } from '@/components/waos/MomentsPanel'
import { SopPanel } from '@/components/waos/sop/SopPanel'
import { useElectronBridge, PlatformEmbedView } from '@/hooks/waos/useElectronBridge'
import { PlatformEmbedLayout } from '@/components/waos/PlatformEmbedLayout'

type NavTab = 'chat' | 'contacts' | 'favorites' | 'moments' | 'miniprogram' | 'channels' | 'intercept' | 'sop'

// 真实 PC 微信左侧导航栏布局：聊天/通讯录/收藏/朋友圈/小程序/视频号/设置
// SOP 引擎入口移到人设系统（不再独立 nav），但保留 tab 可从人设编辑器跳转
const NAV_ITEMS: { id: NavTab; icon: React.ReactNode; label: string; badge?: number }[] = [
  { id: 'chat',       icon: <MessageCircle className="w-[22px] h-[22px]" />, label: '聊天', badge: 3 },
  { id: 'contacts',   icon: <Users className="w-[22px] h-[22px]" />, label: '通讯录' },
  { id: 'favorites',  icon: <Star className="w-[22px] h-[22px]" />, label: '收藏' },
  { id: 'moments',    icon: <Camera className="w-[22px] h-[22px]" />, label: '朋友圈' },
  { id: 'channels',   icon: <Video className="w-[22px] h-[22px]" />, label: '视频号' },
  { id: 'miniprogram',icon: <Grid3x3 className="w-[22px] h-[22px]" />, label: '小程序' },
]

// 截流目标类型（对齐 store.videoIntercept.targets 结构，修复 unknown 类型推断）
interface InterceptTargetType {
  id: string
  userName: string
  avatar: string
  comment: string
  intentScore: number
  intentReason: string
  videoTitle: string
  videoPlayCount: number
  dmMessage?: string
  dmStatus: 'pending' | 'sent' | 'replied'
  dmRepliedAt?: string
}

export function WeChatClient() {
  const navTab = useOpsStore(s => s.clientTab)
  const setNavTab = useOpsStore(s => s.setClientTab)
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)
  const wechatReal = useOpsStore(s => s.wechatReal)

  return (
    <div className="flex h-full min-h-0 bg-[#f5f5f5] dark:bg-[#1e1e1e]">
      {/* ─── 左侧导航栏（模拟真实 PC 微信窄条）────────────────────────── */}
      <nav className="w-[56px] shrink-0 bg-[#2e2e2e] dark:bg-[#1a1a1a] flex flex-col items-center py-3 gap-1 border-r border-black/20">
        {/* 个人头像 — 显示微信连接状态 */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[14px] mb-2 relative cursor-pointer ${
          wechatReal.running ? 'bg-gradient-to-br from-emerald-400 to-teal-500' :
          wechatReal.loggedIn ? 'bg-gradient-to-br from-sky-400 to-blue-500' :
          'bg-zinc-600'
        }`} title={
          wechatReal.running ? '🟢 微信自动回复运行中' :
          wechatReal.loggedIn ? '✅ 微信已登录' : '❌ 微信未登录'
        }>
          {wechatReal.running ? '🤖' : wechatReal.loggedIn ? '🌿' : '⚠️'}
          {wechatReal.running && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#2e2e2e] animate-pulse" />
          )}
        </div>

        {/* 真实微信导航按钮组 */}
        {NAV_ITEMS.map(item => (
          <NavButton
            key={item.id}
            active={navTab === item.id}
            onClick={() => setNavTab(item.id)}
            icon={item.icon}
            label={item.label}
            badge={item.badge}
          />
        ))}

        {/* 视频号截流（高级功能，放底部） */}
        <NavButton active={navTab === 'intercept'} onClick={() => setNavTab('intercept')} icon={<Zap className="w-[22px] h-[22px]" />} label="截流" />

        <div className="flex-1" />

        {/* 底部：设置 + 更多 */}
        <button className="w-9 h-9 rounded-lg flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors" title="设置">
          <SettingsIcon className="w-[18px] h-[18px]" />
        </button>
        <button className="w-9 h-9 rounded-lg flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors" title="更多">
          <MoreVertical className="w-[18px] h-[18px]" />
        </button>
      </nav>

      {/* ─── 中间内容区 ──────────────────────────────────────── */}
      {navTab === 'chat' && <ChatLayout />}
      {navTab === 'contacts' && <ContactsLayout />}
      {navTab === 'favorites' && <PlaceholderLayout title="收藏" icon={<Star className="w-12 h-12 text-muted-foreground" />} desc="收藏的聊天记录、文件、链接" />}
      {navTab === 'moments' && (
        <PlatformEmbedLayout platform="wechat" title="朋友圈" icon="📸" description="微信朋友圈场控" defaultEmbed={false}>
          <MomentsPanel />
        </PlatformEmbedLayout>
      )}
      {navTab === 'channels' && (
        <PlatformEmbedLayout platform="video" title="视频号" icon="📹" description="微信视频号内容流">
          <PlaceholderLayout title="视频号" icon={<Video className="w-12 h-12 text-muted-foreground" />} desc="打包后嵌入真实视频号（channels.weixin.qq.com）" />
        </PlatformEmbedLayout>
      )}
      {navTab === 'miniprogram' && <PlaceholderLayout title="小程序" icon={<Grid3x3 className="w-12 h-12 text-muted-foreground" />} desc="我的小程序" />}
      {navTab === 'intercept' && (
        <PlatformEmbedLayout platform="video" title="视频号截流" icon="⚡" description="高意向评论自动私信" defaultEmbed={false}>
          <InterceptLayout />
        </PlatformEmbedLayout>
      )}
      {navTab === 'sop' && <SopPanel />}
    </div>
  )
}

function PlaceholderLayout({ title, icon, desc }: { title: string; icon: React.ReactNode; desc: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#f5f5f5] dark:bg-[#1e1e1e]">
      <div className="text-center">
        <div className="flex justify-center mb-3 opacity-40">{icon}</div>
        <h3 className="text-[15px] font-medium text-muted-foreground mb-1">{title}</h3>
        <p className="text-[11px] text-muted-foreground/60">{desc}</p>
      </div>
    </div>
  )
}

function NavButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
        active ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'
      }`}
    >
      {icon}
      <span className="text-[9px] font-medium">{label}</span>
      {badge && badge > 0 && (
        <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-1 flex items-center justify-center rounded-full bg-[#fa5151] text-white text-[8px] font-bold">
          {badge}
        </span>
      )}
    </button>
  )
}

// ─── 聊天布局: 会话列表 + 聊天窗口 ────────────────────────────
function ChatLayout() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)
  const wechatReal = useOpsStore(s => s.wechatReal)
  const wechatLogin = useOpsStore(s => s.wechatLogin)
  const wechatStart = useOpsStore(s => s.wechatStart)
  const wechatStop = useOpsStore(s => s.wechatStop)

  return (
    <>
      {/* 会话列表 */}
      <div className="w-[280px] shrink-0 bg-white dark:bg-[#2a2a2a] border-r border-black/5 dark:border-white/5 flex flex-col">
        {/* 微信连接状态条 */}
        <WeChatStatusBar
          loggedIn={wechatReal.loggedIn}
          running={wechatReal.running}
          messageCount={wechatReal.messageCount}
          replyCount={wechatReal.replyCount}
          loginLoading={wechatReal.loginLoading}
          onLogin={() => wechatLogin()}
          onStart={() => wechatStart()}
          onStop={() => wechatStop()}
        />
        {/* 搜索 */}
        <div className="p-2.5 border-b border-black/5 dark:border-white/5">
          <div className="px-2.5 py-1.5 rounded bg-[#f5f5f5] dark:bg-[#1e1e1e] flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-[#7a7a7a] dark:text-[#9a9a9a]" />
            <span className="text-[12px] text-[#7a7a7a] dark:text-[#9a9a9a]">搜索</span>
          </div>
        </div>
        {/* 会话项 */}
        <ConversationList />
      </div>

      {/* 聊天窗口 */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#f5f5f5] dark:bg-[#1e1e1e]">
        {lead ? <ChatWindow /> : <EmptyChat />}
      </div>
    </>
  )
}

// ─── 微信连接状态条 ──────────────────────────────────────────
function WeChatStatusBar({ loggedIn, running, messageCount, replyCount, loginLoading, onLogin, onStart, onStop }: {
  loggedIn: boolean
  running: boolean
  messageCount: number
  replyCount: number
  loginLoading: boolean
  onLogin: () => void
  onStart: () => void
  onStop: () => void
}) {
  if (running) {
    // 运行中：绿色状态条
    return (
      <div className="shrink-0 px-3 py-2 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-emerald-700">🤖 AI 自动回复运行中</div>
          <div className="text-[9px] text-emerald-600/70">收{messageCount} · 回{replyCount} · ClawBot 已接管</div>
        </div>
        <button onClick={onStop} className="px-2 py-1 rounded text-[10px] font-medium bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 apple-btn">
          停止
        </button>
      </div>
    )
  }

  if (loggedIn) {
    // 已登录未运行：蓝色提示启动
    return (
      <div className="shrink-0 px-3 py-2 bg-sky-500/10 border-b border-sky-500/20 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-sky-700">✅ 微信已登录</div>
          <div className="text-[9px] text-sky-600/70">点击启动 AI 自动回复</div>
        </div>
        <button onClick={onStart} className="px-2.5 py-1 rounded text-[10px] font-medium bg-emerald-500 text-white hover:bg-emerald-600 apple-btn flex items-center gap-1">
          <Zap className="w-2.5 h-2.5" />
          启动AI
        </button>
      </div>
    )
  }

  // 未登录：红色提示扫码
  return (
    <div className="shrink-0 px-3 py-2 bg-rose-500/10 border-b border-rose-500/20 flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-rose-700">⚠️ 微信未连接</div>
        <div className="text-[9px] text-rose-600/70">扫码登录真实微信，启用自动回复</div>
      </div>
      <button onClick={onLogin} disabled={loginLoading}
        className="px-2.5 py-1 rounded text-[10px] font-medium bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 apple-btn flex items-center gap-1">
        {loginLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <MessageCircle className="w-2.5 h-2.5" />}
        {loginLoading ? '连接中' : '扫码登录'}
      </button>
    </div>
  )
}

function ConversationList() {
  const leads = useOpsStore(s => s.leads)
  const selectedLeadId = useOpsStore(s => s.clientViewLeadId)
  const selectLead = useOpsStore(s => s.selectLead)

  return (
    <div className="flex-1 overflow-y-auto waos-scrollbar">
      {leads.slice(0, 30).map(lead => {
        const active = lead.id === selectedLeadId
        return (
          <button
            key={lead.id}
            onClick={() => selectLead(lead.id)}
            className={`w-full flex items-start gap-2.5 px-3 py-2.5 border-b border-black/3 dark:border-white/5 text-left transition-colors ${
              active ? 'bg-[#d6d6d6] dark:bg-[#3a3a3a]' : 'hover:bg-[#f5f5f5] dark:hover:bg-[#333]'
            }`}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-[14px] font-semibold text-white shrink-0 relative"
              style={{ background: lead.personaColor || '#86868b' }}
            >
              {lead.userName.slice(0, 1)}
              {lead.unread && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[#fa5151] text-white text-[9px] font-bold">
                  {lead.messages?.length || 1}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium truncate">{lead.userName}</span>
                <span className="text-[10px] text-[#7a7a7a] dark:text-[#9a9a9a] shrink-0 ml-2">{convTime(lead.lastTouchAt)}</span>
              </div>
              <div className="text-[11px] text-[#7a7a7a] dark:text-[#9a9a9a] truncate mt-0.5">{lead.lastMessage}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function EmptyChat() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <MessageCircle className="w-12 h-12 text-[#d6d6d6] mx-auto mb-2" />
        <p className="text-[13px] text-[#7a7a7a] dark:text-[#9a9a9a]">未选择聊天</p>
        <p className="text-[11px] text-[#b0b0b0] dark:text-[#666] mt-1">从左侧选择一位客户开始对话</p>
      </div>
    </div>
  )
}

function ChatWindow() {
  const lead = useOpsStore(s => s.leads.find(l => l.id === s.clientViewLeadId) || null)
  const draft = useOpsStore(s => s.clientDraft)
  const setClientDraft = useOpsStore(s => s.setClientDraft)
  const sending = useOpsStore(s => s.clientSending)
  const typing = useOpsStore(s => s.clientTyping)
  const sendClientMessage = useOpsStore(s => s.sendClientMessage)
  const suggestions = useOpsStore(s => s.replySuggestions)
  const applySuggestion = useOpsStore(s => s.applySuggestion)
  const activePersonaId = useOpsStore(s => s.activePersonaId)
  const personas = useOpsStore(s => s.personas)
  const persona = personas.find(p => p.id === activePersonaId) || personas[0]
  const { isDesktop, sendToPlatform } = useElectronBridge()
  // 桌面端默认启用真实嵌入（初始值直接计算，避免 effect 内 setState）
  const [embedMode, setEmbedMode] = useState(() => isDesktop)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lead?.messages, typing])

  const handleSend = async () => {
    if (!draft.trim() || sending) return
    // 桌面端嵌入模式：直接通过 IPC 发送到真实微信
    if (embedMode && isDesktop) {
      const r = await sendToPlatform('wechat', draft)
      if (r.success) {
        setClientDraft('')
        toast.success('已发送到微信')
      } else {
        toast.error(`发送失败: ${r.error || '未知错误'}`)
      }
      return
    }
    // 网页端模拟：走 store 的 sendClientMessage
    sendClientMessage()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!lead) return <EmptyChat />

  // ─── 桌面端真实嵌入模式 ───
  // Electron 环境下，用 BrowserView 嵌入真实微信网页版（wx.qq.com）
  // 用户扫码登录后，左侧显示的是真实微信客户端，非模拟数据
  if (embedMode && isDesktop) {
    return (
      <div className="flex flex-col h-full">
        {/* 顶部工具栏 */}
        <div className="h-9 shrink-0 bg-[#f5f5f5] dark:bg-[#1e1e1e] border-b border-black/5 dark:border-white/5 flex items-center px-3 gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <Monitor className="w-3 h-3" />
            <span>真实微信嵌入</span>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setEmbedMode(false)}
            className="text-[10px] px-2 py-0.5 rounded border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-[#7a7a7a] dark:text-[#9a9a9a]"
            title="切换到模拟模式（调试用）"
          >
            模拟模式
          </button>
        </div>

        {/* 真实微信 BrowserView 嵌入区 */}
        <div className="flex-1 min-h-0 relative">
          <PlatformEmbedView
            platform="wechat"
            active={true}
            placeholder={
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mx-auto mb-2" />
                  <p className="text-[12px] text-muted-foreground">加载微信中…</p>
                </div>
              </div>
            }
          />
        </div>

        {/* 底部输入栏（桌面端：输入后通过 IPC 发送到真实微信）*/}
        <div className="shrink-0 border-t border-black/5 dark:border-white/5 bg-white dark:bg-[#2a2a2a] p-2">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setClientDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息，Enter 发送到真实微信…"
              className="flex-1 px-3 py-2 text-[13px] bg-transparent resize-none focus:outline-none placeholder:text-[#b0b0b0] dark:text-white max-h-24"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              className="px-4 py-1.5 rounded bg-[#07C160] text-white text-[12px] hover:bg-[#06ad56] disabled:opacity-40 flex items-center gap-1"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              发送
            </button>
          </div>
          <p className="text-[9px] text-[#b0b0b0] dark:text-[#666] mt-1 px-1">
            ⚠️ 消息将通过微信网页版真实发送，已启用防封延迟（2-4秒）+ 行为漂移检测
          </p>
        </div>
      </div>
    )
  }

  // ─── 网页端模拟模式（默认）───

  return (
    <div className="flex flex-col h-full">
      {/* 聊天 header */}
      <div className="h-14 shrink-0 bg-[#f5f5f5] dark:bg-[#1e1e1e] border-b border-black/5 dark:border-white/5 flex items-center px-5 gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold truncate">{lead.userName}</h3>
          <p className="text-[10px] text-[#7a7a7a] dark:text-[#9a9a9a]">
            {sourceLabel(lead.source)} · {lead.messages?.length || 0} 条消息
          </p>
        </div>
        <button className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"><Phone className="w-4 h-4 text-[#7a7a7a] dark:text-[#9a9a9a]" /></button>
        <button className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"><Video className="w-4 h-4 text-[#7a7a7a] dark:text-[#9a9a9a]" /></button>
        <button className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"><PanelLeft className="w-4 h-4 text-[#7a7a7a] dark:text-[#9a9a9a]" /></button>
        {isDesktop && (
          <button
            onClick={() => setEmbedMode(true)}
            className="ml-2 text-[10px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/20 flex items-center gap-1"
            title="切换到真实微信嵌入（Electron BrowserView）"
          >
            <Monitor className="w-3 h-3" />
            真实嵌入
          </button>
        )}
      </div>

      {/* 推荐回复 chips */}
      {suggestions.length > 0 && !draft && (
        <div className="shrink-0 px-4 py-2 bg-white dark:bg-[#2a2a2a] border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3 h-3 text-[#07C160]" />
            <span className="text-[10px] font-semibold text-[#7a7a7a] dark:text-[#9a9a9a]">AI 推荐 · {persona.shortName}风格</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(s => (
              <button
                key={s.id}
                onClick={() => applySuggestion(s)}
                className="text-[11px] px-2.5 py-1 rounded border border-black/10 dark:border-white/10 hover:border-[#07C160]/40 hover:bg-[#07C160]/5 dark:hover:bg-[#07C160]/10 text-left max-w-full transition-colors apple-btn"
              >
                {s.content.slice(0, 24)}{s.content.length > 24 ? '…' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 幽灵卡片（AI建议5秒消散）*/}
      <GhostCard />

      {/* 防双端打架黄色横幅（消息列表上方） */}
      <TakeoverBanner leadId={lead.id} />

      {/* 消息区 */}
      <div className="flex-1 min-h-0 overflow-y-auto waos-scrollbar px-5 py-4 space-y-4 bg-[#f5f5f5] dark:bg-[#1e1e1e]">
        {/* 加密提示 */}
        <div className="text-center">
          <span className="text-[10px] px-2.5 py-1 rounded bg-[#e8e8e8] dark:bg-[#3a3a3a] text-[#7a7a7a] dark:text-[#9a9a9a]">
            <Shield className="w-2.5 h-2.5 inline mr-1" />
            微信对话已加密
          </span>
        </div>

        {(lead.messages || []).map(msg => (
          <PCMessageBubble key={msg.id} msg={msg} leadName={lead.userName} leadColor={lead.personaColor} personaAvatar={persona.avatar} />
        ))}

        {/* 打字动画 */}
        {typing && (
          <div className="flex gap-2.5 items-start">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-[14px] shrink-0">
              {persona.avatar}
            </div>
            <div className="px-3.5 py-2.5 rounded-lg bg-white dark:bg-[#2a2a2a] shadow-sm" style={{ borderRadius: '4px 12px 12px 12px' }}>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7a7a7a] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#7a7a7a] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#7a7a7a] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 发送中 */}
      {sending && (
        <div className="shrink-0 px-4 py-1 bg-amber-500/5 border-t border-amber-500/20 flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-amber-500 animate-pulse" />
          <span className="text-[10px] text-amber-600">人类行为模拟中 · 防封号延迟</span>
        </div>
      )}

      {/* 输入区 */}
      <div className="shrink-0 bg-[#f5f5f5] dark:bg-[#1e1e1e] border-t border-black/5">
        {/* 工具栏 */}
        <div className="px-4 pt-2 flex items-center gap-3 text-[#7a7a7a] dark:text-[#9a9a9a]">
          <Smile className="w-4 h-4 hover:text-[#07C160] cursor-pointer" />
          <FileText className="w-4 h-4 hover:text-[#07C160] cursor-pointer" />
          <Scissors className="w-4 h-4 hover:text-[#07C160] cursor-pointer" />
          <ScreenShare className="w-4 h-4 hover:text-[#07C160] cursor-pointer" />
          <ImageIcon className="w-4 h-4 hover:text-[#07C160] cursor-pointer" />
          <div className="flex-1" />
          <span className="text-[10px] text-[#b0b0b0] dark:text-[#666]">Enter 发送 · Shift+Enter 换行</span>
        </div>
        {/* 输入框 */}
        <textarea
          value={draft}
          onChange={e => setClientDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息…"
          disabled={sending}
          rows={3}
          className="w-full px-4 py-2 text-[14px] bg-transparent resize-none focus:outline-none disabled:opacity-50 placeholder:text-[#b0b0b0] dark:text-[#666]"
        />
        {/* 发送按钮 */}
        <div className="px-4 pb-3 flex justify-end">
          <button
            onClick={handleSend} aria-label="发送消息"
            disabled={sending || !draft.trim()}
            className="px-5 h-8 rounded-lg bg-[#07C160] text-white text-[12px] font-medium disabled:opacity-40 hover:bg-[#06ad56] active:scale-[0.98] transition-all apple-btn flex items-center gap-1"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {sending ? '发送中' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 防双端打架：黄色人工接管警告横幅 ──────────────────────────
// 当 takeoverWarning.active 且 leadId 匹配当前会话时，从顶部滑入显示黄色横幅。
// 5 秒后 store 会自动清除；用户也可点 X 手动关闭。
function TakeoverBanner({ leadId }: { leadId: string }) {
  const warning = useOpsStore(s => s.takeoverWarning)
  const clearTakeoverWarning = useOpsStore(s => s.clearTakeoverWarning)

  const visible = !!(warning && warning.active && warning.leadId === leadId)

  return (
    <AnimatePresence>
      {visible && warning && (
        <motion.div
          initial={{ height: 0, opacity: 0, y: -8 }}
          animate={{ height: 'auto', opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="shrink-0 overflow-hidden"
        >
          <div className="bg-amber-500/15 border-y border-amber-500/40 text-amber-700 dark:text-amber-400 px-4 py-2 text-xs flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 truncate">检测到您正在手动回复，AI 已暂停 10 秒{warning.reason ? ` · ${warning.reason}` : ''}</span>
            <button
              onClick={clearTakeoverWarning}
              aria-label="关闭横幅"
              className="p-0.5 rounded hover:bg-amber-500/20 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PCMessageBubble({ msg, leadName, leadColor, personaAvatar }: { msg: LeadMessage; leadName: string; leadColor?: string; personaAvatar: string }) {
  const isMe = msg.role === 'assistant' || msg.role === 'human'
  // 兼容 createdAt (string) 和 ts (number) 两种字段，防 Invalid Date
  // LeadMessage 类型已包含 createdAt?/ts?/source? 等可选字段，这里直接读取无需 as any
  const rawTs: string | number | undefined = msg.createdAt ?? msg.ts
  const date = rawTs ? new Date(rawTs) : null
  const time = date && !isNaN(date.getTime()) ? date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' }) : ''

  // 被安全护盾拦截 或 防双端打架触发 → 红色拦截气泡
  const isBlocked = !!(msg.blocked || msg.safetyFiltered)

  if (msg.role === 'system') {
    return <div className="text-center py-1"><span className="text-[10px] px-2.5 py-1 rounded bg-[#e8e8e8] dark:bg-[#3a3a3a] text-[#7a7a7a] dark:text-[#9a9a9a]">{msg.content}</span></div>
  }

  // 拦截气泡：红色边框 + 左侧红色竖条 + "🚫 已拦截" 标签
  if (isBlocked) {
    return (
      <div className={`flex gap-2.5 items-start ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[13px] font-semibold text-white shrink-0"
          style={{ background: isMe ? 'linear-gradient(135deg, #ef4444, #b91c1c)' : (leadColor || '#86868b') }}
        >
          {isMe ? '🚫' : leadName.slice(0, 1)}
        </div>
        <div className={`max-w-[60%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
          <div
            className="relative pl-4 pr-3.5 py-2.5 text-[14px] leading-relaxed break-words shadow-sm border-2 border-red-500 bg-red-50 dark:bg-red-950/30 text-black dark:text-red-100"
            style={{ borderRadius: isMe ? '12px 4px 12px 12px' : '4px 12px 12px 12px' }}
          >
            {/* 左侧红色竖条 */}
            <span className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" style={{ borderTopLeftRadius: isMe ? 12 : 4, borderBottomLeftRadius: isMe ? 12 : 4 }} />
            {/* "🚫 已拦截" 标签 */}
            <div className="flex items-center gap-1 mb-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
              <span>🚫 已拦截</span>
            </div>
            <div className="text-black dark:text-red-100">{msg.content}</div>
          </div>
          {/* 拦截原因（小字） */}
          <span className="text-[10px] text-red-500 dark:text-red-400 mt-1 px-1 flex items-center gap-1">
            <Shield className="w-2.5 h-2.5" />
            <span>{msg.blockedReason || msg.safetyReason || '已拦截'}</span>
          </span>
          <span className="text-[9px] text-[#b0b0b0] dark:text-[#666] mt-0.5 px-1">{time}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex gap-2.5 items-start ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-[13px] font-semibold text-white shrink-0"
        style={{ background: isMe ? 'linear-gradient(135deg, #10b981, #14b8a6)' : (leadColor || '#86868b') }}
      >
        {isMe ? personaAvatar : leadName.slice(0, 1)}
      </div>
      <div className={`max-w-[60%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`px-3.5 py-2.5 text-[14px] leading-relaxed break-words shadow-sm ${
            isMe ? 'bg-[#95EC69] text-black' : 'bg-white text-black'
          }`}
          style={{ borderRadius: isMe ? '12px 4px 12px 12px' : '4px 12px 12px 12px' }}
        >
          {msg.content}
        </div>
        <span className="text-[9px] text-[#b0b0b0] dark:text-[#666] mt-1 px-1">{time}</span>
      </div>
    </div>
  )
}

// ─── 通讯录布局 ──────────────────────────────────────────────
function ContactsLayout() {
  const leads = useOpsStore(s => s.leads)
  const selectLead = useOpsStore(s => s.selectLead)

  return (
    <div className="flex-1 flex bg-white">
      <div className="w-[280px] shrink-0 border-r border-black/5 dark:border-white/5 flex flex-col">
        <div className="p-3 border-b border-black/5 dark:border-white/5">
          <div className="px-2.5 py-1.5 rounded bg-[#f5f5f5] dark:bg-[#1e1e1e] flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-[#7a7a7a] dark:text-[#9a9a9a]" />
            <span className="text-[12px] text-[#7a7a7a] dark:text-[#9a9a9a]">搜索</span>
          </div>
        </div>
        <div className="px-3 py-2 text-[11px] font-semibold text-[#7a7a7a] dark:text-[#9a9a9a] bg-[#f9f9f9]">客户 · {leads.length}</div>
        <div className="flex-1 overflow-y-auto waos-scrollbar">
          {leads.map(lead => (
            <button
              key={lead.id}
              onClick={() => selectLead(lead.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-black/3 dark:border-white/5 hover:bg-[#f5f5f5] dark:hover:bg-[#333] transition-colors text-left"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[13px] font-semibold text-white shrink-0"
                style={{ background: lead.personaColor || '#86868b' }}
              >
                {lead.userName.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{lead.userName}</div>
                <div className="text-[10px] text-[#7a7a7a] dark:text-[#9a9a9a] truncate">{lead.lastMessage}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Users className="w-12 h-12 text-[#d6d6d6] mx-auto mb-2" />
          <p className="text-[13px] text-[#7a7a7a] dark:text-[#9a9a9a]">选择一位客户查看详情</p>
        </div>
      </div>
    </div>
  )
}

// ─── 朋友圈布局 ──────────────────────────────────────────────
// 注：原 MomentsLayout / MomentPost 旧实现已废弃，
// 现在导航"朋友圈"按钮直接挂载 MomentsPanel（接入层 + 巡视任务 + 意向分三色标签 + 发朋友圈 Dialog），
// 详见 src/components/waos/MomentsPanel.tsx

// ─── 幽灵卡片（AI建议5秒消散）──────────────────────────────
function GhostCard() {
  const ghost = useOpsStore(s => s.ghostCard)
  const dismiss = useOpsStore(s => s.dismissGhostCard)
  const setClientDraft = useOpsStore(s => s.setClientDraft)

  // ghost 存在就显示，5秒后 store 自动清除（showGhostCard 里的 setTimeout）
  if (!ghost) return null

  return (
    <div className="shrink-0 px-4 py-2 bg-gradient-to-r from-purple-500/10 to-transparent border-b border-purple-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-3 h-3 text-purple-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-purple-600 font-semibold mb-0.5">
            💡 AI 建议 · {ghost.strategy} · {Math.round(ghost.confidence * 100)}%
          </div>
          <div className="text-[12px] text-foreground leading-relaxed">{ghost.content}</div>
        </div>
        <button
          onClick={() => { setClientDraft(ghost.content); dismiss(); toast.success('已采纳') }}
          className="shrink-0 px-2 py-1 text-[10px] rounded bg-purple-500/20 text-purple-600 hover:bg-purple-500/30 apple-btn"
        >
          采纳
        </button>
        <button onClick={dismiss} className="shrink-0 text-purple-400 hover:text-purple-600 p-0.5">
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="text-[8px] text-purple-400/60 mt-1 ml-8">5秒后自动消失</div>
    </div>
  )
}

// ─── 视频号截流引擎 ──────────────────────────────────────────
function InterceptLayout() {
  const vi = useOpsStore(s => s.videoIntercept)
  const toggleVideoIntercept = useOpsStore(s => s.toggleVideoIntercept)
  const sendInterceptDM = useOpsStore(s => s.sendInterceptDM)
  const scanVideoComments = useOpsStore(s => s.scanVideoComments)
  const videoPrioritySort = useOpsStore(s => s.videoPrioritySort)
  const toggleVideoPrioritySort = useOpsStore(s => s.toggleVideoPrioritySort)
  const [sendingId, setSendingId] = useState<string | null>(null)

  const handleSendDM = async (targetId: string) => {
    setSendingId(targetId)
    await sendInterceptDM(targetId)
    setSendingId(null)
    toast.success('私信已发送')
  }

  const handleBatchSend = async () => {
    const pending = vi.targets.filter(t => t.intentScore >= 70 && t.dmStatus === 'pending')
    for (const t of pending) {
      await handleSendDM(t.id)
      await new Promise(r => setTimeout(r, 2000)) // 防封间隔
    }
    toast.success(`批量私信完成: ${pending.length}个客户`)
  }

  const highIntentTargets = vi.targets.filter(t => t.intentScore >= 70)
  const lowIntentTargets = vi.targets.filter(t => t.intentScore < 70)

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-black/5 dark:border-white/5 bg-[#f7f7f7]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold">视频号获客助手</h2>
            <p className="text-[10px] text-[#7a7a7a] dark:text-[#9a9a9a] mt-0.5">监控视频号评论区 → 识别高意向 → 自动私信</p>
          </div>
          <button
            onClick={toggleVideoIntercept}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors apple-btn ${
              vi.enabled ? 'bg-emerald-500 text-white' : 'bg-[#f0f0f0] text-[#7a7a7a] dark:text-[#9a9a9a]'
            }`}
          >
            {vi.enabled ? '● 获客中' : '○ 未启动'}
          </button>
        </div>
      </div>

      {/* 监控视频信息 */}
      <div className="shrink-0 px-4 py-2.5 border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#2a2a2a]">
        <div className="text-[10px] text-[#7a7a7a] dark:text-[#9a9a9a] mb-1">监控视频</div>
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-purple-500 shrink-0" />
          <span className="text-[12px] font-medium flex-1 truncate">{vi.monitoringVideo}</span>
          <span className="text-[10px] font-mono text-purple-600">▶ {(vi.monitoringPlayCount / 10000).toFixed(1)}w</span>
          <button
            onClick={scanVideoComments}
            disabled={!vi.enabled}
            className="px-2 py-1 text-[10px] rounded bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 disabled:opacity-30"
          >
            重新扫描
          </button>
        </div>
        {/* 高播放量优先开关 */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={toggleVideoPrioritySort}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
              videoPrioritySort ? 'bg-purple-500/15 text-purple-600' : 'bg-muted text-muted-foreground'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${videoPrioritySort ? 'bg-purple-500' : 'bg-muted-foreground'}`} />
            高播放量优先
          </button>
          <span className="text-[9px] text-[#7a7a7a] dark:text-[#9a9a9a]">
            {videoPrioritySort ? '按视频播放量降序处理评论' : '按时间顺序处理'}
          </span>
        </div>
      </div>

      {/* 统计 */}
      <div className="shrink-0 grid grid-cols-3 gap-px bg-black/5">
        <div className="bg-white p-2.5 text-center">
          <div className="text-[18px] font-bold font-mono text-zinc-600">{vi.commentsDetected}</div>
          <div className="text-[9px] text-[#7a7a7a] dark:text-[#9a9a9a]">评论检测</div>
        </div>
        <div className="bg-white p-2.5 text-center">
          <div className="text-[18px] font-bold font-mono text-rose-500">{vi.highIntentFound}</div>
          <div className="text-[9px] text-[#7a7a7a] dark:text-[#9a9a9a]">高意向客户</div>
        </div>
        <div className="bg-white p-2.5 text-center">
          <div className="text-[18px] font-bold font-mono text-emerald-500">{vi.dmSent}</div>
          <div className="text-[9px] text-[#7a7a7a] dark:text-[#9a9a9a]">已发私信</div>
        </div>
      </div>

      {/* 批量操作 */}
      {highIntentTargets.filter(t => t.dmStatus === 'pending').length > 0 && (
        <div className="shrink-0 px-4 py-2 border-b border-black/5 dark:border-white/5">
          <button
            onClick={handleBatchSend}
            className="w-full py-2 rounded-lg bg-emerald-500/10 text-emerald-600 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors apple-btn"
          >
            一键私信全部高意向客户 ({highIntentTargets.filter(t => t.dmStatus === 'pending').length}个)
          </button>
        </div>
      )}

      {/* 高意向客户列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto waos-scrollbar">
        {highIntentTargets.length > 0 && (
          <div className="px-3 py-1.5 text-[10px] font-semibold text-rose-500 bg-rose-50/50">🔥 高意向客户 ({highIntentTargets.length})</div>
        )}
        {highIntentTargets.map(t => (
          <InterceptTarget key={t.id} target={t} onSend={handleSendDM} sending={sendingId === t.id} />
        ))}

        {lowIntentTargets.length > 0 && (
          <div className="px-3 py-1.5 text-[10px] font-semibold text-[#7a7a7a] dark:text-[#9a9a9a] bg-gray-50">低意向 ({lowIntentTargets.length})</div>
        )}
        {lowIntentTargets.map(t => (
          <InterceptTarget key={t.id} target={t} onSend={handleSendDM} sending={sendingId === t.id} />
        ))}
      </div>
    </div>
  )
}

function InterceptTarget({ target, onSend, sending }: { target: InterceptTargetType; onSend: (id: string) => void; sending: boolean }) {
  const [showDM, setShowDM] = useState(false)
  const scoreColor = target.intentScore >= 90 ? 'text-rose-500' : target.intentScore >= 70 ? 'text-amber-500' : 'text-[#7a7a7a] dark:text-[#9a9a9a]'

  return (
    <div className="px-3 py-2.5 border-b border-black/5 dark:border-white/5">
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-[13px] font-semibold text-white shrink-0">
          {target.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium">{target.userName}</span>
            <span className={`text-[9px] font-mono font-bold ${scoreColor}`}>{target.intentScore}分</span>
            {target.dmStatus === 'sent' && <span className="text-[8px] px-1 rounded bg-emerald-100 text-emerald-600">已私信</span>}
            {target.dmStatus === 'replied' && <span className="text-[8px] px-1 rounded bg-sky-100 text-sky-600">已回复</span>}
          </div>
          <div className="text-[11px] text-[#576b95] mt-0.5">"{target.comment}"</div>
          <div className="text-[9px] text-[#7a7a7a] dark:text-[#9a9a9a] mt-0.5 flex items-center gap-2">
            <span>📋 {target.intentReason}</span>
            {target.videoPlayCount > 0 && (
              <span className="text-purple-600 font-medium">▶ {(target.videoPlayCount / 10000).toFixed(1)}w</span>
            )}
          </div>

          {/* 私信内容预览 */}
          {showDM && target.dmMessage && (
            <div className="mt-1.5 p-2 rounded-lg bg-emerald-50 border border-emerald-100">
              <div className="text-[9px] text-emerald-600 font-semibold mb-0.5">📨 私信内容:</div>
              <div className="text-[11px] text-black leading-relaxed">{target.dmMessage}</div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-1.5 mt-1.5">
            {target.dmStatus === 'pending' ? (
              <button
                onClick={() => onSend(target.id)}
                disabled={sending}
                className="px-2.5 py-1 text-[10px] rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 apple-btn"
              >
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : '私信他'}
              </button>
            ) : (
              <button
                onClick={() => setShowDM(!showDM)}
                className="px-2 py-1 text-[10px] rounded bg-gray-100 text-[#7a7a7a] dark:text-[#9a9a9a] hover:bg-gray-200"
              >
                {showDM ? '收起' : '查看私信'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 工具 ────────────────────────────────────────────────────
function sourceLabel(source: string): string {
  return { wechat_dm: '微信私聊', comment: '评论', video: '视频号', douyin: '抖音' }[source] || source
}

function convTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return `${Math.floor(diff / 86400000)}天前`
}
