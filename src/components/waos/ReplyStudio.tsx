'use client'

import { useOpsStore } from '@/store/useOpsStore'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Bot, Send, Shield, Sparkles, AlertTriangle, Loader2, RefreshCw, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const PERSONA_PRESETS: { id: string; name: string; color: string; prompt: string }[] = [
  { id: 'consult', name: '顾问型 · 沈听澜', color: '#10b981', prompt: '温和专业的顾问，先理解需求再推荐方案' },
  { id: 'sales',   name: '销售型 · 萧寒',   color: '#f59e0b', prompt: '热情有冲劲的销售，快速挖掘痛点并促单' },
  { id: 'service', name: '服务型 · 叶之秋', color: '#06b6d4', prompt: '耐心细致的服务者，重点解决用户疑问' },
  { id: 'closer',  name: '逼单型 · 顾倾城', color: '#ef4444', prompt: '强势但真诚的逼单者，制造紧迫感促成成交' },
]

const QUICK_TEMPLATES = [
  '您好，方便简单介绍下您的需求吗？',
  '我可以帮您申请一个专属优惠，要加下微信细聊吗？',
  '根据您的情况，我推荐专业版，性价比最高。',
  '您先看看产品介绍，有任何问题随时找我～',
]

export function ReplyStudio() {
  const open = useOpsStore(s => s.replyStudioOpen)
  const leadId = useOpsStore(s => s.replyStudioLeadId)
  const lead = useOpsStore(s => s.leads.find(l => l.id === leadId))
  const draft = useOpsStore(s => s.replyStudioDraft)
  const setDraft = useOpsStore(s => s.setReplyDraft)
  const loading = useOpsStore(s => s.replyStudioLoading)
  const setLoading = useOpsStore(s => s.setReplyLoading)
  const safety = useOpsStore(s => s.replyStudioSafety)
  const setSafety = useOpsStore(s => s.setReplySafety)
  const close = useOpsStore(s => s.closeReplyStudio)
  const sendClientAction = useOpsStore(s => s.sendClientAction)

  const [personaId, setPersonaId] = useState('consult')
  const [lastReply, setLastReply] = useState<string | null>(null)
  const [lastMeta, setLastMeta] = useState<{ tokens?: number; latency?: number; source?: string } | null>(null)

  useEffect(() => {
    if (open) {
      setDraft('')
      setSafety(null)
      setLastReply(null)
      setLastMeta(null)
    }
  }, [open, setDraft, setSafety])

  if (!lead) return null
  const persona = PERSONA_PRESETS.find(p => p.id === personaId)!

  const generate = async () => {
    if (!lead?.lastMessage) {
      toast.error('No user message to reply to')
      return
    }
    setLoading(true)
    setSafety(null)
    try {
      const res = await fetch('/api/waos/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          userMessage: lead.lastMessage,
          personaName: persona.name,
          history: (lead.messages || []).map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      setDraft(data.reply || '')
      setLastMeta({
        tokens: data.tokensUsed,
        latency: data.latency,
        source: data.source,
      })
      if (data.safetyFiltered) {
        setSafety({ filtered: true, reason: data.safetyReason })
        toast.warning('AI 输出被安全护盾拦截', { description: data.safetyReason })
      } else if (data.fallback) {
        setSafety({ filtered: false, reason: 'LLM 熔断降级 · 已触发人工接管流程' })
        toast.error('LLM 熔断，已降级', { description: 'Fallback template used' })
      } else {
        setSafety(null)
        toast.success('AI 回复已生成', {
          description: `${data.tokensUsed} tok · ${data.latency}ms · ${data.source}`,
        })
      }
      setLastReply(data.reply || '')
    } catch (err) {
      toast.error('Failed to generate reply', { description: String(err) })
    } finally {
      setLoading(false)
    }
  }

  const send = () => {
    if (!draft.trim()) {
      toast.error('Reply is empty')
      return
    }
    sendClientAction('manual_reply', lead.id)
    toast.success('回复已发送', {
      description: `${lead.userName} · ${draft.slice(0, 30)}${draft.length > 30 ? '…' : ''}`,
    })
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl bg-[oklch(0.165_0_0)] border-[oklch(1_0_0/12%)] text-zinc-100 p-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[oklch(1_0_0/8%)] bg-[oklch(0.18_0_0)]">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
              style={{ background: lead.personaColor || '#52525b' }}
            >
              {lead.userName.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-sm font-semibold text-white flex items-center gap-2">
                AI Reply Studio
                <span className="text-[10px] font-mono text-zinc-500">· {lead.userName}</span>
              </DialogTitle>
              <DialogDescription className="text-[11px] text-zinc-400 mt-0.5">
                ContextManager · max 10 turns · SafetyShield active
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] font-mono text-emerald-300">SHIELD ON</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto waos-scrollbar">
          {/* User's last message */}
          <div className="px-3 py-2.5 rounded-lg bg-[oklch(0.13_0_0)] border border-[oklch(1_0_0/8%)]">
            <div className="text-[10px] font-mono text-zinc-500 mb-1">USER · 最近一条消息</div>
            <p className="text-[13px] text-zinc-200">{lead.lastMessage || '(no message)'}</p>
          </div>

          {/* Persona selector */}
          <div>
            <div className="text-[10px] font-mono text-zinc-500 mb-1.5 uppercase tracking-wider">Persona · AI 人设</div>
            <div className="grid grid-cols-2 gap-1.5">
              {PERSONA_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPersonaId(p.id)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-mono border transition-all
                    ${personaId === p.id
                      ? 'bg-[oklch(1_0_0/8%)] border-[oklch(1_0_0/20%)] text-white'
                      : 'border-transparent text-zinc-400 hover:bg-[oklch(1_0_0/4%)]'}`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5">{persona.prompt}</p>
          </div>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 border border-emerald-500/40 text-emerald-200 text-[12px] font-semibold transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'AI 正在生成…' : '生成 AI 回复'}
          </button>

          {/* Safety warning */}
          {safety && (
            <div className={`flex items-start gap-2 px-3 py-2 rounded-md text-[11px] border
              ${safety.filtered
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-200'}`}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">{safety.filtered ? 'SafetyShield 拦截' : 'LLM 熔断降级'}</div>
                {safety.reason && <div className="text-[10px] opacity-80 mt-0.5">{safety.reason}</div>}
              </div>
            </div>
          )}

          {/* Draft editor */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">回复草稿</div>
              {lastMeta && (
                <div className="text-[9px] font-mono text-zinc-600 flex items-center gap-2">
                  <span>{lastMeta.tokens} tok</span>
                  <span>{lastMeta.latency}ms</span>
                  <span className="text-emerald-400">{lastMeta.source}</span>
                </div>
              )}
            </div>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="点击「生成 AI 回复」开始，或直接编辑…"
              className="w-full h-28 px-3 py-2 text-[12px] leading-relaxed bg-[oklch(0.13_0_0)] border border-[oklch(1_0_0/10%)] rounded-md text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 resize-none"
            />
            <div className="flex items-center justify-between mt-1 text-[9px] font-mono text-zinc-600">
              <span>{draft.length} 字 · 建议 ≤ 80 字</span>
              {draft.length > 80 && <span className="text-amber-400">⚠ 超出微信聊天推荐长度</span>}
            </div>
          </div>

          {/* Quick templates */}
          <div>
            <div className="text-[10px] font-mono text-zinc-500 mb-1.5 uppercase tracking-wider">快速模板</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setDraft(t)}
                  className="text-[10px] px-2 py-1 rounded bg-[oklch(1_0_0/5%)] hover:bg-[oklch(1_0_0/10%)] text-zinc-400 hover:text-zinc-200 border border-[oklch(1_0_0/8%)] transition-colors"
                >
                  {t.slice(0, 18)}{t.length > 18 ? '…' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-[oklch(1_0_0/8%)] bg-[oklch(0.18_0_0)] flex items-center gap-2">
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-[oklch(1_0_0/8%)] border border-[oklch(1_0_0/10%)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-3 h-3" />
            重新生成
          </button>
          <div className="flex-1" />
          <button
            onClick={close}
            className="px-3 py-1.5 rounded-md text-[11px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-[oklch(1_0_0/8%)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={send}
            disabled={!draft.trim() || loading}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 transition-colors disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            发送回复
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
