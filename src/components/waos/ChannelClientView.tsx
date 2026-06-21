'use client'

/**
 * WAOS Channel Client View — 左侧固定嵌入式客户端
 *
 * 新布局：左侧永远是微信/抖音/视频号客户端界面（不变），
 * 右侧是可切换的功能区（inbox/详情/调度器/指标/漏斗/A-B/审计）。
 *
 * 功能：
 *  - 根据当前选中线索的 source 自动选择对应平台界面
 *  - 支持手动切换平台（微信/企微/抖音/视频号）
 *  - 真实的客户端 UI（微信绿色、抖音黑色、视频号紫色）
 *  - 显示真实的对话气泡
 *  - 底部输入框可直接发送，触发 AI 回复 + "对方正在输入"动画
 *  - 防封号人类行为模拟延迟
 */

import { useOpsStore, type LeadMessage, type Source } from '@/store/useOpsStore'
import {
  Send, Smile, Plus, Mic, ChevronLeft, MoreVertical,
  Smartphone, Video, AtSign, Briefcase,
  Shield, Clock, Zap, AlertTriangle, CheckCheck, Radio, Loader2,
} from 'lucide-react'
import { useEffect, useRef } from 'react'

type Channel = 'wechat' | 'wecom' | 'douyin' | 'video'

const CHANNEL_META: Record<Channel, {
  label: string
  icon: React.ReactNode
  headerBg: string
  headerText: string
  bubbleMe: string
  bubbleThem: string
  inputBg: string
  accent: string
  placeholder: string
}> = {
  wechat: {
    label: '微信',
    icon: <Smartphone className="w-3.5 h-3.5" />,
    headerBg: 'bg-[#2e2e2e]',
    headerText: 'text-white',
    bubbleMe: 'bg-[#95EC69] text-[#1a1a1a]',
    bubbleThem: 'bg-white text-[#1a1a1a]',
    inputBg: 'bg-[#f5f5f5]',
    accent: '#07C160',
    placeholder: '请输入消息…',
  },
  wecom: {
    label: '企业微信',
    icon: <Briefcase className="w-3.5 h-3.5" />,
    headerBg: 'bg-[#2e2e2e]',
    headerText: 'text-white',
    bubbleMe: 'bg-[#5BB5F2] text-white',
    bubbleThem: 'bg-white text-[#1a1a1a]',
    inputBg: 'bg-[#f5f5f5]',
    accent: '#5BB5F2',
    placeholder: '请输入消息…',
  },
  douyin: {
    label: '抖音',
    icon: <AtSign className="w-3.5 h-3.5" />,
    headerBg: 'bg-black',
    headerText: 'text-white',
    bubbleMe: 'bg-[#FE2C55] text-white',
    bubbleThem: 'bg-[#2a2a2a] text-white',
    inputBg: 'bg-[#1a1a1a]',
    accent: '#FE2C55',
    placeholder: '说点什么…',
  },
  video: {
    label: '视频号',
    icon: <Video className="w-3.5 h-3.5" />,
    headerBg: 'bg-[#1a1a2e]',
    headerText: 'text-white',
    bubbleMe: 'bg-[#8B5CF6] text-white',
    bubbleThem: 'bg-[#2a2a3e] text-white',
    inputBg: 'bg-[#16162a]',
    accent: '#8B5CF6',
    placeholder: '请输入消息…',
  },
}

const SOURCE_TO_CHANNEL: Record<Source, Channel> = {
  wechat_dm: 'wechat',
  comment: 'wechat',
  video: 'video',
  douyin: 'douyin',
}

