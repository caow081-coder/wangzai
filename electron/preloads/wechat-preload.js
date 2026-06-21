/**
 * 旺财微信 preload — 注入到微信网页版
 *
 * 功能：
 *   1. 保留原有 __wangcai / __wangcaiEvent / __wangcaiSetCallback 兼容 API
 *   2. 监听朋友圈 feed DOM 变化，提取动态 + 评论
 *   3. 注入"旺财一键回复"按钮到朋友圈每条评论
 *   4. 暴露 window.wangcaiMoments API（start/stop/getPosts/getComments/replyComment/likePost/postMoment）
 *   5. 防封延迟 2-4s（评论回复 / 点赞 / 发朋友圈均带随机间隔）
 */
const { contextBridge } = require('electron')

// ============== 配置 ==============

const CONFIG = {
  platform: 'wechat_moments',
  version: '1.0.0',
  // 朋友圈 feed 容器选择器（微信网页版，会随版本变化，多套兜底）
  postSelectors: [
    '.moment-item',
    '[class*="MomentItem"]',
    '[class*="FeedItem"]',
    'div[class*="moment"][class*="item"]',
    'div[class*="Feed"][class*="Item"]',
  ],
  // 朋友圈正文子选择器
  postContentSelectors: [
    '.moment-text',
    '[class*="Content"]',
    '[class*="Text"]',
    'span[class*="text"]',
  ],
  // 作者名子选择器
  authorSelectors: [
    '.moment-author',
    '[class*="Author"]',
    '[class*="Nickname"]',
    '[class*="UserName"]',
  ],
  // 图片容器选择器
  imageWrapperSelectors: [
    '.moment-images',
    '[class*="Images"]',
    '[class*="ImageList"]',
  ],
  // 评论容器选择器
  commentWrapperSelectors: [
    '.moment-comments',
    '[class*="Comments"]',
    '[class*="CommentList"]',
  ],
  // 单条评论子选择器
  commentItemSelectors: [
    '.comment-item',
    '[class*="CommentItem"]',
    'div[class*="comment"][class*="item"]',
  ],
  // 点赞按钮选择器
  likeButtonSelectors: [
    '.moment-like',
    'button[class*="Like"]',
    'button[aria-label*="赞"]',
    '[class*="Like"][class*="Button"]',
  ],
  // 评论输入框选择器
  commentInputSelectors: [
    'textarea[class*="Comment"]',
    'textarea[class*="Reply"]',
    '[contenteditable="true"]',
    'input[class*="Comment"]',
  ],
  // 发送按钮选择器
  sendButtonSelectors: [
    'button[class*="Send"]',
    'button[class*="Publish"]',
    'button[class*="submit"]',
  ],
  // 防封延迟范围（毫秒）：回复 / 点赞 / 发圈每条 2-4s 随机
  antiBanDelayMin: 2000,
  antiBanDelayMax: 4000,
  // DOM 观察节流间隔
  observerThrottleMs: 800,
  // 路由切换兜底扫描间隔（微信网页版 SPA）
  routeWatchIntervalMs: 1500,
  // 路由切换后延迟重扫
  routeRescanDelayMs: 1000,
  // 已注入按钮的标记属性
  injectedAttr: 'data-wangcai-injected',
  // 朋友圈 ID 属性名
  postIdAttr: 'data-wangcai-post-id',
  // 评论 ID 属性名
  commentIdAttr: 'data-wangcai-comment-id',
}

// ============== 内部状态 ==============

