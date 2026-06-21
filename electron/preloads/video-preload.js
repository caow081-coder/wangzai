/**
 * 旺财视频号 preload — 注入到视频号网页版
 *
 * 功能：
 *   1. 监听视频号评论区 DOM 变化，提取评论
 *   2. 注入"旺财一键回复"按钮到每条评论
 *   3. 拦截私信发送，加防封延迟（每条 2-5s 随机）
 *   4. 暴露 window.wangcaiVideo API 给渲染进程
 *
 * 兼容旧 API：window.__wangcai / __wangcaiEvent / __wangcaiSetCallback
 */
const { contextBridge, ipcRenderer } = require('electron')

// ============== 配置 ==============
const CONFIG = {
  platform: 'video',
  version: '1.1.0',
  // 评论容器 DOM 选择器（视频号网页版，会随版本变化，多套兜底）
  commentSelectors: [
    '.comment-item',
    '[class*="CommentItem"]',
    'div[class*="comment"][class*="item"]',
    '[class*="FeedComment"] [class*="item"]',
  ],
  // 评论内容子选择器
  contentSelectors: [
    '.comment-content',
    '[class*="Content"]',
    'span[class*="content"]',
    '[class*="text"]',
  ],
  // 用户名子选择器
  usernameSelectors: [
    '.comment-username',
    '[class*="UserName"]',
    '[class*="Nickname"]',
    '[class*="Author"]',
  ],
  // 评论 ID 属性名（兜底用 时间戳+索引 生成）
  idAttr: 'data-wangcai-comment-id',
  // 已注入按钮的标记属性
  injectedAttr: 'data-wangcai-injected',
  // 防封延迟范围（毫秒）：私信每条间隔 2-5s
  antiBanDelayMin: 2000,
  antiBanDelayMax: 5000,
  // DOM 观察节流间隔
  observerThrottleMs: 800,
  // 路由变化兜底扫描间隔（视频号 SPA）
  routeWatchIntervalMs: 1500,
  // 路由切换后延迟重扫
  routeRescanDelayMs: 1000,
}

// ============== 内部状态 ==============
const state = {
  // 评论回调（向渲染进程 / 主进程上报事件）
  commentCallback: null,
  // 私信发送钩子（可被外部覆盖，返回 true 表示允许发送）
  dmSendHook: null,
  // 已提取的评论缓存（按 id 去重）
  commentsCache: new Map(),
  // MutationObserver 节流时间戳
  lastObserveTs: 0,
  // 是否已启动监听
  started: false,
  // MutationObserver 实例
  observer: null,
  // 路由监听定时器
  routeTimer: null,
  // 上一次 URL（用于路由切换检测）
  lastUrl: '',
}

// ============== 工具函数 ==============

/** 随机整数 [min, max] */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 安全 querySelector：尝试多个选择器，返回第一个命中 */
function safeQuery(root, selectors) {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel)
      if (el) return el
    } catch (_) {
      /* 选择器语法异常忽略 */
    }
  }
  return null
}

/** 生成稳定评论 ID（优先复用 DOM 上已写入的） */
function genCommentId(el, index) {
  const existing = el.getAttribute(CONFIG.idAttr)
  if (existing) return existing
  const text = (el.textContent || '').slice(0, 24).replace(/\s+/g, '')
  const id = `vc_${index}_${text}_${Date.now().toString(36)}`
  el.setAttribute(CONFIG.idAttr, id)
  return id
}

/**
 * 意向分简易计算（与 connector.ts 算法对齐，避免 IPC 往返）
 *  - 多少钱/价格/优惠/便宜  → +30
 *  - 想买/换车/试驾/到店    → +25
 *  - 好看/喜欢/关注        → +10
 *  - 太贵/不值/算了        → -10
 *  - 基础分 50，clamp 0-100
 */
function calcIntentLocal(content) {
  let score = 50
  const reasons = []
  if (/多少钱|价格|优惠|便宜/.test(content)) {
    score += 30
    reasons.push('询价+30')
  }
  if (/想买|换车|试驾|到店/.test(content)) {
    score += 25
    reasons.push('购车意向+25')
  }
  if (/好看|喜欢|关注/.test(content)) {
    score += 10
    reasons.push('好感+10')
  }
  if (/太贵|不值|算了/.test(content)) {
    score -= 10
    reasons.push('负面-10')
  }
  score = Math.max(0, Math.min(100, score))
  return {
    score,
    reason: reasons.length
      ? reasons.join('|') + '|基础50'
      : '基础意向分(无明确关键词)',
  }
}

