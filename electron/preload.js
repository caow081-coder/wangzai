/**
 * WAOS Desktop — Electron Preload
 *
 * 桌面客户端通过 contextBridge 暴露 API 给渲染进程:
 *  - isDesktop: 检测是否在桌面客户端中运行
 *  - loginPlatform: 打开平台登录窗口，登录后自动抓取 Cookie
 *  - 路线B: UI Actuation Layer (BrowserView 平台嵌入)
 */
const { contextBridge, ipcRenderer } = require('electron')

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

