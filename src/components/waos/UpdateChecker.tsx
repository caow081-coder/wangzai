'use client'

/**
 * 旺财 WAOS · 自动更新组件
 *
 * 由两部分组成：
 *  1. <UpdateChecker />        — 挂载在 page.tsx，无可见 UI（除下载进度浮窗），
 *                                监听主进程事件并通过 toast 通知用户。
 *  2. <UpdateStatusInline />   — 嵌入 SettingsDialog，提供"检查更新"按钮和当前版本号。
 *
 * 数据流：
 *   主进程 electron-updater
 *     → ipcRenderer 推送 update-available / download-progress / update-downloaded
 *     → preload.js 的 window.waosUpdater.onUpdateXxx 回调
 *     → useUpdaterStore 更新状态
 *     → UI 渲染（toast / 浮窗 / 设置面板）
 *
 * 在网页端（非 Electron）下 window.waosUpdater 不存在，整个组件降级为空操作。
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import {
  RefreshCw, Download, RotateCw, CheckCircle2, AlertCircle,
  Sparkles, X, Loader2,
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

// ─── 全局类型声明 ────────────────────────────────────────────
declare global {
  interface Window {
    waosUpdater?: {
      isAvailable: boolean
      checkForUpdates: () => Promise<CheckResult>
      downloadUpdate: () => Promise<DownloadResult>
      installUpdate: () => Promise<InstallResult>
      getAppVersion: () => Promise<{ version: string; isPackaged: boolean }>
      onUpdateAvailable: (cb: (info: UpdateInfo) => void) => () => void
      onUpdateDownloaded: (cb: (info: UpdateInfo) => void) => () => void
      onUpdateDownloadProgress: (cb: (p: DownloadProgress) => void) => () => void
    }
  }
}

interface UpdateInfo {
  version?: string
  releaseDate?: string
  releaseNotes?: string | unknown
}

interface DownloadProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

interface CheckResult {
  available: boolean
  info?: UpdateInfo | null
  currentVersion?: string
  reason?: string
  error?: string
}

interface DownloadResult {
  success: boolean
  reason?: string
  error?: string
}

interface InstallResult {
  success: boolean
  reason?: string
  error?: string
}

// ─── 更新状态机 ──────────────────────────────────────────────
type UpdateStatus =
  | 'idle'           // 初始
  | 'checking'       // 正在检查
  | 'available'      // 发现新版本
  | 'no-update'      // 已是最新
  | 'downloading'    // 下载中
  | 'downloaded'     // 下载完成，等待安装
  | 'error'          // 出错
  | 'unavailable'    // 非桌面环境 / 开发模式

interface UpdaterState {
  status: UpdateStatus
  currentVersion: string
  newVersion: string
  releaseNotes: string
  progress: DownloadProgress | null
  errorMsg: string
  lastCheckedAt: number | null

  setStatus: (s: UpdateStatus) => void
  setNewVersion: (v: string) => void
  setReleaseNotes: (n: string) => void
  setProgress: (p: DownloadProgress | null) => void
  setError: (msg: string) => void
  setChecked: () => void
  reset: () => void
}

const useUpdaterStore = create<UpdaterState>((set) => ({
  status: 'idle',
  currentVersion: '',
  newVersion: '',
  releaseNotes: '',
  progress: null,
  errorMsg: '',
  lastCheckedAt: null,

  setStatus: (status) => set({ status }),
  setNewVersion: (newVersion) => set({ newVersion }),
  setReleaseNotes: (releaseNotes) => set({ releaseNotes }),
  setProgress: (progress) => set({ progress }),
  setError: (errorMsg) => set({ errorMsg, status: 'error' }),
  setChecked: () => set({ lastCheckedAt: Date.now() }),
  reset: () =>
    set({
      status: 'idle',
      newVersion: '',
      releaseNotes: '',
      progress: null,
      errorMsg: '',
    }),
}))

// ─── 工具函数 ────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec < 0) return '0 B/s'
  return `${formatBytes(bytesPerSec)}/s`
}

/** 从 electron-updater 的 releaseNotes 字段中提取纯文本 */
function extractReleaseNotes(notes: unknown): string {
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((n: unknown) => {
        if (typeof n === 'string') return n
        if (n && typeof n === 'object' && 'note' in n) return String((n as { note: unknown }).note)
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/** 是否处于可被用户感知"更新中"的状态（用于显示浮窗） */
function isActiveStatus(s: UpdateStatus): boolean {
  return s === 'downloading' || s === 'available' || s === 'downloaded'
}

// ─── 主动作：检查更新 ────────────────────────────────────────
async function doCheckUpdate(manual = false): Promise<void> {
  const store = useUpdaterStore.getState()
  const updater = window.waosUpdater

  if (!updater?.isAvailable) {
    store.setStatus('unavailable')
    if (manual) {
      toast.info('当前为网页版或开发模式', {
        description: '自动更新仅在打包后的桌面客户端中可用',
      })
    }
    return
  }

  store.setStatus('checking')
  try {
    const result = await updater.checkForUpdates()
    store.setChecked()

    if (result.currentVersion) {
      useUpdaterStore.setState({ currentVersion: result.currentVersion })
    }

    if (result.error) {
      store.setError(result.error)
      if (manual) {
        toast.error('检查更新失败', { description: result.error })
      }
      return
    }

    if (result.available && result.info?.version) {
      const newVer = result.info.version
      const notes = extractReleaseNotes(result.info.releaseNotes)
      store.setStatus('available')
      store.setNewVersion(newVer)
      store.setReleaseNotes(notes)

      toast.success(`发现新版本 v${newVer}`, {
        description: '点击下载并安装',
        duration: 10000,
        action: {
          label: '下载更新',
          onClick: () => doDownload(),
        },
        icon: <Sparkles className="h-4 w-4" />,
      })
    } else {
      store.setStatus('no-update')
      if (manual) {
        toast.success('当前已是最新版本', {
          description: `v${result.currentVersion || '?'}`,
        })
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    store.setError(msg)
    if (manual) {
      toast.error('检查更新失败', { description: msg })
    }
  }
}

// ─── 主动作：下载更新 ────────────────────────────────────────
async function doDownload(): Promise<void> {
  const store = useUpdaterStore.getState()
  const updater = window.waosUpdater

  if (!updater?.isAvailable) {
    toast.error('当前环境不支持自动更新')
    return
  }

  if (store.status === 'downloading') {
    toast.info('正在下载中，请稍候…')
    return
  }

  store.setStatus('downloading')
  store.setProgress({ percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 })

  try {
    const result = await updater.downloadUpdate()
    if (!result.success) {
      store.setError(result.error || result.reason || '下载失败')
      toast.error('下载失败', {
        description: result.error || result.reason,
      })
    }
    // 下载成功后由 update-downloaded 事件接管，状态会切换到 'downloaded'
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    store.setError(msg)
    toast.error('下载失败', { description: msg })
  }
}

// ─── 主动作：安装并重启 ──────────────────────────────────────
async function doInstall(): Promise<void> {
  const store = useUpdaterStore.getState()
  const updater = window.waosUpdater

  if (!updater?.isAvailable) {
    toast.error('当前环境不支持自动更新')
    return
  }

  toast.info('正在准备安装…', { description: '应用将关闭并重启' })
  try {
    const result = await updater.installUpdate()
    if (!result.success) {
      store.setError(result.error || result.reason || '安装失败')
      toast.error('安装失败', { description: result.error || result.reason })
    }
    // quitAndInstall 会终止进程，到这一步说明失败
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    store.setError(msg)
    toast.error('安装失败', { description: msg })
  }
}

// ─── UpdateChecker：事件监听 + Toast 通知 ─────────────────────
export function UpdateChecker() {
  const status = useUpdaterStore((s) => s.status)
  const checkedRef = useRef(false)

  // 注册主进程事件监听 + 启动后自动检查一次
  useEffect(() => {
    const updater = window.waosUpdater
    if (!updater?.isAvailable) return

    // 发现新版本（被动推送，启动后自动检查触发）
    const offAvailable = updater.onUpdateAvailable((info) => {
      const ver = info?.version || ''
      useUpdaterStore.setState({
        status: 'available',
        newVersion: ver,
        releaseNotes: extractReleaseNotes(info?.releaseNotes),
      })
      toast.success(`发现新版本 ${ver ? `v${ver}` : ''}`, {
        description: '点击下载并安装',
        duration: 15000,
        action: {
          label: '下载更新',
          onClick: () => doDownload(),
        },
        icon: <Sparkles className="h-4 w-4" />,
      })
    })

    // 下载完成
    const offDownloaded = updater.onUpdateDownloaded((info) => {
      const ver = info?.version || useUpdaterStore.getState().newVersion
      useUpdaterStore.setState({ status: 'downloaded', newVersion: ver })
      toast.success(`新版本 ${ver ? `v${ver}` : ''} 已下载完成`, {
        description: '点击重启并安装',
        duration: 30000,
        action: {
          label: '重启并安装',
          onClick: () => doInstall(),
        },
        icon: <CheckCircle2 className="h-4 w-4" />,
      })
    })

    // 下载进度
    const offProgress = updater.onUpdateDownloadProgress((p) => {
      useUpdaterStore.setState({
        status: 'downloading',
        progress: p,
      })
    })

    // 拉取当前版本（用于设置面板展示）
    updater
      .getAppVersion()
      .then((r) => {
        useUpdaterStore.setState({ currentVersion: r.version })
      })
      .catch(() => {})

    // 启动后自动检查一次（延迟 5s，等首屏渲染完）
    if (!checkedRef.current) {
      checkedRef.current = true
      const timer = setTimeout(() => {
        doCheckUpdate(false)
      }, 5000)
      return () => {
        clearTimeout(timer)
        offAvailable?.()
        offDownloaded?.()
        offProgress?.()
      }
    }

    return () => {
      offAvailable?.()
      offDownloaded?.()
      offProgress?.()
    }
  }, [])

  // 浮窗仅在下载中 / 已就绪时显示（直接派生自 status，不用 setState）
  if (!isActiveStatus(status)) return null

  return <UpdateProgressFloat />
}

// ─── 下载进度浮窗（仅 UpdateChecker 内部使用）─────────────────
function UpdateProgressFloat() {
  const status = useUpdaterStore((s) => s.status)
  const progress = useUpdaterStore((s) => s.progress)
  const newVersion = useUpdaterStore((s) => s.newVersion)
  const [dismissed, setDismissed] = useState(false)

  // 下载完成后允许关闭浮窗（toast 仍保留）
  if (dismissed && status !== 'downloading') return null

  const pct = Math.round(progress?.percent || 0)

  return (
    <div
      className="fixed bottom-4 right-4 z-[70] w-[320px] rounded-xl bg-background/95 backdrop-blur-xl border border-border shadow-2xl overflow-hidden"
      role="dialog"
      aria-label="更新进度"
    >
      {/* 顶部彩条 */}
      <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-md bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              {status === 'downloading' ? (
                <Download className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
              ) : status === 'downloaded' ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-foreground truncate">
                {status === 'downloading'
                  ? `正在下载 v${newVersion}`
                  : status === 'downloaded'
                    ? `v${newVersion} 已就绪`
                    : '更新中…'}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {progress
                  ? `${formatBytes(progress.transferred)} / ${formatBytes(progress.total)} · ${formatSpeed(progress.bytesPerSecond)}`
                  : '准备中…'}
              </div>
            </div>
          </div>
          {status !== 'downloading' && (
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground transition flex-shrink-0"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {status === 'downloading' && (
          <div className="space-y-1.5">
            <Progress value={pct} className="h-1.5 [&>div]:bg-emerald-500" />
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
              <span>{pct}%</span>
              <span>请勿关闭应用</span>
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <Button
            size="sm"
            onClick={() => doInstall()}
            className="w-full h-8 text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <RotateCw className="h-3 w-3 mr-1.5" />
            重启并安装
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── UpdateStatusInline：嵌入 SettingsDialog 的内联面板 ───────
export function UpdateStatusInline() {
  const status = useUpdaterStore((s) => s.status)
  const currentVersion = useUpdaterStore((s) => s.currentVersion)
  const newVersion = useUpdaterStore((s) => s.newVersion)
  const errorMsg = useUpdaterStore((s) => s.errorMsg)
  const lastCheckedAt = useUpdaterStore((s) => s.lastCheckedAt)
  const updater = typeof window !== 'undefined' ? window.waosUpdater : undefined
  const isAvailable = !!updater?.isAvailable

  const handleCheck = useCallback(() => {
    doCheckUpdate(true)
  }, [])

  const handleDownload = useCallback(() => {
    doDownload()
  }, [])

  const handleInstall = useCallback(() => {
    doInstall()
  }, [])

  // 状态文案与配色
  const statusMap: Record<
    string,
    { label: string; color: string; icon: React.ReactNode }
  > = {
    idle: { label: '尚未检查', color: 'text-zinc-400', icon: <RefreshCw className="w-3 h-3" /> },
    checking: { label: '检查中…', color: 'text-sky-400', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    available: { label: `发现新版本 v${newVersion}`, color: 'text-emerald-400', icon: <Sparkles className="w-3 h-3" /> },
    'no-update': { label: '已是最新版本', color: 'text-emerald-400', icon: <CheckCircle2 className="w-3 h-3" /> },
    downloading: { label: '下载中…', color: 'text-sky-400', icon: <Download className="w-3 h-3 animate-pulse" /> },
    downloaded: { label: '已就绪，可重启安装', color: 'text-emerald-400', icon: <CheckCircle2 className="w-3 h-3" /> },
    error: { label: '出错', color: 'text-rose-400', icon: <AlertCircle className="w-3 h-3" /> },
    unavailable: { label: '网页/开发模式', color: 'text-zinc-500', icon: <AlertCircle className="w-3 h-3" /> },
  }
  const st = statusMap[status] || statusMap.idle

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
        <h3 className="text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">版本与更新</h3>
      </div>

      <div className="space-y-3 pl-1">
        {/* 当前版本号 */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-400">当前版本</span>
          <span className="text-[11px] font-mono font-semibold text-emerald-400">
            v{currentVersion || '—'}
          </span>
        </div>

        {/* 状态指示器 */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-400">更新状态</span>
          <span className={`text-[11px] font-medium flex items-center gap-1 ${st.color}`}>
            {st.icon}
            {st.label}
          </span>
        </div>

        {/* 上次检查时间 */}
        {lastCheckedAt && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">上次检查</span>
            <span className="text-[10px] font-mono text-zinc-500">
              {new Date(lastCheckedAt).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}

        {/* 错误信息 */}
        {status === 'error' && errorMsg && (
          <div className="text-[10px] font-mono text-rose-400/80 bg-rose-500/10 border border-rose-500/20 rounded px-2 py-1.5 break-all">
            {errorMsg}
          </div>
        )}

        {/* 操作按钮组 */}
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCheck}
            disabled={!isAvailable || status === 'checking' || status === 'downloading'}
            className="flex-1 h-8 text-[11px] border-[oklch(1_0_0/10%)] bg-[oklch(0.13_0_0)] text-zinc-300 hover:text-white hover:bg-[oklch(1_0_0/8%)] disabled:opacity-40"
          >
            {status === 'checking' ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1.5" />
            )}
            检查更新
          </Button>

          {status === 'available' && (
            <Button
              size="sm"
              onClick={handleDownload}
              className="flex-1 h-8 text-[11px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40"
            >
              <Download className="w-3 h-3 mr-1.5" />
              下载
            </Button>
          )}

          {status === 'downloaded' && (
            <Button
              size="sm"
              onClick={handleInstall}
              className="flex-1 h-8 text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              <RotateCw className="w-3 h-3 mr-1.5" />
              重启并安装
            </Button>
          )}
        </div>

        {/* 不可用提示 */}
        {!isAvailable && (
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            自动更新仅在打包后的桌面客户端中可用。开发模式或网页版不启用。
          </p>
        )}
      </div>
    </section>
  )
}

export default UpdateChecker