/** 从 URL pathname 提取 videoId */
function extractVideoId() {
  const m = location.pathname.match(/([\w-]{6,})(?:\?|$|\/)/)
  return m ? m[1] : 'unknown'
}

/** 提取单条评论 DOM → 评论对象 */
function extractComment(el, index) {
  const contentEl = safeQuery(el, CONFIG.contentSelectors) || el
  const usernameEl = safeQuery(el, CONFIG.usernameSelectors)
  const content = (contentEl?.textContent || '').trim()
  const userName = (usernameEl?.textContent || '').trim() || '匿名用户'
  const id = genCommentId(el, index)
  const { score, reason } = calcIntentLocal(content)
  return {
    id,
    userId: el.getAttribute('data-user-id') || `u_${id}`,
    userName,
    avatar: userName.slice(0, 1) || '?',
    content,
    videoId: extractVideoId(),
    videoTitle: document.title || '',
    videoPlayCount: 0, // DOM 拿不到，由主进程补全
    videoLikeCount: 0,
    intentScore: score,
    intentReason: reason,
    replyStatus: 'pending',
    timestamp: Date.now(),
  }
}

/** 注入"旺财一键回复"按钮到评论容器 */
function injectReplyButton(commentEl, commentId) {
  if (commentEl.getAttribute(CONFIG.injectedAttr)) return
  commentEl.setAttribute(CONFIG.injectedAttr, '1')
  try {
    const btn = document.createElement('button')
    btn.textContent = '旺财一键回复'
    btn.setAttribute('data-wangcai-btn', commentId)
    // 内联样式：翠绿色，区别于视频号原 UI
    btn.style.cssText = [
      'margin-left:8px',
      'padding:2px 8px',
      'font-size:12px',
      'line-height:18px',
      'color:#fff',
      'background:#10b981',
      'border:none',
      'border-radius:4px',
      'cursor:pointer',
      'user-select:none',
    ].join(';')
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const comment = state.commentsCache.get(commentId)
      // 上报给渲染进程
      if (state.commentCallback) {
        state.commentCallback({ type: 'reply_click', commentId, comment })
      }
      // 同步发 IPC 给主进程，便于主进程拉 AI 回复
      try {
        ipcRenderer.send('wangcai:video:reply-click', { commentId, comment })
      } catch (_) {
        /* ipcRenderer 不可用时忽略 */
      }
    })
    commentEl.appendChild(btn)
  } catch (err) {
    console.warn('[wangcai-video] 注入按钮失败', err)
  }
}

/** 扫描评论区，提取 + 注入 */
function scanComments() {
  let commentEls = []
  for (const sel of CONFIG.commentSelectors) {
    try {
      const found = document.querySelectorAll(sel)
      if (found && found.length) {
        commentEls = Array.from(found)
        break
      }
    } catch (_) {
      /* 忽略选择器异常 */
    }
  }
  if (!commentEls.length) return

  commentEls.forEach((el, i) => {
    try {
      const comment = extractComment(el, i)
      // 缓存（覆盖旧版本，以新 DOM 为准）
      state.commentsCache.set(comment.id, comment)
      injectReplyButton(el, comment.id)
    } catch (err) {
      console.warn('[wangcai-video] 提取评论失败', err)
    }
  })

  // 上报最新评论列表给渲染进程
  if (state.commentCallback) {
    state.commentCallback({
      type: 'comments_update',
      comments: Array.from(state.commentsCache.values()),
    })
  }
}

/** MutationObserver 节流回调 */
function onDomMutate() {
  const now = Date.now()
  if (now - state.lastObserveTs < CONFIG.observerThrottleMs) return
  state.lastObserveTs = now
  scanComments()
}

/** 启动评论监听 */
function startWatching() {
  if (state.started) return
  state.started = true
  state.lastUrl = location.href
  // 立即扫一次
  scanComments()
  // DOM 变更监听
  try {
    state.observer = new MutationObserver(onDomMutate)
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  } catch (err) {
    console.warn('[wangcai-video] MutationObserver 启动失败', err)
  }
  // 路由切换兜底（视频号 SPA）
  state.routeTimer = setInterval(() => {
    if (location.href !== state.lastUrl) {
      state.lastUrl = location.href
      // 路由切换后延迟重扫
      setTimeout(scanComments, CONFIG.routeRescanDelayMs)
    }
  }, CONFIG.routeWatchIntervalMs)
}

/** 停止监听 */
function stopWatching() {
  if (state.observer) {
    try {
      state.observer.disconnect()
    } catch (_) {
      /* 忽略 */
    }
    state.observer = null
  }
  if (state.routeTimer) {
    clearInterval(state.routeTimer)
    state.routeTimer = null
  }
  state.started = false
}

