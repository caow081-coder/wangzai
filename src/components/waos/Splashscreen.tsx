'use client'

import { useEffect, useState } from 'react'

/**
 * 旺财开机界面 — Splash Screen v2
 *
 * 对齐用户品牌设计：深色主题 + 柴犬吉祥物 + 霓虹绿光效
 * 2.5秒自动淡出
 */

const SPLASH_DURATION = 2500

export function Splashscreen() {
  const [visible, setVisible] = useState(true)
  const [progress, setProgress] = useState(0)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(100, p + Math.random() * 15 + 5))
    }, 100)

    const fadeTimer = setTimeout(() => setFadeOut(true), SPLASH_DURATION - 400)
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
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950 transition-opacity duration-500 ${fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      {/* 底部光晕 */}
      <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-teal-500/10 blur-3xl" />

      {/* 柴犬头像 + 光环 */}
      <div className="relative mb-8">
        {/* 外光环 — 旋转 */}
        <div className="absolute -inset-4 rounded-full border-2 border-emerald-400/30 border-t-emerald-400/80 animate-spin" style={{ animationDuration: '3s' }} />
        {/* 内光晕 */}
        <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-xl animate-pulse" />
        {/* 头像 */}
        <div className="relative w-36 h-36 rounded-full overflow-hidden border-2 border-emerald-400/50 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
          <img
            src="/wangcai-logo.png"
            alt="旺财"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* 软件名 */}
      <h1 className="text-5xl font-bold text-white mb-2 tracking-wider">
        旺财
      </h1>
      <p className="text-sm text-emerald-400/80 mb-10 tracking-wide">
        AI 私域助手 · 让生意更旺
      </p>

      {/* 加载进度条 */}
      <div className="w-56 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-200 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-zinc-500 mt-4 font-mono tracking-wide">
        {progress < 30 ? '正在唤醒旺财...' : progress < 60 ? '加载 AI 大脑...' : progress < 90 ? '连接微信客户端...' : '即将就绪...'}
      </p>

      {/* 底部版本 */}
      <div className="absolute bottom-8 text-xs text-zinc-600 tracking-wider">
        旺财 v1.0.0 · AI 私域营销助手
      </div>
    </div>
  )
}
