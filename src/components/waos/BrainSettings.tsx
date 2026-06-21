'use client'

import { useState, useEffect, useRef } from 'react'
import { useOpsStore } from '@/store/useOpsStore'
import { Brain, X, Check, Loader2, AlertCircle, Trash2, Zap, Cookie, Shield, QrCode, RefreshCw, ExternalLink, ScanLine } from 'lucide-react'
import { toast } from 'sonner'

const MODELS = [
  {
    id: 'doubao',
    name: '豆包',
    emoji: '🤖',
    loginUrl: 'https://www.doubao.com/',
    proxyUrl: '/api/waos/brain/proxy/doubao/',
    desc: '字节跳动，多模态支持看图',
    priority: 1,
    ssoSteps: ['扫码或手机号登录豆包', '登录成功后点"我已登录"', '软件自动识别 Cookie'],
  },
  {
    id: 'qianwen',
    name: '通义千问',
    emoji: '🧠',
    loginUrl: 'https://qwen.aliyun.com/',
    proxyUrl: '/api/waos/brain/proxy/qianwen/',
    desc: '阿里，稳定快速',
    priority: 2,
    ssoSteps: ['支付宝/钉钉扫码登录', '登录成功后点"我已登录"', '软件自动识别 Cookie'],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    emoji: '🌙',
    loginUrl: 'https://kimi.moonshot.cn/',
    proxyUrl: '/api/waos/brain/proxy/kimi/',
    desc: '月之暗面，128K 长上下文',
    priority: 3,
    ssoSteps: ['手机号验证码登录', '登录成功后点"我已登录"', '软件自动识别 Cookie'],
  },
  {
    id: 'zhipu',
    name: '智谱清言',
    emoji: '✨',
    loginUrl: 'https://chatglm.cn/',
    proxyUrl: '/api/waos/brain/proxy/zhipu/',
    desc: 'GLM-5，国产最强推理',
    priority: 4,
    ssoSteps: ['手机号验证码登录', '登录成功后点"我已登录"', '软件自动识别 Cookie'],
  },
  {
    id: 'zai',
    name: 'Z.AI 内置',
    emoji: '🛡️',
    loginUrl: null,
    desc: '兜底模型，无需登录',
    priority: 5,
    ssoSteps: [],
  },
]

