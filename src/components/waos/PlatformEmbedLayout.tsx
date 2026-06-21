'use client'

/**
 * 旺财 · 通用平台嵌入布局
 *
 * 用于微信/抖音/视频号/朋友圈等平台 tab：
 *  - Electron 桌面端：用 PlatformEmbedView 嵌入真实平台网页版
 *  - 网页端：降级显示模拟数据面板（children）
 *
 * 顶部统一工具栏：平台状态 + 嵌入/模拟切换 + 防护提示
 */

import { useState, useEffect } from 'react'
import { Loader2, Monitor, Shield, AlertTriangle, RefreshCw } from 'lucide-react'
import { useElectronBridge, PlatformEmbedView } from '@/hooks/waos/useElectronBridge'

interface PlatformEmbedLayoutProps {
  platform: 'wechat' | 'douyin' | 'video'
  title: string
  icon: string
  description: string
  /** 网页端降级显示的模拟面板 */
  children?: React.ReactNode
  /** 是否默认启用嵌入（默认 true） */
  defaultEmbed?: boolean
}

export function PlatformEmbedLayout({
  platform,
  title,
  icon,
  description,
  children,
  defaultEmbed = true,
}: PlatformEmbedLayoutProps) {
  const { isDesktop } = useElectronBridge()
  const [embedMode, setEmbedMode] = useState(() => isDesktop && defaultEmbed)
  const [showTip, setShowTip] = useState(true)

  // 桌面端默认 3 秒后隐藏提示条
  useEffect(() => {
    if (embedMode) {
      const t = setTimeout(() => setShowTip(false), 3000)
      return () => clearTimeout(t)
    }
  }, [embedMode])

  // 网页端直接显示模拟面板
  if (!isDesktop) {
    return <>{children}</>
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f5f5] dark:bg-[#1e1e1e]">
      {/* 顶部工具栏 */}
      <div className="h-9 shrink-0 bg-white dark:bg-[#2a2a2a] border-b border-black/5 dark:border-white/5 flex items-center px-3 gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-[12px] font-semibold">{title}</span>
        <span className="text-[10px] text-muted-foreground hidden sm:inline truncate">{description}</span>
        <div className="flex-1" />
        {embedMode && (
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <Monitor className="w-3 h-3" />
            <span>真实嵌入</span>
          </div>
        )}
        <button
          onClick={() => setEmbedMode(!embedMode)}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            embedMode
              ? 'border-amber-500/30 text-amber-600 hover:bg-amber-500/10'
              : 'border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10'
          }`}
          title={embedMode ? '切换到模拟模式（调试用）' : '切换到真实嵌入'}
        >
          {embedMode ? '模拟模式' : '真实嵌入'}
        </button>
      </div>

      {/* 防护提示条（嵌入模式 + 首次 3 秒显示）*/}
      {embedMode && showTip && (
        <div className="shrink-0 px-3 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2">
          <Shield className="w-3 h-3 text-emerald-600 shrink-0" />
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 flex-1">
            已启用执行沙箱：防封延迟 2-4 秒 + 行为漂移检测 + 失败重试 3 次指数退避
          </span>
          <button onClick={() => setShowTip(false)} className="text-[10px] text-emerald-600 hover:underline">
            知道了
          </button>
        </div>
      )}

      {/* 嵌入区或模拟面板 */}
      {embedMode ? (
        <div className="flex-1 min-h-0 relative">
          <PlatformEmbedView
            platform={platform}
            active={true}
            placeholder={
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mx-auto mb-2" />
                  <p className="text-[12px] text-muted-foreground">加载{title}中…</p>
                </div>
              </div>
            }
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      )}
    </div>
  )
}
