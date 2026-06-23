/**
 * WAOS Desktop Client — Electron Main Process
 *
 * 启动流程:
 *  1. 启动内置 WebSocket mini-service (port 3003)
 *  2. 启动 Next.js (dev: next dev -p 3000 / prod: standalone server)
 *  3. 等待 Next.js 就绪
 *  4. 创建 BrowserWindow 加载 http://localhost:3000
 *
 * 生产模式: 桌面客户端作为独立应用运行，无需浏览器。
 */

const { app, BrowserWindow, shell, Menu, ipcMain, session } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')
const net = require('net')

const NEXT_PORT = 3000
const STREAM_PORT = 3003
const isDev = !app.isPackaged
const isMac = process.platform === 'darwin'

let mainWindow = null
let nextProcess = null
let streamProcess = null

// AUDIT-REL Sprint 4-1: 崩溃恢复 + crash.log ──────────────────────────────
// 标记应用是否正在主动退出（用于区分 Next.js 子进程是"被我们 kill"还是"自己崩溃"）
app.isQuitting = false

// 崩溃计数窗口：60 秒内崩溃超过 3 次则不再 relaunch，避免无限重启循环
let crashCounter = 0
let crashWindowStart = Date.now()
const CRASH_WINDOW_MS = 60 * 1000
const CRASH_MAX_IN_WINDOW = 3

/**
 * 写入 crash.log 到 userData 目录（追加模式）
 * 格式：[ISO 时间] 错误消息 / 堆栈 / 上下文 JSON
 */
function writeCrashLog(error, context) {
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log')
    const errObj = error instanceof Error ? error : new Error(String(error))
    const entry = `[${new Date().toISOString()}] ${errObj.message}\n${errObj.stack || ''}\nContext: ${JSON.stringify(context || {})}\n---\n`
    fs.appendFileSync(logPath, entry, { encoding: 'utf8' })
  } catch (err) {
    console.error('[CrashLog] 写入失败:', err?.message || err)
  }
}

// ─── 自动更新（仅生产模式启用）──────────────────────────────
// 使用 electron-updater 从 GitHub Releases 拉取 latest.yml 比对版本。
// 开发模式（!app.isPackaged）下 autoUpdater 保持 null，所有 IPC 返回降级响应。
let autoUpdater = null
let updaterInterval = null  // AUDIT-SYS: 跟踪定时器，退出时清理避免内存泄漏
if (!isDev) {
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = false           // 不自动下载，提示用户后再下载
    autoUpdater.autoInstallOnAppQuit = true    // 退出时自动安装已下载的更新
    autoUpdater.allowDowngrade = false
    autoUpdater.allowPrerelease = false

    // 发现新版本 → 通知渲染进程
    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] 发现新版本:', info?.version)
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-available', info)
        }
      } catch (err) {
        console.error('[Updater] 发送 update-available 失败:', err.message)
      }
    })

    // 没有新版本（仅供日志）
    autoUpdater.on('update-not-available', (info) => {
      console.log('[Updater] 当前已是最新版本:', info?.version || app.getVersion())
    })

    // 下载进度 → 通知渲染进程（用于进度条）
    autoUpdater.on('download-progress', (progress) => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-download-progress', {
            percent: progress?.percent || 0,
            transferred: progress?.transferred || 0,
            total: progress?.total || 0,
            bytesPerSecond: progress?.bytesPerSecond || 0,
          })
        }
      } catch {
        /* noop */
      }
    })

    // 下载完成 → 通知渲染进程
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Updater] 新版本已下载:', info?.version)
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-downloaded', info)
        }
      } catch (err) {
        console.error('[Updater] 发送 update-downloaded 失败:', err.message)
      }
    })

    autoUpdater.on('error', (err) => {
      console.error('[Updater] 错误:', err?.message || err)
    })

    console.log('[Updater] electron-updater 已加载，当前版本:', app.getVersion())
  } catch (err) {
    console.warn('[Updater] electron-updater 未安装，跳过自动更新:', err.message)
    autoUpdater = null
  }
}

// ─── 检查端口是否可用 ──────────────────────────────────────
function isPortTaken(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
    tester.once('error', () => resolve(true))
    tester.once('listening', () => {
      tester.close()
      resolve(false)
    })
    tester.listen(port)
  })
}

