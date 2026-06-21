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

  const streamPath = path.join(__dirname, '..', 'mini-services', 'waos-stream')
  console.log(`[WAOS-Desktop] Starting stream service from ${streamPath}`)

  // 使用 bun 启动（开发环境）或 node（生产环境如果 bun 不可用）
  const cmd = isDev ? 'bun' : 'bun'
  const args = isDev ? ['run', 'dev'] : ['run', 'dev']

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
    // 生产模式: 用 standalone server
    const standalonePath = path.join(projectRoot, '.next', 'standalone')
    if (fs.existsSync(standalonePath)) {
      nextProcess = spawn('node', ['server.js'], {
        cwd: standalonePath,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(NEXT_PORT),
          HOSTNAME: '0.0.0.0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } else {
      // fallback to next start
      nextProcess = spawn('bun', ['run', 'start'], {
        cwd: projectRoot,
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
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
}

// ─── 创建主窗口 ────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    title: '旺财 · AI 私域营销助手',
    backgroundColor: '#f7f9fa',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
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

  // 并行启动两个服务
  await Promise.all([
    startStreamService().catch(e => console.error('Stream start failed:', e.message)),
    startNextServer().catch(e => console.error('Next start failed:', e.message)),
  ])

  // 等待 Next.js 就绪
  try {
    console.log('[WAOS-Desktop] Waiting for Next.js to be ready...')
    await waitForServer(`http://localhost:${NEXT_PORT}`, 120000)
    console.log('[WAOS-Desktop] Next.js ready!')
  } catch (e) {
    console.error('[WAOS-Desktop] Next.js failed to start:', e.message)
    console.error('[WAOS-Desktop] Loading anyway (might show error page)...')
  }

  createWindow()
  createMenu()

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
  if (nextProcess) {
    nextProcess.kill()
  }
  if (streamProcess) {
    streamProcess.kill()
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