export function BrainSettings() {
  const brainOpen = useOpsStore(s => s.brainOpen)
  const setBrainOpen = useOpsStore(s => s.setBrainOpen)
  const modelCookies = useOpsStore(s => s.modelCookies)
  const setModelCookie = useOpsStore(s => s.setModelCookie)
  const removeModelCookie = useOpsStore(s => s.removeModelCookie)

  const [loginModel, setLoginModel] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [verifyResults, setVerifyResults] = useState<Record<string, { valid: boolean; message: string }>>({})
  const [editingModel, setEditingModel] = useState<string | null>(null)
  const [cookieDraft, setCookieDraft] = useState('')
  const [iframeKey, setIframeKey] = useState(0)  // 用于刷新 iframe
  const [loginWindowRef, setLoginWindowRef] = useState<Window | null>(null)
  const [checkInterval, setCheckInterval] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!brainOpen) {
      setLoginModel(null)
      setEditingModel(null)
      setCookieDraft('')
      if (checkInterval) { clearInterval(checkInterval); setCheckInterval(null) }
      if (loginWindowRef && !loginWindowRef.closed) loginWindowRef.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brainOpen])

  // 组件卸载时清理所有 interval（防止内存泄漏）
  useEffect(() => {
    return () => {
      if (checkInterval) clearInterval(checkInterval)
      if (loginWindowRef && !loginWindowRef.closed) loginWindowRef.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!brainOpen) return null

  // ─── 扫码登录（桌面端全自动 / Web 端半自动）──────────────────
  const startLogin = async (modelId: string) => {
    const model = MODELS.find(m => m.id === modelId)
    if (!model?.loginUrl) return

    setLoginModel(modelId)
    setVerifyResults(prev => { const n = { ...prev }; delete n[modelId]; return n })

    // 检测是否在 Electron 桌面客户端中
    const desktop = (window as any).waosDesktop
    if (desktop?.isDesktop && desktop.loginPlatform) {
      // ─── 桌面端: 全自动流程 ───
      setExtracting(true)
      toast.info(`正在打开 ${model.name} 登录窗口，请在弹出窗口中扫码登录`)
      try {
        const result = await desktop.loginPlatform(modelId, model.loginUrl)
        setExtracting(false)
        if (result.valid && result.cookie) {
          // 桌面端已自动抓取 Cookie，直接验证并保存
          toast.success(`已自动识别 ${model.name} Cookie，正在验证...`)
          await verifyAndSave(modelId, result.cookie)
        } else {
          toast.error(result.error || '自动识别失败，请用手动模式')
          setLoginModel(modelId)
        }
      } catch (e: unknown) {
        setExtracting(false)
        toast.error('登录异常: ' + (e as Error).message)
        setLoginModel(modelId)
      }
    } else {
      // ─── Web 端: 弹窗 + 用户确认 ───
      const win = window.open(model.loginUrl, '_blank', 'width=1200,height=800,noopener')
      setLoginWindowRef(win)
      toast.info(`已打开 ${model.name} 登录页，请在弹出窗口中扫码/验证码登录`)
      toast.info('登录后请关闭登录窗口，软件会自动检测', { duration: 4000 })

      // 轮询检测窗口关闭
      if (checkInterval) clearInterval(checkInterval)
      const interval = setInterval(() => {
        if (win?.closed) {
          clearInterval(interval)
          setCheckInterval(null)
          toast.info('登录窗口已关闭，请手动粘贴 Cookie（Web 版无法自动读取跨域 Cookie）')
          setLoginModel(modelId)
        }
      }, 500)
      setCheckInterval(interval)
    }
  }

  // ─── 自动提取 Cookie（通过后端代理访问平台用户接口）──────────
  const autoExtractCookie = async (modelId: string) => {
    setExtracting(true)
    toast.info(`正在检测 ${MODELS.find(m => m.id === modelId)?.name} 登录状态...`)
    try {
      // 通过后端代理访问平台首页，后端会捕获 Set-Cookie
      const model = MODELS.find(m => m.id === modelId)!
      const sessionId = `user_${Date.now()}`
      const proxyRes = await fetch(`${model.proxyUrl}?session=${sessionId}`, {
        headers: { 'x-session-id': sessionId },
      })

      if (proxyRes.ok) {
        // 代理请求成功，后端可能已经存了 Cookie
        // 提取 Cookie
        const extractRes = await fetch(`/api/waos/brain/extract?model=${modelId}&session=${sessionId}`)
        const extractData = await extractRes.json()

        if (extractData.cookie && extractData.cookie.length > 50) {
          // 有 Cookie，验证
          await verifyAndSave(modelId, extractData.cookie)
        } else {
          // 没有通过代理拿到 Cookie（可能登录窗口和软件不同源）
          // 回退到手动模式
          toast.error('自动识别失败，请用手动模式粘贴 Cookie')
          setLoginModel(modelId)
        }
      } else {
        toast.error('代理访问失败，请用手动模式')
        setLoginModel(modelId)
      }
    } catch (e: unknown) {
      toast.error('自动识别异常: ' + (e as Error).message)
      setLoginModel(modelId)
    }
    setExtracting(false)
  }

  // ─── 验证并保存 Cookie ───────────────────────────────────────
  const verifyAndSave = async (modelId: string, cookie: string) => {
    setVerifying(modelId)
    try {
      const res = await fetch('/api/waos/brain/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, cookie }),
      })
      const data = await res.json()
      setVerifyResults(prev => ({ ...prev, [modelId]: { valid: data.valid, message: data.message } }))

      if (data.valid) {
        setModelCookie(modelId, cookie)
        toast.success(`${MODELS.find(m => m.id === modelId)?.name} 登录成功！Cookie 已自动保存`)
        setLoginModel(null)
      } else {
        toast.error(`Cookie 无效: ${data.message}`)
        setLoginModel(modelId)  // 回到手动模式
      }
    } catch (e: unknown) {
      setVerifyResults(prev => ({ ...prev, [modelId]: { valid: false, message: (e as Error).message } }))
      toast.error('验证失败: ' + (e as Error).message)
    }
    setVerifying(null)
  }

  // ─── 手动保存 ───────────────────────────────────────────────
  const handleManualSave = async (modelId: string, cookie: string) => {
    if (!cookie.trim()) { toast.error('Cookie 不能为空'); return }
    await verifyAndSave(modelId, cookie.trim())
    setCookieDraft('')
    setEditingModel(null)
  }

  // ─── 测试对话 ───────────────────────────────────────────────
  const handleTest = async (modelId: string) => {
    setVerifying(modelId)
    try {
      const cookie = modelCookies[modelId] || ''
      const res = await fetch('/api/waos/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '你好，用一句话介绍自己' }],
          model: modelId === 'zai' ? 'auto' : modelId,
          cookies: modelId === 'zai' ? {} : { [modelId]: cookie },
        }),
      })
      const data = await res.json()
      if (res.ok && data.reply) {
        setVerifyResults(prev => ({ ...prev, [modelId]: { valid: true, message: `✅ ${data.model}: ${data.reply.slice(0, 50)}` } }))
        toast.success(`${MODELS.find(m => m.id === modelId)?.name} 测试成功`)
      } else {
        setVerifyResults(prev => ({ ...prev, [modelId]: { valid: false, message: `❌ ${data.error?.slice(0, 60) || '失败'}` } }))
        toast.error(`${MODELS.find(m => m.id === modelId)?.name} 测试失败`)
      }
    } catch (e: unknown) {
      setVerifyResults(prev => ({ ...prev, [modelId]: { valid: false, message: (e as Error).message } }))
    }
    setVerifying(null)
  }

  const handleTestAll = async () => {
    setVerifying('all')
    toast.info('正在测试所有已配置模型...')
    for (const m of MODELS) {
      if (m.id === 'zai' || modelCookies[m.id]) {
        await handleTest(m.id)
        await new Promise(r => setTimeout(r, 500))
      }
    }
    setVerifying(null)
    toast.success('全部测试完成')
  }

  const configuredCount = Object.keys(modelCookies).length + 1

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setBrainOpen(false)}>
      <div className="w-full max-w-2xl max-h-[85vh] bg-background rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
            <Brain className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-bold">AI 大脑 — 扫码登录自动识别</h2>
            <p className="text-[11px] text-muted-foreground">
              扫码登录 → 自动识别 Cookie · 已配置 {configuredCount}/5
            </p>
          </div>
          <button
            onClick={handleTestAll}
            disabled={verifying === 'all'}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50 apple-btn flex items-center gap-1.5"
          >
            {verifying === 'all' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            全部测试
          </button>
          <button onClick={() => setBrainOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 降级链 */}
        <div className="shrink-0 px-5 py-3 bg-secondary/30 border-b border-border">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-semibold">降级链:</span>
            {MODELS.map((m, i) => (
              <div key={m.id} className="flex items-center gap-1">
                <span className={`px-1.5 py-0.5 rounded font-medium ${
                  m.id === 'zai' || modelCookies[m.id]
                    ? 'bg-emerald-500/15 text-emerald-600'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {m.emoji} {m.name}
                </span>
                {i < MODELS.length - 1 && <span className="text-muted-foreground/50">→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* 登录进度弹窗 */}
        {loginModel && (
          <LoginProgress
            model={MODELS.find(m => m.id === loginModel)!}
            extracting={extracting}
            verifying={verifying === loginModel}
            verifyResult={verifyResults[loginModel]}
            cookieDraft={cookieDraft}
            setCookieDraft={setCookieDraft}
            onManualSave={(c) => handleManualSave(loginModel, c)}
            onRetry={() => startLogin(loginModel)}
            onCancel={() => { setLoginModel(null); if (loginWindowRef && !loginWindowRef.closed) loginWindowRef.close() }}
          />
        )}

        {/* Model list */}
        <div className="flex-1 overflow-y-auto waos-scrollbar p-4 space-y-3">
          {MODELS.map(m => {
            const hasCookie = m.id === 'zai' || !!modelCookies[m.id]
            const verifyResult = verifyResults[m.id]

            return (
              <div key={m.id} className={`rounded-xl border p-3 transition-colors ${
                hasCookie ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                    hasCookie ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                  }`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold">{m.emoji} {m.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">P{m.priority}</span>
                      {hasCookie && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 font-medium flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" /> 已登录
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</p>

                    {verifyResult && (
                      <div className={`mt-2 px-2 py-1.5 rounded-lg text-[10px] font-mono ${
                        verifyResult.valid ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                      }`}>
                        {verifyResult.message}
                      </div>
                    )}

                    {editingModel === m.id && m.id !== 'zai' && (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={cookieDraft}
                          onChange={e => setCookieDraft(e.target.value)}
                          placeholder="粘贴 Cookie (name=value; name=value; ...)"
                          className="w-full h-20 px-2.5 py-2 rounded-lg bg-background border border-border text-[10px] font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleManualSave(m.id, cookieDraft)} disabled={verifying === m.id}
                            className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/90 disabled:opacity-50 apple-btn flex items-center gap-1">
                            {verifying === m.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Shield className="w-2.5 h-2.5" />}
                            验证保存
                          </button>
                          <button onClick={() => { setEditingModel(null); setCookieDraft('') }}
                            className="px-3 py-1 rounded-lg bg-muted text-muted-foreground text-[10px] font-medium hover:bg-muted/70 apple-btn">
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    {m.loginUrl && (
                      <button onClick={() => startLogin(m.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/90 apple-btn flex items-center gap-1">
                        <QrCode className="w-2.5 h-2.5" />
                        扫码登录
                      </button>
                    )}
                    {m.id !== 'zai' && (
                      <button onClick={() => { setEditingModel(editingModel === m.id ? null : m.id); setCookieDraft(modelCookies[m.id] || '') }}
                        className="px-2.5 py-1 rounded-lg bg-secondary text-secondary-foreground text-[10px] font-medium hover:bg-secondary/70 apple-btn flex items-center gap-1">
                        <Cookie className="w-2.5 h-2.5" />
                        手动
                      </button>
                    )}
                    {hasCookie && (
                      <button onClick={() => handleTest(m.id)} disabled={verifying === m.id}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 text-[10px] font-medium hover:bg-emerald-500/20 disabled:opacity-50 apple-btn flex items-center gap-1">
                        {verifying === m.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />}
                        测试
                      </button>
                    )}
                    {hasCookie && m.id !== 'zai' && (
                      <button onClick={() => { removeModelCookie(m.id); setVerifyResults(prev => { const n = { ...prev }; delete n[m.id]; return n }) }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 text-[10px] font-medium hover:bg-rose-500/20 apple-btn flex items-center gap-1">
                        <Trash2 className="w-2.5 h-2.5" />
                        清除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-border bg-secondary/20">
          <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            <div>
              <p>点「扫码登录」→ 新窗口登录 → 软件自动识别 Cookie（无需手动复制）</p>
              <p className="mt-1">如自动识别失败，可点「手动」粘贴 Cookie。AI 大脑限流自动切下一个模型。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 登录进度弹窗 ─────────────────────────────────────────────
function LoginProgress({ model, extracting, verifying, verifyResult, cookieDraft, setCookieDraft, onManualSave, onRetry, onCancel }: {
  model: typeof MODELS[0]
  extracting: boolean
  verifying: boolean
  verifyResult?: { valid: boolean; message: string }
  cookieDraft: string
  setCookieDraft: (v: string) => void
  onManualSave: (cookie: string) => void
  onRetry: () => void
  onCancel: () => void
}) {
  return (
    <div className="absolute inset-0 z-10 bg-background/95 backdrop-blur-sm flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="shrink-0 px-5 py-4 border-b border-border flex items-center gap-3 bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[18px]">
          {model.emoji}
        </div>
        <div className="flex-1">
          <h3 className="text-[14px] font-bold">{model.name} 登录</h3>
          <p className="text-[10px] text-muted-foreground">
            {extracting ? '正在自动识别 Cookie...' : verifying ? '正在验证...' : '在弹出窗口中扫码登录'}
          </p>
        </div>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {extracting ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="text-[13px] font-medium">正在自动识别 {model.name} Cookie...</p>
            <p className="text-[11px] text-muted-foreground mt-1">请在弹出窗口中完成扫码/验证码登录</p>
            <p className="text-[10px] text-muted-foreground/70 mt-3">
              桌面客户端会在登录成功后自动抓取 Cookie，无需手动操作
            </p>
          </div>
        ) : verifying ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-4" />
            <p className="text-[13px] font-medium">正在验证 Cookie 有效性...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 登录指南 */}
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <ScanLine className="w-4 h-4 text-emerald-600" />
                <span className="text-[13px] font-semibold text-emerald-700">登录步骤</span>
              </div>
              <ol className="space-y-2">
                {model.ssoSteps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px]">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>

            {verifyResult && !verifyResult.valid && (
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
                <p className="text-[11px] text-amber-700 mb-2">
                  ⚠️ 自动识别失败（浏览器安全限制，无法跨域读取 Cookie）
                </p>
                <p className="text-[11px] text-muted-foreground mb-2">请手动粘贴 Cookie:</p>
                <ol className="space-y-1 text-[10px] text-muted-foreground mb-2">
                  <li>1. 在 {model.name} 页面按 F12</li>
                  <li>2. Application → Cookies → 复制全部</li>
                  <li>3. 粘贴到下方</li>
                </ol>
                <textarea
                  value={cookieDraft}
                  onChange={e => setCookieDraft(e.target.value)}
                  placeholder="粘贴 Cookie..."
                  className="w-full h-20 px-2.5 py-2 rounded-lg bg-background border border-border text-[10px] font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button onClick={() => onManualSave(cookieDraft)} disabled={!cookieDraft.trim()}
                  className="mt-2 w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50 apple-btn">
                  验证并保存
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={onRetry}
                className="flex-1 px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-[12px] font-medium hover:bg-secondary/70 apple-btn flex items-center justify-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                重新打开登录页
              </button>
              <button onClick={onCancel}
                className="px-4 py-2.5 rounded-lg bg-muted text-muted-foreground text-[12px] font-medium hover:bg-muted/70 apple-btn">
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
