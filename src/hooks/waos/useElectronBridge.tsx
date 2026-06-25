'use client'

/**
 * 旺财 Electron 桥接 Hook
 *
 * 检测是否在 Electron 桌面端运行，并提供：
 *  1. createPlatformView — 创建 BrowserView 嵌入微信/抖音/视频号网页版
 *  2. showPlatformView — 显示/隐藏
 *  3. destroyPlatformView — 销毁
 *  4. sendToPlatform — 发送消息（经过沙箱）
 *  5. readPlatformMessages — 读取消息
 *
 * 在网页端（非 Electron），这些 API 返回 null，UI 会降级到模拟数据。
 */

import { useState, useEffect, useCallback, useRef } from 'react'

declare global {
  interface Window {
    waosDesktop?: {
      isDesktop: boolean
      platform: string
      version: string
      createPlatformView: (platform: string) => Promise<{ success: boolean; platform?: string; error?: string }>
      destroyPlatformView: (platform: string) => Promise<{ success: boolean }>
      updateViewBounds: (platform: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<{ success: boolean }>
      showPlatformView: (platform: string, visible: boolean) => Promise<{ success: boolean }>
      sendToPlatform: (platform: string, text: string) => Promise<{ success: boolean; error?: string; cooldown?: number }>
      readPlatformMessages: (platform: string) => Promise<{ messages?: unknown[]; error?: string }>
      readPlatformComments: (platform: string) => Promise<{ comments?: unknown[]; error?: string }>
      loginPlatform: (model: string, loginUrl: string) => Promise<unknown>
      closeLoginWindow: () => void
      selfHeal: (platform: string) => Promise<unknown>
      sandboxStatus: (platform: string) => Promise<unknown>
    }
  }
}

export function useElectronBridge() {
  // 初始值直接从 window 读取（避免 effect 内 setState）
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false
    return !!window.waosDesktop?.isDesktop
  })
  const [platform, setPlatform] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return window.waosDesktop?.platform || ''
  })

  // isDesktop 初始值已在 useState 中计算，无需额外 effect

  const createPlatformView = useCallback(async (p: string) => {
    if (!window.waosDesktop) return { success: false, error: '非桌面环境' }
    try {
      return await window.waosDesktop.createPlatformView(p)
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }, [])

  const showPlatformView = useCallback(async (p: string, visible: boolean) => {
    if (!window.waosDesktop) return { success: false }
    try {
      return await window.waosDesktop.showPlatformView(p, visible)
    } catch {
      return { success: false }
    }
  }, [])

  const destroyPlatformView = useCallback(async (p: string) => {
    if (!window.waosDesktop) return { success: false }
    try {
      return await window.waosDesktop.destroyPlatformView(p)
    } catch {
      return { success: false }
    }
  }, [])

  const sendToPlatform = useCallback(async (p: string, text: string) => {
    if (!window.waosDesktop) return { success: false, error: '非桌面环境' }
    try {
      return await window.waosDesktop.sendToPlatform(p, text)
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }, [])

  const readPlatformMessages = useCallback(async (p: string) => {
    if (!window.waosDesktop) return { messages: [], error: '非桌面环境' }
    try {
      return await window.waosDesktop.readPlatformMessages(p)
    } catch (e) {
      return { messages: [], error: e instanceof Error ? e.message : String(e) }
    }
  }, [])

  return {
    isDesktop,
    platform,
    createPlatformView,
    showPlatformView,
    destroyPlatformView,
    sendToPlatform,
    readPlatformMessages,
  }
}

/**
 * 平台嵌入视图容器
 *
 * 在 Electron 环境：调用 createPlatformView 创建 BrowserView
 * BrowserView 会叠加在这个 div 区域上方（Electron 原生层级）
 * div 只是占位，让布局正确，实际渲染由 BrowserView 完成
 *
 * 在网页环境：显示降级 UI（提示需打包桌面版）
 */
export function PlatformEmbedView({
  platform,
  active,
  placeholder,
}: {
  platform: 'wechat' | 'douyin' | 'video'
  active: boolean
  placeholder?: React.ReactNode
}) {
  const { isDesktop, createPlatformView, showPlatformView, destroyPlatformView } = useElectronBridge()
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'idle' | 'creating' | 'ready' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // 创建 BrowserView
  useEffect(() => {
    if (!isDesktop || !active) return
    let mounted = true

    async function init() {
      setStatus('creating')
      const r = await createPlatformView(platform)
      if (!mounted) return
      if (r.success) {
        setStatus('ready')
      } else {
        setStatus('error')
        setErrorMsg(r.error || '创建失败')
      }
    }
    init()

    return () => {
      mounted = false
      // 组件卸载或 active 变 false 时隐藏（不销毁，保留登录态）
      showPlatformView(platform, false)
    }
  }, [isDesktop, platform, active, createPlatformView, showPlatformView])

  // 显示/隐藏
  useEffect(() => {
    if (!isDesktop) return
    showPlatformView(platform, active)
  }, [active, isDesktop, platform, showPlatformView])

  // 更新 BrowserView 边界（跟随 div 容器位置）
  useEffect(() => {
    if (!isDesktop || !active || status !== 'ready') return
    const updateBounds = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      window.waosDesktop?.updateViewBounds?.(platform, {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.max(100, Math.round(rect.width)),
        height: Math.max(100, Math.round(rect.height)),
      }).catch(() => {})
    }
    updateBounds()
    window.addEventListener('resize', updateBounds)
    const ro = new ResizeObserver(updateBounds)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => {
      window.removeEventListener('resize', updateBounds)
      ro.disconnect()
    }
  }, [isDesktop, active, status, platform])

  if (!isDesktop) {
    // 网页端降级：显示 placeholder（模拟数据 UI）
    return <>{placeholder}</>
  }

  if (!active) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-white dark:bg-[#1e1e1e]"
      data-platform-embed={platform}
    >
      {status === 'creating' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-[#1e1e1e] z-10">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground">正在加载{platform === 'wechat' ? '微信' : platform === 'douyin' ? '抖音' : '视频号'}网页版…</p>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 dark:bg-red-950/20 z-10">
          <div className="text-center px-4">
            <p className="text-[13px] text-red-600 dark:text-red-400 font-medium mb-1">嵌入失败</p>
            <p className="text-[11px] text-red-500/70 mb-3">{errorMsg}</p>
            <button
              onClick={() => {
                setStatus('idle')
                setTimeout(() => createPlatformView(platform).then(r => {
                  setStatus(r.success ? 'ready' : 'error')
                  if (!r.success) setErrorMsg(r.error || '创建失败')
                }), 100)
              }}
              className="px-3 py-1.5 text-[12px] rounded bg-red-500 text-white hover:bg-red-600"
            >
              重试
            </button>
          </div>
        </div>
      )}
      {status === 'ready' && (
        // BrowserView 会叠加在这个透明区域上方，实际微信网页版可见
        <div className="absolute inset-0 pointer-events-none">
          {/* 提示条（可选，告知用户这是真实嵌入）*/}
          <div className="absolute top-1 right-1 z-20 px-2 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 pointer-events-auto">
            ● 真实嵌入
          </div>
        </div>
      )}
    </div>
  )
}