function waitForServer(url, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 302) {
          resolve()
        } else {
          retry()
        }
      }).on('error', () => retry())
    }
    const retry = () => {
      if (Date.now() - start > timeout) {
        reject(new Error(`Timeout waiting for ${url}`))
      } else {
        setTimeout(check, 1000)
      }
    }
    check()
  })
}

// ─── 启动 WebSocket mini-service ───────────────────────────
async function startStreamService() {
  const taken = await isPortTaken(STREAM_PORT)
  if (taken) {
    console.log(`[WAOS-Desktop] Port ${STREAM_PORT} already in use, skipping stream service start`)
    return
  }

  // 生产模式：内联启动 socket.io（不依赖外部 mini-service，避免 bun 依赖）
  if (!isDev) {
    try {
      const { createServer } = require('http')
      const streamModule = require(path.join(__dirname, 'stream-service.js'))
      streamModule.startStreamServer(STREAM_PORT)
      console.log(`[WAOS-Stream] 内联服务已启动 (port ${STREAM_PORT})`)
      return
    } catch (err) {
      console.error('[WAOS-Stream] 内联启动失败，尝试外部服务:', err.message)
      // 退化到外部服务（如果存在）
    }
  }

  const streamPath = path.join(__dirname, '..', 'mini-services', 'waos-stream')
  console.log(`[WAOS-Desktop] Starting stream service from ${streamPath}`)

  // AUDIT-SYS: 简化 dead code（原 isDev ? 'bun' : 'bun' 两分支完全相同）
  // 外部 stream service 仅在开发模式触发（生产模式走内联 stream-service.js）
  const cmd = 'bun'
  const args = ['run', 'dev']

  streamProcess = spawn(cmd, args, {
    cwd: streamPath,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  streamProcess.stdout?.on('data', (data) => {
    console.log(`[WAOS-Stream] ${data.toString().trim()}`)
  })
  streamProcess.stderr?.on('data', (data) => {
    console.error(`[WAOS-Stream] ${data.toString().trim()}`)
  })

  streamProcess.on('error', (err) => {
    console.error('[WAOS-Stream] Failed to start:', err.message)
    console.error('[WAOS-Stream] Make sure bun is installed: https://bun.sh')
  })
}

// ─── 启动 Next.js ──────────────────────────────────────────
async function startNextServer() {
  const taken = await isPortTaken(NEXT_PORT)
  if (taken) {
    console.log(`[WAOS-Desktop] Port ${NEXT_PORT} already in use, assuming Next.js is running externally`)
    return
  }

  const projectRoot = path.join(__dirname, '..')
  console.log(`[WAOS-Desktop] Starting Next.js from ${projectRoot} (dev=${isDev})`)

  if (isDev) {
    // 开发模式: next dev
    nextProcess = spawn('bun', ['run', 'dev'], {
      cwd: projectRoot,
      env: { ...process.env, FORCE_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } else {
    // 生产模式: 用 standalone server（不依赖 bun，纯 node 运行）
    const standalonePath = path.join(projectRoot, '.next', 'standalone')
    // Next.js standalone 可能输出到 <projectName> 子目录，自动探测
    let standaloneServer = path.join(standalonePath, 'server.js')
    let serverCwd = standalonePath
    if (!fs.existsSync(standaloneServer)) {
      // 查找子目录中的 server.js
      try {
        const entries = fs.readdirSync(standalonePath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const candidate = path.join(standalonePath, entry.name, 'server.js')
            if (fs.existsSync(candidate)) {
              standaloneServer = candidate
              serverCwd = path.join(standalonePath, entry.name)
              console.log(`[WAOS-Desktop] Found server.js in subdir: ${entry.name}`)
              break
            }
          }
        }
      } catch (e) {
        console.error('[WAOS-Desktop] Error scanning standalone dir:', e.message)
      }
    }
    console.log(`[WAOS-Desktop] Standalone path: ${standalonePath}`)
    console.log(`[WAOS-Desktop] server.js exists: ${fs.existsSync(standaloneServer)}`)

    if (fs.existsSync(standaloneServer)) {
      // ✅ 正常路径：node server.js（Windows/Mac/Linux 都有 node）
      nextProcess = spawn(process.execPath, ['server.js'], {
        cwd: serverCwd,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(NEXT_PORT),
          HOSTNAME: '0.0.0.0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      console.log(`[WAOS-Desktop] Next.js standalone 已启动 (PID: ${nextProcess.pid})`)
    } else {
      // ❌ standalone 不存在：这是严重错误，显示对话框告知用户
      console.error('[WAOS-Desktop] ❌ standalone server.js 不存在！打包可能不完整。')
      console.error(`[WAOS-Desktop] 预期路径: ${standaloneServer}`)
      // 显示错误对话框（Electron 原生 dialog）
      try {
        const { dialog } = require('electron')
        dialog.showErrorBox(
          '旺财启动失败',
          `打包文件不完整，缺少 server.js。\n\n预期路径: ${standaloneServer}\n\n请重新安装或联系技术支持。`
        )
      } catch (_) {}
      app.quit()
      return
    }
  }

  nextProcess.stdout?.on('data', (data) => {
    console.log(`[Next.js] ${data.toString().trim()}`)
  })
  nextProcess.stderr?.on('data', (data) => {
    console.error(`[Next.js] ${data.toString().trim()}`)
  })

  nextProcess.on('error', (err) => {
    console.error('[Next.js] Failed to start:', err.message)
  })

  // AUDIT-REL Sprint 4-1: Next.js 子进程崩溃监听
  // exit code !== 0 且非主动退出：5 秒后自动重启，并写入 crash.log
  nextProcess.on('exit', (code) => {
    if (app.isQuitting) return
    if (code === 0) return
    console.error(`[WAOS-Desktop] Next.js 异常退出(code=${code}), 5 秒后重启...`)
    writeCrashLog(new Error(`Next.js child process exit code ${code}`), {
      pid: nextProcess?.pid,
      port: NEXT_PORT,
      isDev,
    })
    setTimeout(() => {
      if (app.isQuitting) return
      startNextServer().catch((e) => {
        console.error('[WAOS-Desktop] Next.js 重启失败:', e?.message || e)
      })
    }, 5000)
  })
}

// ─── 创建主窗口 ────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    title: '旺财 · AI 私域营销助手',
    backgroundColor: '#1a1a1a',
    show: true,  // 启动时立即显示加载页面
    autoHideMenuBar: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,  // AUDIT: 沙箱模式，渲染进程无 Node.js 访问
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js'),  // 注入 waosDesktop + waosUpdater API
    },
    icon: path.join(__dirname, '..', 'public', 'wangcai-logo.png'),
  })

  // 加载 Next.js
  mainWindow.loadURL(`http://localhost:${NEXT_PORT}`)

  // 就绪后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // 外链用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── 应用菜单 ──────────────────────────────────────────────
function createMenu() {
  const template = [
    ...(isMac ? [{
      label: 'WAOS',
      submenu: [
        { role: 'about', label: '关于 WAOS' },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 WAOS' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出 WAOS' },
      ],
    }] : []),
    {
      label: '文件',
      submenu: [
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front', label: '前置全部窗口' }] : [{ role: 'close', label: '关闭' }]),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── App 生命周期 ──────────────────────────────────────────
app.whenReady().then(async () => {
  console.log('[WAOS-Desktop] App ready, starting services...')

  // ─── PII 加密密钥管理（AUDIT Sprint 1）──────────────────────────
  // 优先用 Electron safeStorage（系统级加密存储），降级到首次生成
  try {
    const { safeStorage } = require('electron')
    const keyStorePath = path.join(app.getPath('userData'), 'waos-key.enc')

    let masterKeyHex = null
    if (fs.existsSync(keyStorePath)) {
      // 读取已存储的加密密钥
      const encryptedKey = fs.readFileSync(keyStorePath)
      if (safeStorage.isEncryptionAvailable()) {
        masterKeyHex = safeStorage.decryptString(encryptedKey)
        console.log('[Crypto] 从 safeStorage 读取主密钥成功')
      }
    }

    if (!masterKeyHex) {
      // 首次启动：生成新密钥并用 safeStorage 加密存储
      masterKeyHex = require('crypto').randomBytes(32).toString('hex')
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(masterKeyHex)
        fs.writeFileSync(keyStorePath, encrypted)
        console.log('[Crypto] 新主密钥已生成并存储到 safeStorage')
      } else {
        console.warn('[Crypto] safeStorage 不可用，密钥仅注入环境变量（开发降级）')
      }
    }

    // 注入到 Next.js 子进程环境变量（让 Prisma 中间件能读到）
    process.env.WAOS_ENCRYPTION_KEY = masterKeyHex
    console.log('[Crypto] 主密钥已注入环境变量')
  } catch (err) {
    console.error('[Crypto] 密钥管理失败:', err.message)
    // 降级：crypto.ts 会用机器指纹派生
  }

  // 并行启动两个服务
  await Promise.all([
    startStreamService().catch(e => console.error('Stream start failed:', e.message)),
    startNextServer().catch(e => console.error('Next start failed:', e.message)),
  ])

  // 等待 Next.js 就绪
  console.log('[WAOS-Desktop] Waiting for Next.js to be ready...')
  // 先创建窗口显示加载中（不白屏等待）
  createWindow()
  if (mainWindow) {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a1a;color:#e0e0e0;font-family:sans-serif;">
      <div style="text-align:center">
      <div style="font-size:48px;margin-bottom:16px">🐕</div>
      <div style="font-size:18px;font-weight:600;margin-bottom:8px">旺财启动中...</div>
      <div style="font-size:12px;color:#888">正在加载 AI 销售助手，请稍候</div>
      <div style="margin-top:20px;width:200px;height:3px;background:#333;border-radius:2px;overflow:hidden">
      <div style="width:100%;height:100%;background:#10b981;animation:pulse 1.5s ease-in-out infinite"></div>
      </div>
      <style>@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}</style>
      </div></body></html>
    `)}`)
  }
  try {
    await waitForServer(`http://localhost:${NEXT_PORT}`, 120000)
    console.log('[WAOS-Desktop] Next.js ready!')
    // Next.js 就绪后加载真实页面
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(`http://localhost:${NEXT_PORT}`)
    }
  } catch (e) {
    console.error('[WAOS-Desktop] Next.js failed to start:', e.message)
    // 显示错误页面
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a1a;color:#e0e0e0;font-family:sans-serif;">
        <div style="text-align:center;max-width:400px;padding:20px">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:8px;color:#ef4444">启动失败</div>
        <div style="font-size:12px;color:#888;margin-bottom:16px">${e.message}</div>
        <div style="font-size:11px;color:#666">请尝试：1. 关闭后重新打开 2. 检查端口 3000 是否被占用 3. 联系技术支持</div>
        </div></body></html>
      `)}`)
    }
  }

  createMenu()

  // AUDIT Sprint 4-3: 启动数据库自动备份服务（每24小时，保留7天）
  try {
    const { startScheduledBackup } = require('./standalone-backup.js')
    startScheduledBackup()
  } catch (e) {
    console.warn('[Backup] 备份服务启动失败（Next.js 进程内会另起）:', e?.message || e)
  }

  // AUDIT-REL Sprint 4-1: 启动时检测 crash.log，提示用户"上次异常退出，是否发送报告"
  // 延迟 5 秒（等待渲染进程就绪），通过 IPC 通知 mainWindow 弹窗
  try {
    const crashPath = path.join(app.getPath('userData'), 'crash.log')
    if (fs.existsSync(crashPath)) {
      const content = fs.readFileSync(crashPath, 'utf8')
      if (content && content.trim()) {
        const lastLog = content.slice(-2000)
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('crash-detected', { log: lastLog })
            console.log('[WAOS-Desktop] 已通知渲染进程：上次异常退出，crash.log 已读取')
          }
        }, 5000)
      }
    }
  } catch (err) {
    console.warn('[WAOS-Desktop] 读取 crash.log 失败:', err?.message || err)
  }

  // 启动时检查更新（仅生产模式 + electron-updater 已加载时）
  if (autoUpdater) {
    // 延迟 3 秒检查，避免与 Next.js 初始化抢资源
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.error('[Updater] 启动时检查更新失败:', err.message)
      })
    }, 3000)

    // 每 4 小时检查一次
    updaterInterval = setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 4 * 60 * 60 * 1000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // 清理子进程
  if (nextProcess) {
    nextProcess.kill()
    nextProcess = null
  }
  if (streamProcess) {
    streamProcess.kill()
    streamProcess = null
  }
  if (!isMac) {
    app.quit()
  }
})