const state = {
  // 朋友圈事件回调（向渲染进程上报）
  callback: null,
  // 已提取的朋友圈缓存（按 id 去重）
  postsCache: new Map(),
  // 已提取的评论缓存（按 id 去重）
  commentsCache: new Map(),
  // MutationObserver 节流时间戳
  lastObserveTs: 0,
  // 是否已启动朋友圈监听
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

/** 异步 sleep */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
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

/** 安全 querySelectorAll：返回第一个命中的列表 */
function safeQueryAll(root, selectors) {
  for (const sel of selectors) {
    try {
      const found = root.querySelectorAll(sel)
      if (found && found.length) return Array.from(found)
    } catch (_) {
      /* 忽略 */
    }
  }
  return []
}

/** 生成稳定 post ID（优先复用 DOM 上已写入的） */
function genPostId(el, index) {
  const existing = el.getAttribute(CONFIG.postIdAttr)
  if (existing) return existing
  const text = (el.textContent || '').slice(0, 24).replace(/\s+/g, '')
  const id = `mp_${index}_${text}_${Date.now().toString(36)}`
  el.setAttribute(CONFIG.postIdAttr, id)
  return id
}

/** 生成稳定 comment ID */
function genCommentId(el, index) {
  const existing = el.getAttribute(CONFIG.commentIdAttr)
  if (existing) return existing
  const text = (el.textContent || '').slice(0, 24).replace(/\s+/g, '')
  const id = `mc_${index}_${text}_${Date.now().toString(36)}`
  el.setAttribute(CONFIG.commentIdAttr, id)
  return id
}

/**
 * 意向分简易计算（与 connector.ts 算法对齐，避免 IPC 往返）
 *  - 多少钱/价格/优惠/便宜/首付/月供 → +30
 *  - 想买/换车/试驾/到店/预定/定金   → +25
 *  - 好看/喜欢/关注/心动/羡慕        → +10
 *  - 太贵/不值/算了/考虑下/再看看    → -10
 *  - 基础分 50，clamp 0-100
 */
function calcIntentLocal(content) {
  let score = 50
  const reasons = []
  if (/多少钱|价格|优惠|便宜|首付|月供/.test(content)) {
    score += 30
    reasons.push('询价+30')
  }
  if (/想买|换车|试驾|到店|预定|定金/.test(content)) {
    score += 25
    reasons.push('购车意向+25')
  }
  if (/好看|喜欢|关注|心动|羡慕/.test(content)) {
    score += 10
    reasons.push('好感+10')
  }
  if (/太贵|不值|算了|考虑下|再看看/.test(content)) {
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

// ============== 朋友圈 DOM 提取 ==============

/** 从 URL 判断当前是否在朋友圈页面 */
function isOnMomentsPage() {
  return /\/moments|\/timeline|朋友圈/.test(location.pathname + location.hash)
}

/** 从 URL 提取 postId（详情页） */
function extractPostIdFromUrl() {
  const m = location.pathname.match(/moments\/([\w-]{4,})/)
  return m ? m[1] : null
}

/** 提取单条朋友圈 DOM → post 对象 */
function extractPost(el, index) {
  const contentEl = safeQuery(el, CONFIG.postContentSelectors) || el
  const authorEl = safeQuery(el, CONFIG.authorSelectors)
  const content = (contentEl?.textContent || '').trim()
  const authorName = (authorEl?.textContent || '').trim() || '匿名用户'
  const id = genPostId(el, index)

  // 提取图片 URL
  const imgWrapper = safeQuery(el, CONFIG.imageWrapperSelectors)
  const images = imgWrapper
    ? Array.from(imgWrapper.querySelectorAll('img'))
        .map((img) => img.src || img.getAttribute('data-src') || '')
        .filter(Boolean)
    : []

  // 提取评论列表
  const commentWrapper = safeQuery(el, CONFIG.commentWrapperSelectors)
  const comments = []
  if (commentWrapper) {
    const commentEls = safeQueryAll(commentWrapper, CONFIG.commentItemSelectors)
    commentEls.forEach((cEl, ci) => {
      const comment = extractComment(cEl, id, ci)
      if (comment) comments.push(comment)
    })
  }

  return {
    id,
    authorId: el.getAttribute('data-author-id') || `author_${id}`,
    authorName,
    authorAvatar: authorName.slice(0, 1) || '?',
    content,
    images,
    likeCount: 0,
    commentCount: comments.length,
    publishedAt: Date.now(),
    isLiked: false,
    isOwn: false,
    comments,
  }
}

/** 提取单条评论 DOM → comment 对象 */
function extractComment(el, postId, index) {
  const text = (el.textContent || '').trim()
  if (!text) return null
  const id = genCommentId(el, index)
  // 简单从文本拆出用户名（格式通常为"用户名：内容"）
  let userName = '匿名用户'
  let content = text
  const m = text.match(/^([^:：]{1,12})[：:]\s*(.+)$/)
  if (m) {
    userName = m[1]
    content = m[2]
  }
  const { score, reason } = calcIntentLocal(content)
  return {
    id,
    postId,
    userId: el.getAttribute('data-user-id') || `u_${id}`,
    userName,
    avatar: userName.slice(0, 1) || '?',
    content,
    intentScore: score,
    intentReason: reason,
    replyStatus: 'pending',
    timestamp: Date.now(),
  }
}

/** 注入"旺财一键回复"按钮到评论 DOM */
function injectReplyButton(commentEl, commentId) {
  if (commentEl.getAttribute(CONFIG.injectedAttr)) return
  commentEl.setAttribute(CONFIG.injectedAttr, '1')
  try {
    const btn = document.createElement('button')
    btn.textContent = '旺财回复'
    btn.setAttribute('data-wangcai-btn', commentId)
    // 内联样式：翠绿色，区别于微信原 UI
    btn.style.cssText = [
      'margin-left:8px',
      'padding:1px 6px',
      'font-size:11px',
      'line-height:16px',
      'color:#fff',
      'background:#10b981',
      'border:none',
      'border-radius:3px',
      'cursor:pointer',
      'user-select:none',
    ].join(';')
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const comment = state.commentsCache.get(commentId)
      if (state.callback) {
        state.callback({ type: 'reply_click', commentId, comment })
      }
    })
    commentEl.appendChild(btn)
  } catch (err) {
    console.warn('[wangcai-moments] 注入按钮失败', err)
  }
}

/** 扫描朋友圈 feed，提取 + 注入 */
function scanMoments() {
  let postEls = []
  for (const sel of CONFIG.postSelectors) {
    try {
      const found = document.querySelectorAll(sel)
      if (found && found.length) {
        postEls = Array.from(found)
        break
      }
    } catch (_) {
      /* 忽略选择器异常 */
    }
  }
  if (!postEls.length) return

  postEls.forEach((el, i) => {
    try {
      const post = extractPost(el, i)
      // 缓存朋友圈
      state.postsCache.set(post.id, post)
      // 缓存评论
      post.comments.forEach((c) => {
        state.commentsCache.set(c.id, c)
      })
      // 对每条评论注入"旺财回复"按钮
      const commentWrapper = safeQuery(el, CONFIG.commentWrapperSelectors)
      if (commentWrapper) {
        const commentEls = safeQueryAll(commentWrapper, CONFIG.commentItemSelectors)
        commentEls.forEach((cEl, ci) => {
          const cid = genCommentId(cEl, ci)
          injectReplyButton(cEl, cid)
        })
      }
    } catch (err) {
      console.warn('[wangcai-moments] 提取朋友圈失败', err)
    }
  })

  // 上报最新列表给渲染进程
  if (state.callback) {
    state.callback({
      type: 'moments_update',
      posts: Array.from(state.postsCache.values()),
      comments: Array.from(state.commentsCache.values()),
    })
  }
}

/** MutationObserver 节流回调 */
function onDomMutate() {
  const now = Date.now()
  if (now - state.lastObserveTs < CONFIG.observerThrottleMs) return
  state.lastObserveTs = now
  scanMoments()
}

/** 启动朋友圈监听 */
function startWatching() {
  if (state.started) return
  state.started = true
  state.lastUrl = location.href
  // 立即扫一次
  scanMoments()
  // DOM 变更监听
  try {
    state.observer = new MutationObserver(onDomMutate)
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  } catch (err) {
    console.warn('[wangcai-moments] MutationObserver 启动失败', err)
  }
  // 路由切换兜底（微信网页版 SPA）
  state.routeTimer = setInterval(() => {
    if (location.href !== state.lastUrl) {
      state.lastUrl = location.href
      // 路由切换后延迟重扫
      setTimeout(scanMoments, CONFIG.routeRescanDelayMs)
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

// ============== 操作函数（带防封延迟）==============

/**
 * 回复评论：找到对应评论 DOM → 触发回复入口 → 填入内容 → 点发送
 * 全流程前加 2-4s 随机延迟防封
 */
async function replyCommentImpl(commentId, content) {
  await sleep(randInt(CONFIG.antiBanDelayMin, CONFIG.antiBanDelayMax))
  try {
    const commentEl = document.querySelector(
      `[${CONFIG.commentIdAttr}="${commentId}"]`,
    )
    if (!commentEl) return { ok: false, message: '评论 DOM 未找到' }

    // 触发回复入口
    const replyEntry = safeQuery(commentEl, [
      '.reply-btn',
      '[class*="Reply"]',
      '[class*="reply"]',
    ])
    if (replyEntry) replyEntry.click()
    await sleep(300)

    // 找到输入框
    const input = safeQuery(document.body, CONFIG.commentInputSelectors)
    if (!input) return { ok: false, message: '输入框未找到' }

    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      // React 受控组件需要用原生 setter 触发 onChange
      const proto =
        input.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
      nativeSetter?.call(input, content)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      input.textContent = content
      input.dispatchEvent(
        new InputEvent('input', { bubbles: true, data: content }),
      )
    }
    await sleep(200)

    // 点击发送
    const sendBtn = safeQuery(document.body, CONFIG.sendButtonSelectors)
    if (sendBtn) sendBtn.click()

    // 同步更新缓存
    const cached = state.commentsCache.get(commentId)
    if (cached) {
      cached.replyStatus = 'replied'
      cached.aiReply = content
    }
    return { ok: true, message: '回复成功' }
  } catch (err) {
    return { ok: false, message: 'replyComment 异常: ' + err.message }
  }
}

/**
 * 点赞朋友圈：找到对应 post DOM → 点击 like 按钮
 * 带 2-4s 随机延迟
 */
async function likePostImpl(postId) {
  await sleep(randInt(CONFIG.antiBanDelayMin, CONFIG.antiBanDelayMax))
  try {
    const postEl = document.querySelector(`[${CONFIG.postIdAttr}="${postId}"]`)
    if (!postEl) return { ok: false, message: '朋友圈 DOM 未找到' }
    const likeBtn = safeQuery(postEl, CONFIG.likeButtonSelectors)
    if (!likeBtn) return { ok: false, message: '点赞按钮未找到' }
    likeBtn.click()
    // 同步缓存
    const cached = state.postsCache.get(postId)
    if (cached) {
      cached.isLiked = true
      cached.likeCount += 1
    }
    return { ok: true, message: '点赞成功' }
  } catch (err) {
    return { ok: false, message: 'likePost 异常: ' + err.message }
  }
}

/**
 * 发朋友圈：找到发布入口 → 填内容 + 图片 URL → 点发表
 * 带 2-4s 随机延迟
 */
async function postMomentImpl(content, images) {
  await sleep(randInt(CONFIG.antiBanDelayMin, CONFIG.antiBanDelayMax))
  try {
    // 找到发朋友圈的输入框（通常在页面顶部）
    const input = safeQuery(document.body, [
      'textarea[class*="Moment"]',
      'textarea[class*="Publish"]',
      'textarea[class*="Composer"]',
      '[contenteditable="true"]',
    ])
    if (!input) return { ok: false, message: '发圈输入框未找到' }

    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      const proto =
        input.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
      nativeSetter?.call(input, content)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      input.textContent = content
      input.dispatchEvent(
        new InputEvent('input', { bubbles: true, data: content }),
      )
    }
    await sleep(300)

    // 图片上传：网页版通常不支持 URL 直接上传，这里只做模拟
    // 实际接入时需根据具体上传组件适配
    if (images && images.length) {
      console.info('[wangcai-moments] 图片上传需要根据具体上传组件适配', images)
    }

    // 点击发表按钮
    const publishBtn = safeQuery(document.body, [
      'button[class*="Publish"]',
      'button[class*="Submit"]',
      'button[class*="Post"]',
      'button[class*="send"]',
    ])
    if (publishBtn) publishBtn.click()
    return { ok: true, message: '发朋友圈成功' }
  } catch (err) {
    return { ok: false, message: 'postMoment 异常: ' + err.message }
  }
}

// ============== 暴露 API（window.wangcaiMoments）==============

contextBridge.exposeInMainWorld('wangcaiMoments', {
  platform: CONFIG.platform,
  version: CONFIG.version,

  /** 启动朋友圈监听 */
  start: () => {
    startWatching()
    return true
  },

  /** 停止监听 */
  stop: () => {
    stopWatching()
    return true
  },

  /** 设置事件回调（接收 moments_update / reply_click 事件） */
  onEvent: (cb) => {
    state.callback = cb
  },

  /** 获取当前已缓存的朋友圈列表 */
  getPosts: () => Array.from(state.postsCache.values()),

  /** 获取当前已缓存的评论列表（可选 postId 过滤） */
  getComments: (postId) => {
    const all = Array.from(state.commentsCache.values())
    return postId ? all.filter((c) => c.postId === postId) : all
  },

  /** 主动触发一次扫描 */
  scan: () => {
    scanMoments()
    return state.postsCache.size
  },

  /** 回复评论（带防封延迟 2-4s） */
  replyComment: (commentId, content) => replyCommentImpl(commentId, content),

  /** 点赞朋友圈（带防封延迟 2-4s） */
  likePost: (postId) => likePostImpl(postId),

  /** 发朋友圈（带防封延迟 2-4s） */
  postMoment: (content, images) => postMomentImpl(content, images || []),

  /** 当前是否在朋友圈页面 */
  isOnMomentsPage: () => isOnMomentsPage(),
})

// ============== 启动 ==============
// 文档 ready 后自动启动朋友圈监听
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startWatching)
} else {
  startWatching()
}

// ============== 兼容旧 API ==============
// 保留 __wangcai / __wangcaiEvent / __wangcaiSetCallback，
// 避免老代码引用断裂
contextBridge.exposeInMainWorld('__wangcai', {
  platform: 'wechat',
  version: CONFIG.version,
})

let legacyCallback = null
contextBridge.exposeInMainWorld('__wangcaiEvent', (data) => {
  if (legacyCallback) legacyCallback(data)
})

contextBridge.exposeInMainWorld('__wangcaiSetCallback', (cb) => {
  legacyCallback = cb
})
