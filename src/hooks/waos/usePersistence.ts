'use client'

/**
 * WAOS localStorage persistence + 苹果自动变色主题
 *
 * 主题模式:
 *  - 'light'  — 浅色（手动）
 *  - 'dark'   — 深色（手动）
 *  - 'auto'   — 自动（根据时间 6:00-18:00 浅色，18:00-6:00 深色）
 *
 * 自动模式像 macOS 一样：
 *  - 日出自动切浅色
 *  - 日落自动切深色
 *  - 每分钟检查一次时间
 */

import { useEffect } from 'react'
import { useOpsStore, type Settings } from '@/store/useOpsStore'

const SETTINGS_KEY = 'waos:settings:v1'

const DEFAULT_SETTINGS: Settings = {
  agingRate: 2,
  businessHoursStart: 9,
  businessHoursEnd: 22,
  workerCapacity: 20,
  cooldownMinutes: 30,
  hotThreshold: 80,
  warmThreshold: 50,
  theme: 'auto',
  density: 'compact',
  showSafetyShield: true,
  showAuditTimeline: true,
  showMetricsCharts: true,
  notifyOnHot: true,
  notifyOnFallback: true,
  notifyOnSafety: true,
  notifyOnHuman: true,
  soundEnabled: false,
}

export function loadSettingsFromStorage(): Partial<Settings> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return null
  }
}

export function saveSettingsToStorage(settings: Settings) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}

// 根据当前时间判断应该是浅色还是深色
function getAutoTheme(): 'light' | 'dark' {
  const hour = new Date().getHours()
  // 6:00-18:00 浅色，18:00-6:00 深色
  return (hour >= 6 && hour < 18) ? 'light' : 'dark'
}

// 应用主题到 <html>
function applyTheme(theme: 'light' | 'dark' | 'auto') {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const effective = theme === 'auto' ? getAutoTheme() : theme
  if (effective === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  // 设置 color-scheme 让浏览器原生控件也跟随
  root.style.colorScheme = effective
}

export function usePersistence() {
  const settings = useOpsStore(s => s.settings)
  const updateSettings = useOpsStore(s => s.updateSettings)

  // Load on mount
  useEffect(() => {
    const loaded = loadSettingsFromStorage()
    if (loaded) {
      updateSettings(loaded)
    } else {
      // 首次使用，应用默认 auto 主题
      applyTheme('auto')
    }

    // 加载 modelCookies（AI 大脑 Cookie）— 客户端 mount 后加载，避免 hydration mismatch
    try {
      const raw = localStorage.getItem('waos:modelCookies')
      if (raw) {
        const cookies = JSON.parse(raw)
        if (cookies && typeof cookies === 'object') {
          useOpsStore.setState({ modelCookies: cookies })
        }
      }
    } catch {}
  }, [])

  // Persist on change
  useEffect(() => {
    saveSettingsToStorage(settings)
  }, [settings])

  // Apply theme immediately when settings change
  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  // 自动模式：每分钟检查时间，日出/日落自动切换
  useEffect(() => {
    if (settings.theme !== 'auto') return

    const checkInterval = setInterval(() => {
      applyTheme('auto')
    }, 60000) // 每分钟检查

    // 也监听系统主题变化（如果浏览器支持）
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemChange = () => {
      if (useOpsStore.getState().settings.theme === 'auto') {
        applyTheme('auto')
      }
    }
    mediaQuery.addEventListener('change', handleSystemChange)

    return () => {
      clearInterval(checkInterval)
      mediaQuery.removeEventListener('change', handleSystemChange)
    }
  }, [settings.theme])
}
