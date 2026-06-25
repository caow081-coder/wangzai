/**
 * WAOS Desktop — Electron Preload
 *
 * 桌面客户端通过 contextBridge 暴露 API 给渲染进程:
 *  - waosDesktop: 平台嵌入与微信登录相关
 *  - waosUpdater: 自动更新（electron-updater）
 *
 * 自动更新仅在打包模式下可用（开发模式 require 会成功但 IPC 返回降级响应）。
 */
const { contextBridge, ipcRenderer } = require('electron')

// 探测 electron-updater 是否已安装（开发模式也会成功 require）
let updaterAvailable = false
try {
  require('electron-updater')
  updaterAvailable = true
} catch {
  updaterAvailable = false
}

contextBridge.exposeInMainWorld('waosDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,

  // ClawBot 微信登录
  loginPlatform: (model, loginUrl) => ipcRenderer.invoke('login-platform', { model, loginUrl }),
  closeLoginWindow: () => ipcRenderer.send('close-login-window'),

  // === 路线B: UI Actuation Layer ===

  // 创建平台 BrowserView (嵌入微信/抖音/视频号网页版)
  createPlatformView: (platform) => ipcRenderer.invoke('create-platform-view', { platform }),

  // 销毁平台视图
  destroyPlatformView: (platform) => ipcRenderer.invoke('destroy-platform-view', { platform }),

  // 更新 BrowserView 边界（前端容器位置变化时调用）
  updateViewBounds: (platform, bounds) => ipcRenderer.invoke('update-view-bounds', { platform, bounds }),

  // 显示/隐藏平台
  showPlatformView: (platform, visible) => ipcRenderer.invoke('show-platform-view', { platform, visible }),

  // 向平台发送消息 (经过沙箱: 节流+安全+重试)
  sendToPlatform: (platform, text) => ipcRenderer.invoke('send-to-platform', { platform, text }),

  // 读取平台消息
  readPlatformMessages: (platform) => ipcRenderer.invoke('read-platform-messages', { platform }),

  // 读取评论 (截流)
  readPlatformComments: (platform) => ipcRenderer.invoke('read-platform-comments', { platform }),

  // 截流私信 (点击用户私信按钮)
  clickDM: (platform, userIndex) => ipcRenderer.invoke('click-dm', { platform, userIndex }),

  // UI 自愈 (重新检测 DOM 选择器)
  selfHeal: (platform) => ipcRenderer.invoke('self-heal', { platform }),

  // 获取沙箱状态
  sandboxStatus: (platform) => ipcRenderer.invoke('sandbox-status', { platform }),
})

// ─── 自动更新 API（waosUpdater）──────────────────────────────
// 渲染进程通过 window.waosUpdater?.isAvailable 检测是否可用。
// 所有 invoke 都在主进程 try-catch，前端只需处理返回值。
contextBridge.exposeInMainWorld('waosUpdater', {
  // electron-updater 模块是否已安装（不代表处于生产模式，需配合 IPC 返回的 reason 判断）
  isAvailable: updaterAvailable,

  // 手动检查更新 → 返回 { available, info?, currentVersion?, reason?, error? }
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // 下载更新 → 触发主进程 download-progress 事件
  downloadUpdate: () => ipcRenderer.invoke('download-update'),

  // 退出应用并安装（下载完成后调用）
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // 获取当前版本 → { version, isPackaged }
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 监听主进程推送的"发现新版本"事件
  onUpdateAvailable: (cb) => {
    const handler = (_, info) => cb(info)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },

  // 监听主进程推送的"下载完成"事件
  onUpdateDownloaded: (cb) => {
    const handler = (_, info) => cb(info)
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },

  // 监听下载进度（用于进度条）
  onUpdateDownloadProgress: (cb) => {
    const handler = (_, progress) => cb(progress)
    ipcRenderer.on('update-download-progress', handler)
    return () => ipcRenderer.removeListener('update-download-progress', handler)
  },
})