export function ChannelClientView() {
  const channelSetting = useOpsStore(s => s.clientViewChannel)
  const setClientViewChannel = useOpsStore(s => s.setClientViewChannel)
  const clientViewLeadId = useOpsStore(s => s.clientViewLeadId)
  const leads = useOpsStore(s => s.leads)
  const draft = useOpsStore(s => s.clientDraft)
  const setClientDraft = useOpsStore(s => s.setClientDraft)
  const sending = useOpsStore(s => s.clientSending)
  const typing = useOpsStore(s => s.clientTyping)
  const sendClientMessage = useOpsStore(s => s.sendClientMessage)

  const lead = leads.find(l => l.id === clientViewLeadId) || null

  // Resolve channel
  const channel: Channel = channelSetting === 'auto' && lead
    ? SOURCE_TO_CHANNEL[lead.source]
    : (channelSetting === 'auto' ? 'wechat' : channelSetting as Channel)
  const meta = CHANNEL_META[channel]

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lead?.messages, typing])

  const handleSend = () => {
    if (!draft.trim() || sending) return
    sendClientMessage()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-[oklch(0.145_0_0)]">
      {/* ─── Channel switcher + compliance ─── */}
      <div className="shrink-0 px-3 py-2 border-b border-[oklch(1_0_0/8%)] bg-[oklch(0.18_0_0)]">
        <div className="flex items-center gap-2 mb-2">
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-semibold text-white">客户端</span>
          <span className="text-[9px] font-mono text-zinc-500">固定 · 不随功能区切换</span>
          <div className="flex-1" />
          <span className="flex items-center gap-1 text-[9px] font-mono text-amber-400/80">
            <Shield className="w-2.5 h-2.5" />
            防封号
          </span>
        </div>
        {/* Channel tabs */}
        <div className="flex items-center gap-1">
          {([
            { id: 'wechat' as const, label: '微信', icon: <Smartphone className="w-3 h-3" /> },
            { id: 'wecom' as const,  label: '企微', icon: <Briefcase className="w-3 h-3" /> },
            { id: 'douyin' as const, label: '抖音', icon: <AtSign className="w-3 h-3" /> },
            { id: 'video' as const,  label: '视频号', icon: <Video className="w-3 h-3" /> },
          ]).map(c => {
            const active = channel === c.id
            return (
              <button
                key={c.id}
                onClick={() => setClientViewChannel(c.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-semibold border transition-all"
                style={active ? { background: CHANNEL_META[c.id].accent, color: '#fff', borderColor: 'transparent' } : { color: '#71717a', borderColor: 'transparent' }}
              >
                {c.icon}
                {c.label}
              </button>
            )
          })}
          <div className="w-px h-4 bg-[oklch(1_0_0/10%)] mx-1" />
          <button
            onClick={() => setClientViewChannel('auto')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-semibold border transition-all
              ${channelSetting === 'auto'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
            title="自动根据线索来源选择"
          >
            <Radio className="w-2.5 h-2.5" />
            AUTO
          </button>
        </div>
      </div>

      {/* ─── Phone frame ─── */}
      <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a0a] p-2 overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden border-2 border-[#1a1a1a] shadow-2xl bg-white">
          {/* Status bar */}
          <div className={`shrink-0 h-5 ${meta.headerBg} flex items-center justify-between px-4 text-[9px] ${meta.headerText} font-mono`}>
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span className="text-[7px]">●●●●</span>
              <span>5G</span>
              <span className="ml-1 inline-block w-4 h-2 border border-current rounded-sm relative">
                <span className="absolute inset-0.5 bg-current rounded-[1px]" />
              </span>
            </span>
          </div>

          {/* Chat header */}
          <div className={`shrink-0 h-10 ${meta.headerBg} ${meta.headerText} flex items-center px-3 gap-2`}>
            <ChevronLeft className="w-4 h-4 opacity-80" />
            <div className="flex-1 min-w-0 text-center">
              <div className="text-[12px] font-semibold truncate">
                {lead?.userName || '选择线索'}
              </div>
              <div className="text-[8px] opacity-60 font-mono">
                {meta.label} · {lead?.source || '—'}
              </div>
            </div>
            <MoreVertical className="w-4 h-4 opacity-80" />
          </div>

          {/* Messages area */}
          <div
            className="flex-1 min-h-0 overflow-y-auto waos-scrollbar px-2.5 py-2 space-y-1.5"
            style={{
              background: channel === 'wechat' || channel === 'wecom' ? '#EDEDED' : channel === 'douyin' ? '#0a0a0a' : '#0f0f1a'
            }}
          >
            {!lead ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Smartphone className="w-8 h-8 text-zinc-600 mb-2" />
                <p className="text-[11px] text-zinc-500">从右侧功能区选择线索</p>
                <p className="text-[9px] text-zinc-600 mt-1">客户端将显示对话</p>
              </div>
            ) : (lead.messages || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-[10px] text-zinc-500 px-3 py-1.5 rounded bg-black/10">
                  开始对话
                </div>
              </div>
            ) : (
              <>
                {(channel === 'wechat' || channel === 'wecom') && (
                  <div className="text-center text-[8px] text-zinc-500 py-1">
                    <Shield className="w-2 h-2 inline mr-0.5" />
                    {channel === 'wechat' ? '微信对话已加密' : '企业微信对话已加密'}
                  </div>
                )}
                {(lead.messages || []).map(msg => (
                  <MessageBubble key={msg.id} msg={msg} channel={channel} leadName={lead.userName} leadColor={lead.personaColor} />
                ))}
                {/* Typing indicator */}
                {typing && (
                  <div className="flex gap-1.5 items-end">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                      style={{ background: meta.accent }}
                    >
                      AI
                    </div>
                    <div className={`px-3 py-2 rounded-lg ${meta.bubbleThem}`} style={{ borderRadius: '4px 12px 12px 12px' }}>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Sending indicator */}
          {sending && (
            <div className="shrink-0 px-2.5 py-1 bg-amber-500/10 border-t border-amber-500/20 flex items-center gap-1.5">
              <Clock className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
              <span className="text-[9px] font-mono text-amber-300">人类行为模拟中 · 防封号延迟</span>
            </div>
          )}

          {/* Input bar */}
          <div
            className={`shrink-0 ${meta.inputBg} flex items-end gap-1.5 px-2.5 py-1.5 border-t`}
            style={{ borderColor: channel === 'wechat' || channel === 'wecom' ? '#dcdcdc' : 'rgba(255,255,255,0.08)' }}
          >
            <Smile className={`w-5 h-5 shrink-0 ${channel === 'wechat' || channel === 'wecom' ? 'text-zinc-500' : 'text-zinc-400'}`} />
            <textarea
              value={draft}
              onChange={e => setClientDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={meta.placeholder}
              disabled={!lead || sending}
              rows={1}
              className="flex-1 min-h-[28px] max-h-16 px-2.5 py-1 text-[12px] rounded resize-none focus:outline-none disabled:opacity-50"
              style={{
                background: channel === 'wechat' || channel === 'wecom' ? '#fff' : 'rgba(255,255,255,0.06)',
                color: channel === 'wechat' || channel === 'wecom' ? '#1a1a1a' : '#fff',
                border: `1px solid ${channel === 'wechat' || channel === 'wecom' ? '#dcdcdc' : 'rgba(255,255,255,0.1)'}`,
              }}
            />
            {draft.trim() ? (
              <button
                onClick={handleSend}
                disabled={sending}
                className="shrink-0 px-2.5 py-1 rounded text-[11px] font-semibold text-white disabled:opacity-50 flex items-center gap-1"
                style={{ background: meta.accent }}
              >
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                发送
              </button>
            ) : (
              <>
                <Plus className={`w-5 h-5 shrink-0 ${channel === 'wechat' || channel === 'wecom' ? 'text-zinc-500' : 'text-zinc-400'}`} />
                <Mic className={`w-5 h-5 shrink-0 ${channel === 'wechat' || channel === 'wecom' ? 'text-zinc-500' : 'text-zinc-400'}`} />
              </>
            )}
          </div>
        </div>

        {/* Home indicator */}
        <div className="shrink-0 flex justify-center py-1">
          <div className="w-20 h-0.5 rounded-full bg-zinc-700" />
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 py-1.5 border-t border-[oklch(1_0_0/8%)] bg-[oklch(0.18_0_0)] flex items-center gap-2 text-[9px] font-mono">
        <Zap className="w-2.5 h-2.5 text-emerald-400" />
        <span className="text-zinc-400">{meta.label}</span>
        <span className="text-zinc-600">·</span>
        <span className="text-zinc-500">{lead ? `${lead.messages?.length || 0} 条` : '未选择'}</span>
        {typing && (
          <>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400">AI 输入中…</span>
          </>
        )}
      </div>
    </div>
  )
}

function MessageBubble({
  msg, channel, leadName, leadColor,
}: {
  msg: LeadMessage
  channel: Channel
  leadName: string
  leadColor?: string
}) {
  const meta = CHANNEL_META[channel]
  const isMe = msg.role === 'assistant' || msg.role === 'human'
  const isSystem = msg.role === 'system'
  const isLight = channel === 'wechat' || channel === 'wecom'

  if (isSystem) {
    return (
      <div className="flex justify-center py-0.5">
        <span className="text-[8px] px-2 py-0.5 rounded bg-black/10 text-zinc-500">{msg.content}</span>
      </div>
    )
  }

  const time = new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`flex gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
        style={{ background: isMe ? meta.accent : (leadColor || '#71717a') }}
      >
        {isMe ? (msg.role === 'human' ? '我' : 'AI') : leadName.slice(0, 1)}
      </div>
      <div className={`max-w-[78%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-2.5 py-1.5 rounded-lg text-[12px] leading-relaxed break-words ${isMe ? meta.bubbleMe : meta.bubbleThem}`}
          style={{ borderRadius: isMe ? '10px 3px 10px 10px' : '3px 10px 10px 10px' }}
        >
          {msg.content}
          {msg.safetyFiltered && (
            <div className={`mt-1 pt-1 border-t flex items-center gap-1 text-[8px] ${isLight ? 'border-black/10 text-amber-600' : 'border-white/10 text-amber-400'}`}>
              <Shield className="w-2 h-2" />
              <span>安全拦截: {msg.safetyReason}</span>
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1 mt-0.5 text-[8px] ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
          <span>{time}</span>
          {isMe && <CheckCheck className="w-2 h-2" style={{ color: meta.accent }} />}
          {msg.role === 'human' && <span className="px-1 rounded bg-orange-500/20 text-orange-400">人工</span>}
        </div>
      </div>
    </div>
  )
}