/**
 * 拦截私信发送：在原 DOM 触发前加防封延迟
 * @returns { ok, delay, message }
 */
async function sendDMWithAntiBan(userId, content) {
  const delay = randInt(CONFIG.antiBanDelayMin, CONFIG.antiBanDelayMax)
  await new Promise((r) => setTimeout(r, delay))
  // 调用钩子（如果设置了），否则只返回成功
  if (typeof state.dmSendHook === 'function') {
    try {
      const hookResult = await state.dmSendHook(userId, content)
      return { ok: !!hookResult, delay, message: '钩子已发送' }
    } catch (err) {
      return { ok: false, delay, message: '钩子异常: ' + err.message }
    }
  }
  return { ok: true, delay, message: '防封延迟后模拟发送成功' }
}

// ============== 暴露 API（window.wangcaiVideo） ==============
contextBridge.exposeInMainWorld('wangcaiVideo', {
  platform: CONFIG.platform,
  version: CONFIG.version,

  /** 启动评论监听 */
  start: () => {
    startWatching()
    return true
  },

  /** 停止监听 */
  stop: () => {
    stopWatching()
    return true
  },

  /** 设置评论回调（接收 comments_update / reply_click 事件） */
  onComment: (cb) => {
    state.commentCallback = cb
  },

  /** 获取当前已缓存的评论列表 */
  getComments: () => Array.from(state.commentsCache.values()),

  /** 主动触发一次扫描 */
  scan: () => {
    scanComments()
    return state.commentsCache.size
  },

  /** 发送私信（带防封延迟） */
  sendDM: (userId, content) => sendDMWithAntiBan(userId, content),

  /** 设置私信发送钩子（覆盖默认模拟行为，由主进程注入真实发送逻辑） */
  setDmSendHook: (fn) => {
    state.dmSendHook = fn
  },

  /** 点赞视频（模拟点击 like 按钮，带防封延迟） */
  likeVideo: async () => {
    await new Promise((r) =>
      setTimeout(r, randInt(800, 1500)),
    )
    try {
      const likeBtn = document.querySelector(
        '[class*="Like"][class*="Button"], [class*="like-btn"], button[aria-label*="赞"]',
      )
      if (likeBtn) {
        likeBtn.click()
        return true
      }
    } catch (_) {
      /* 忽略 */
    }
    return false
  },

  /**
   * 回复评论（在 DOM 内找到输入框填入内容并触发 send）
   * @returns boolean 是否成功
   */
  replyComment: async (commentId, content) => {
    try {
      const commentEl = document.querySelector(
        `[${CONFIG.idAttr}="${commentId}"]`,
      )
      if (!commentEl) return false
      // 找到该评论的回复入口
      const replyEntry = safeQuery(commentEl, [
        '.reply-btn',
        '[class*="Reply"]',
        '[class*="reply"]',
      ])
      if (replyEntry) replyEntry.click()
      await new Promise((r) => setTimeout(r, 300))
      // 找到输入框
      const input = document.querySelector(
        'textarea[class*="Reply"], textarea[class*="Input"], [contenteditable="true"]',
      )
      if (!input) return false
      if (input.tagName === 'TEXTAREA') {
        // React 受控组件需要用原生 setter 触发 onChange
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        )?.set
        nativeSetter?.call(input, content)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      } else {
        input.textContent = content
        input.dispatchEvent(
          new InputEvent('input', { bubbles: true, data: content }),
        )
      }
      await new Promise((r) => setTimeout(r, 200))
      // 点击发送
      const sendBtn = document.querySelector(
        'button[class*="Send"], button[class*="Publish"], [class*="submit"]',
      )
      if (sendBtn) sendBtn.click()
      return true
    } catch (err) {
      console.warn('[wangcai-video] replyComment 失败', err)
      return false
    }
  },
})

// ============== 启动 ==============
// 文档 ready 后自动启动监听
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startWatching)
} else {
  startWatching()
}

// ============== 兼容旧 API ==============
// 保留 __wangcai / __wangcaiEvent / __wangcaiSetCallback，
// 避免老代码引用断裂
contextBridge.exposeInMainWorld('__wangcai', {
  platform: 'video',
  version: CONFIG.version,
})
let legacyCallback = null
contextBridge.exposeInMainWorld('__wangcaiEvent', (data) => {
  if (legacyCallback) legacyCallback(data)
})
contextBridge.exposeInMainWorld('__wangcaiSetCallback', (cb) => {
  legacyCallback = cb
})