app.on('before-quit', () => {
  // AUDIT-REL Sprint 4-1: 标记主动退出，避免触发 Next.js 子进程 exit handler 误重启
  app.isQuitting = true
  // AUDIT-SYS: 清理 autoUpdater 定时器，避免内存泄漏
  if (updaterInterval) {
    clearInterval(updaterInterval)
    updaterInterval = null
  }
  // AUDIT-SYS: 销毁所有 BrowserView，避免 webContents 泄漏
  try {
    uiActuation.destroyAllViews()
  } catch (err) {
    console.error('[WAOS-Desktop] 销毁 BrowserView 失败:', err.message)
  }
  // 清理子进程（使用 SIGTERM，Windows 下回退到 taskkill）
  if (nextProcess) {
    try { nextProcess.kill() } catch (_) { /* noop */ }
    nextProcess = null
  }
  if (streamProcess) {
    try { streamProcess.kill() } catch (_) { /* noop */ }
    streamProcess = null
  }
})

process.on('exit', () => {
  if (nextProcess) nextProcess.kill()
  if (streamProcess) streamProcess.kill()
})

process.on('SIGTERM', () => {
  if (nextProcess) nextProcess.kill()
  if (streamProcess) streamProcess.kill()
  app.quit()
})

// AUDIT-SEC-REL: 全局未捕获异常处理
// Node.js 16+ 默认 unhandledRejection 会终止进程，导致 Electron 闪退。
// 这里捕获后记录日志，避免单次 Promise 失败拖垮整个应用。
process.on('unhandledRejection', (reason, promise) => {
  console.error('[WAOS-Desktop] 未处理的 Promise rejection:', reason)
  // 不退出进程，仅记录；上层业务逻辑应有自己的 try-catch
})

