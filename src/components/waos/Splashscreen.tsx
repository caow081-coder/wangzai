'use client'

import { useEffect, useState } from 'react'

/**
 * 旺财开机界面 — Splash Screen
 *
 * 软件启动时显示 2.5 秒：
 *  - 旺财头像（用户提供的吉祥物）
 *  - 软件名"旺财"
 *  - 加载进度条
 *  - 自动消失
 */

const SPLASH_DURATION = 2500

export function Splashscreen() {
  const [visible, setVisible] = useState(true)
  const [progress, setProgress] = useState(0)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    // 进度条动画
    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(100, p + Math.random() * 15 + 5))
    }, 100)

    // 淡出
    const fadeTimer = setTimeout(() => setFadeOut(true), SPLASH_DURATION - 400)
    // 隐藏
    const hideTimer = setTimeout(() => setVisible(false), SPLASH_DURATION)

    return () => {
      clearInterval(progressInterval)
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-900 transition-opacity duration-500 ${fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      {/* 装饰光斑 */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-teal-400/20 blur-3xl" />

      {/* 头像 + 光晕 */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-emerald-400/30 blur-2xl animate-pulse" />
        <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-zinc-700 shadow-2xl">
          <img
            src="/wangcai-logo.png"
            alt="旺财"
            className="w-full h-full object-cover"
          />
        </div>
        {/* 旋转光环 */}
        <div className="absolute -inset-2 rounded-full border-2 border-emerald-400/40 border-t-transparent animate-spin" style={{ animationDuration: '2s' }} />
      </div>

      {/* 软件名 */}
      <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent mb-1">
        旺财
      </h1>
      <p className="text-sm text-emerald-700/70 dark:text-emerald-300/70 mb-8">
        AI 私域营销助手
      </p>

      {/* 加载进度条 */}
      <div className="w-48 h-1 bg-emerald-100 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-[10px] text-emerald-600/50 mt-3 font-mono">
        {progress < 30 ? '正在唤醒旺财...' : progress < 60 ? '加载 AI 大脑...' : progress < 90 ? '连接微信客户端...' : '即将就绪...'}
      </p>

      {/* 底部版本号 */}
      <div className="absolute bottom-6 text-[10px] text-emerald-600/40">
        旺财 v1.0.0 · 让 AI 帮你赚钱
      </div>
    </div>
  )
}