process.on('uncaughtException', (err) => {
  console.error('[WAOS-Desktop] 未捕获的同步异常:', err?.stack || err)

  // AUDIT-REL Sprint 4-1: 写入 crash.log（时间 + 错误堆栈 + 上下文）
  writeCrashLog(err, {
    pid: process.pid,
    uptime: process.uptime(),
    kind: 'uncaughtException',
  })

  // 通知渲染进程（保留原行为：上层业务逻辑自己决定是否提示用户）
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app-error', {
        type: 'uncaughtException',
        message: err?.message || String(err),
        stack: err?.stack,
      })
    }
  } catch { /* noop */ }

  // AUDIT-REL Sprint 4-1: 主进程崩溃自动 relaunch + quit
  // 防循环保护：60 秒窗口内崩溃次数 >3 则不再 relaunch，直接 exit(1)
  const now = Date.now()
  if (now - crashWindowStart > CRASH_WINDOW_MS) {
    crashWindowStart = now
    crashCounter = 0
  }
  crashCounter++
  if (crashCounter <= CRASH_MAX_IN_WINDOW) {
    console.error(`[WAOS-Desktop] 崩溃计数 ${crashCounter}/${CRASH_MAX_IN_WINDOW}，准备 relaunch...`)
    try { app.relaunch() } catch (_) { /* noop */ }
    try { app.quit() } catch (_) { /* noop */ }
  } else {
    console.error('[WAOS-Desktop] 短时间崩溃次数过多，跳过 relaunch 避免循环，直接退出')
    try { app.exit(1) } catch (_) { process.exit(1) }
  }
})

// AUDIT-SEC-REL: GPU 进程崩溃自动恢复
app.on('gpu-process-crashed', (event) => {
  console.error('[WAOS-Desktop] GPU 进程崩溃:', event)
  // Electron 默认会重启 GPU 进程，这里仅记录
})

app.on('render-process-gone', (event, webContents, details) => {
  console.error('[WAOS-Desktop] 渲染进程退出:', details?.reason, details)
  // 主窗口渲染进程崩溃 → 重启窗口（保留 Next.js / stream 服务）
  if (webContents === mainWindow?.webContents) {
    console.log('[WAOS-Desktop] 主窗口渲染进程崩溃，1 秒后重建窗口...')
    setTimeout(() => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.close()
        }
        mainWindow = null
        createWindow()
      } catch (err) {
        console.error('[WAOS-Desktop] 重建窗口失败:', err.message)
      }
    }, 1000)
  }
})

app.on('child-process-gone', (event, details) => {
  console.warn('[WAOS-Desktop] 子进程退出:', details?.type, details?.reason, details?.exitCode)
})

// ─── AI 大脑: 平台登录窗口 + 自动抓取 Cookie ──────────────────
// 平台域名映射
const PLATFORM_DOMAINS = {
  doubao: 'www.doubao.com',
  qianwen: 'qwen.aliyun.com',
  kimi: 'kimi.moonshot.cn',
  zhipu: 'chatglm.cn',
}

let loginWindow = null

// 登录窗口关闭后，从 session 读取该域名的所有 Cookie
async function extractCookies(domain) {
  try {
    const cookies = await session.defaultSession.cookies.get({ domain })
    // 拼接成 "name=value; name=value" 格式
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
    return cookieStr
  } catch (err) {
    console.error('[WAOS-Desktop] 提取 Cookie 失败:', err)
    return ''
  }
}

// 检测登录状态（访问首页看是否重定向到登录后的页面）
async function checkLoginStatus(model, loginUrl) {
  const domain = PLATFORM_DOMAINS[model]
  if (!domain) return false

  try {
    const cookies = await session.defaultSession.cookies.get({ domain })
    // 如果有 sessionid 或 token 类 cookie，认为已登录
    const hasAuth = cookies.some(c =>
      ['sessionid', 'sid_guard', 'kimi-auth', 'chatglm_token', 'tongyi_sso_ticket'].includes(c.name)
    )
    return hasAuth
  } catch {
    return false
  }
}

// IPC: 打开平台登录窗口
ipcMain.handle('login-platform', async (event, { model, loginUrl }) => {
  // AUDIT-SYS: 校验 loginUrl 协议白名单，防止 file:// / javascript: 等危险协议
  const ALLOWED_PROTOCOLS = ['https:', 'http:']
  const ALLOWED_DOMAINS = ['www.doubao.com', 'doubao.com', 'qwen.aliyun.com', 'aliyun.com', 'kimi.moonshot.cn', 'moonshot.cn', 'chatglm.cn', 'zhipuai.cn']
  try {
    const parsed = new URL(loginUrl)
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return { cookie: '', valid: false, error: `不允许的协议: ${parsed.protocol}` }
    }
    // 开发环境允许 localhost
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    if (!isLocalhost && !ALLOWED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
      return { cookie: '', valid: false, error: `不允许的域名: ${parsed.hostname}` }
    }
  } catch (err) {
    return { cookie: '', valid: false, error: `loginUrl 格式无效: ${err.message}` }
  }

  console.log(`[WAOS-Desktop] 打开 ${model} 登录窗口: ${loginUrl}`)

  return new Promise((resolve) => {
    // 如果已有登录窗口，先关闭
    if (loginWindow) {
      loginWindow.close()
      loginWindow = null
    }

    loginWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      parent: mainWindow,
      modal: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: `persist:${model}`,  // 每个平台独立 session，Cookie 隔离
      },
      title: `${model} 登录 — WAOS AI 大脑`,
    })

    loginWindow.loadURL(loginUrl)

    // 监听导航事件，检测登录成功
    let checkInterval = null
    let resolved = false

    const checkLogin = async () => {
      if (resolved) return
      const loggedIn = await checkLoginStatus(model, loginUrl)
      if (loggedIn) {
        resolved = true
        clearInterval(checkInterval)
        // 等待 2 秒让所有 Cookie 写入完成
        setTimeout(async () => {
          const cookie = await extractCookies(PLATFORM_DOMAINS[model])
          console.log(`[WAOS-Desktop] ${model} 登录成功，提取到 ${cookie.length} 字符 Cookie`)
          if (loginWindow) {
            loginWindow.close()
            loginWindow = null
          }
          resolve({ cookie, valid: cookie.length > 50 })
        }, 2000)
      }
    }

    // 每 2 秒检测一次登录状态
    checkInterval = setInterval(checkLogin, 2000)

    // 用户手动关闭窗口
    loginWindow.on('closed', async () => {
      loginWindow = null
      clearInterval(checkInterval)
      if (!resolved) {
        // 窗口关闭时也尝试提取 Cookie（可能已登录但没检测到）
        const cookie = await extractCookies(PLATFORM_DOMAINS[model])
        resolved = true
        resolve({ cookie, valid: cookie.length > 50 })
      }
    })

    // 超时 5 分钟
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        clearInterval(checkInterval)
        if (loginWindow) {
          loginWindow.close()
          loginWindow = null
        }
        resolve({ cookie: '', valid: false, error: '登录超时' })
      }
    }, 300000)
  })
})

// IPC: 关闭登录窗口
ipcMain.on('close-login-window', () => {
  if (loginWindow) {
    loginWindow.close()
    loginWindow = null
  }
})

// ─── 路线B: UI Actuation Layer (BrowserView 平台嵌入) ──────────────
const uiActuation = require('./ui-actuation')
const sandbox = require('./sandbox')

// IPC: 创建平台 BrowserView
ipcMain.handle('create-platform-view', async (event, { platform }) => {
  if (!mainWindow) return { success: false, error: '主窗口未创建' }
  const view = uiActuation.createPlatformView(mainWindow, platform)
  return { success: !!view, platform }
})

// IPC: 销毁平台 BrowserView
ipcMain.handle('destroy-platform-view', async (event, { platform }) => {
  uiActuation.destroyPlatformView(platform)
  return { success: true }
})

// IPC: 更新 BrowserView 边界（前端容器位置变化时调用）
ipcMain.handle('update-view-bounds', async (event, { platform, bounds }) => {
  uiActuation.resizeView(platform, bounds)
  return { success: true }
})

// IPC: 显示/隐藏平台
ipcMain.handle('show-platform-view', async (event, { platform, visible }) => {
  uiActuation.showView(platform, visible)
  return { success: true }
})

// IPC: 向平台发送消息 (经过沙箱)
ipcMain.handle('send-to-platform', async (event, { platform, text }) => {
  // 1. 行为漂移检测
  const anomaly = sandbox.detectBehaviorAnomaly(platform)
  if (anomaly.anomaly) {
    sandbox.forceCooldown(platform, anomaly.cooldownMs)
    return { success: false, error: `行为异常: ${anomaly.reason}`, cooldown: anomaly.cooldownMs }
  }

  // 2. 冷却检查
  if (sandbox.isInCooldown(platform)) {
    return { success: false, error: '平台冷却中' }
  }

  // 3. 通过沙箱执行
  try {
    const result = await sandbox.enqueue({
      platform,
      validate: () => {
        if (!text || text.length > 500) return { valid: false, reason: '消息为空或过长' }
        if (/支付宝|淘宝|拼多多|5折|立减/.test(text)) return { valid: false, reason: '安全护盾拦截' }
        return { valid: true }
      },
      execute: async () => {
        sandbox.recordBehavior(platform)
        return await uiActuation.sendToPlatform(platform, text)
      },
    })
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// IPC: 读取平台消息
ipcMain.handle('read-platform-messages', async (event, { platform }) => {
  return await uiActuation.readMessages(platform)
})

// IPC: 读取评论 (截流)
ipcMain.handle('read-platform-comments', async (event, { platform }) => {
  return await uiActuation.readComments(platform)
})

// IPC: 截流私信
ipcMain.handle('click-dm', async (event, { platform, userIndex }) => {
  return await uiActuation.clickDM(platform, userIndex)
})

// IPC: UI 自愈
ipcMain.handle('self-heal', async (event, { platform }) => {
  return await uiActuation.selfHealSelectors(platform)
})

// IPC: 获取沙箱状态
ipcMain.handle('sandbox-status', async (event, { platform }) => {
  const rateCheck = sandbox.checkRateLimit(platform)
  const anomaly = sandbox.detectBehaviorAnomaly(platform)
  const cooldown = sandbox.isInCooldown(platform)
  return {
    platform,
    rateLimit: rateCheck,
    anomaly,
    inCooldown: cooldown,
    limits: sandbox.RATE_LIMITS[platform],
  }
})

// ─── 自动更新 IPC ──────────────────────────────────────────
// 渲染进程通过 window.waosUpdater 调用，所有 handler 都加 try-catch。
// 开发模式（autoUpdater === null）下返回降级响应，便于前端 UI 兜底。

// IPC: 手动检查更新
ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) {
    return { available: false, reason: '非生产模式或 electron-updater 未加载' }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    const updateInfo = result?.updateInfo || null
    return {
      available: !!updateInfo,
      info: updateInfo,
      currentVersion: app.getVersion(),
    }
  } catch (err) {
    return { available: false, error: err?.message || String(err) }
  }
})

// IPC: 下载更新（触发后通过 download-progress 事件推送进度）
ipcMain.handle('download-update', async () => {
  if (!autoUpdater) {
    return { success: false, reason: '非生产模式或 electron-updater 未加载' }
  }
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  }
})

// IPC: 安装更新并重启（quitAndInstall 会关闭应用并启动安装程序）
ipcMain.handle('install-update', async () => {
  if (!autoUpdater) {
    return { success: false, reason: '非生产模式' }
  }
  try {
    autoUpdater.quitAndInstall(true, true)
    return { success: true }
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  }
})

// IPC: 获取当前版本
ipcMain.handle('get-app-version', async () => {
  return { version: app.getVersion(), isPackaged: app.isPackaged }
})

