/**
 * 旺财抖音 preload — 注入到抖音网页版 (https://www.douyin.com/)
 *
 * 功能:
 *  1. 监听评论区 DOM 变化, 自动提取评论 + 意向分计算
 *  2. 监听私信会话 DOM, 提取新消息
 *  3. 暴露 window.wangcaiDouyin API:
 *     - start() / stop()
 *     - onComment(cb) / onMessage(cb)
 *     - getComments() / getMessages()
 *     - scan() — 立即扫描当前页
 *     - sendDM(userId, content) — 带防封延迟
 *     - replyComment(commentId, content) — DOM 注入填入并点击发送
 *     - likeVideo(videoId)
 *  4. 防封: 私信 3-6s 随机延迟 + 失败重试 3 次指数退避
 */

const { contextBridge, ipcRenderer } = require('electron')

// ─── 状态 ─────────────────────────────────────────────
let observer = null
let commentCallback = null
let messageCallback = null
let scanning = false
const seenComments = new Set()
const seenMessages = new Set()
const commentCache = []
const messageCache = []

// ─── 意向分计算 (与 connector.ts 算法对齐) ─────────────────────
function calcIntent(content) {
  let score = 50
  const text = content || ''
  // 询价 (同规则多关键词只加一次)
  if (/多少钱|价格|优惠|便宜|划算|贵|首付|月供|贷款|分期/.test(text)) score += 30
  // 购买意向
  if (/想买|换车|考虑|需要|想要|试驾|到店|预订|订车/.test(text)) score += 25
  // 正面情绪
  if (/好看|喜欢|满意|推荐|关注|已三连/.test(text)) score += 10
  // 负面情绪
  if (/太贵|不值|算了|不用了|再看看|考虑考虑/.test(text)) score -= 10
  return Math.max(0, Math.min(100, score))
}

function calcIntentReason(content) {
  const reasons = []
  const text = content || ''
  if (/多少钱|价格|优惠|便宜|划算|贵/.test(text)) reasons.push('询价')
  if (/首付|月供|贷款|分期|免息/.test(text)) reasons.push('金融关注')
  if (/想买|换车|考虑|需要|想要|试驾|到店/.test(text)) reasons.push('购买意向')
  if (/好看|喜欢|满意|推荐|关注|已三连/.test(text)) reasons.push('正面互动')
  if (/太贵|不值|算了|不用了|再看看/.test(text)) reasons.push('价格抗拒')
  if (/宝马|奥迪|雷克萨斯|和.*比|哪个好|对比/.test(text)) reasons.push('竞品对比')
  return reasons.length > 0 ? reasons.join('+') : '无明确意向'
}

// ─── 评论 DOM 提取 ─────────────────────────────────────────────
function extractCommentFromNode(node) {
  try {
    // 抖音评论容器选择器 (2024 版)
    const contentEl = node.querySelector('[data-e2e="comment-list-content"], .comment-content, [class*="CommentList"] [class*="content"]')
    const userEl = node.querySelector('[data-e2e="comment-user-name"], .comment-user, [class*="UserName"]')
    const avatarEl = node.querySelector('img[class*="avatar"], [class*="Avatar"] img')

    const content = contentEl?.textContent?.trim()
    if (!content || content.length < 2) return null

    const userName = userEl?.textContent?.trim() || '匿名用户'
    const avatar = avatarEl?.getAttribute('src') || userName.slice(0, 1)
    const userId = userEl?.getAttribute('data-user-id') || `dy_${userName}_${content.length}`

    // 视频信息
    const videoEl = document.querySelector('[data-e2e="video-desc"], .video-desc, [class*="VideoDesc"]')
    const videoTitle = videoEl?.textContent?.trim() || '当前视频'
    const videoId = window.location.pathname.match(/video\/(\d+)/)?.[1] || `v_${Date.now()}`
    const playCountEl = document.querySelector('[data-e2e="video-play-count"], [class*="PlayCount"]')
    const videoPlayCount = parsePlayCount(playCountEl?.textContent?.trim() || '0')

    const id = `dyc_${userId}_${videoId}_${content.slice(0, 10)}`
    if (seenComments.has(id)) return null
    seenComments.add(id)

    const intentScore = calcIntent(content)
    const intentReason = calcIntentReason(content)

    const comment = {
      id,
      userId,
      userName,
      avatar,
      content,
      videoId,
      videoTitle,
      videoPlayCount,
      intentScore,
      intentReason,
      replyStatus: 'pending',
      timestamp: Date.now(),
    }
    commentCache.push(comment)
    if (commentCache.length > 200) commentCache.shift()
    return comment
  } catch (e) {
    console.error('[旺财抖音] extractComment error:', e)
    return null
  }
}

function parsePlayCount(text) {
  if (!text) return 0
  const t = text.replace(/播放|次|,/g, '')
  if (/万/.test(t)) return Math.floor(parseFloat(t) * 10000)
  if (/亿/.test(t)) return Math.floor(parseFloat(t) * 100000000)
  const n = parseInt(t, 10)
  return isNaN(n) ? 0 : n
}

// ─── 私信 DOM 提取 ─────────────────────────────────────────────
function extractMessageFromNode(node) {
  try {
    const contentEl = node.querySelector('[class*="message-content"], [class*="MessageContent"], [data-e2e="im-message-content"]')
    const userEl = node.querySelector('[class*="user-name"], [data-e2e="im-user-name"]')
    const content = contentEl?.textContent?.trim()
    if (!content) return null
    const userName = userEl?.textContent?.trim() || '匿名'
    const userId = userEl?.getAttribute('data-user-id') || `dym_${userName}`
    const id = `dym_${userId}_${content.slice(0, 15)}_${node.dataset.timestamp || Date.now()}`
    if (seenMessages.has(id)) return null
    seenMessages.add(id)
    const msg = {
      id,
      fromUserId: userId,
      fromUserName: userName,
      content,
      type: 'text',
      timestamp: Date.now(),
    }
    messageCache.push(msg)
    if (messageCache.length > 100) messageCache.shift()
    return msg
  } catch (e) {
    console.error('[旺财抖音] extractMessage error:', e)
    return null
  }
}

// ─── DOM Observer ─────────────────────────────────────────────
function startObserver() {
  if (observer) return
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue
        // 评论区
        const commentNodes = node.matches?.('[data-e2e="comment-list"] [class*="CommentItem"], [class*="CommentItem"]')
          ? [node]
          : Array.from(node.querySelectorAll?.('[data-e2e="comment-list"] [class*="CommentItem"], [class*="CommentItem"]') || [])
        for (const cn of commentNodes) {
          const c = extractCommentFromNode(cn)
          if (c && commentCallback) {
            try { commentCallback(c) } catch (e) { console.error('[旺财抖音] comment callback error:', e) }
          }
        }
        // 私信区
        const msgNodes = node.matches?.('[class*="im-message"], [data-e2e="im-message-item"]')
          ? [node]
          : Array.from(node.querySelectorAll?.('[class*="im-message"], [data-e2e="im-message-item"]') || [])
        for (const mn of msgNodes) {
          const m = extractMessageFromNode(mn)
          if (m && messageCallback) {
            try { messageCallback(m) } catch (e) { console.error('[旺财抖音] message callback error:', e) }
          }
        }
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  console.log('[旺财抖音] DOM observer 已启动')
}

function stopObserver() {
  if (observer) {
    observer.disconnect()
    observer = null
    console.log('[旺财抖音] DOM observer 已停止')
  }
}

// ─── 主动扫描 ─────────────────────────────────────────────
async function scan() {
  if (scanning) return { newComments: 0, newMessages: 0 }
  scanning = true
  let newComments = 0
  let newMessages = 0
  try {
    const commentNodes = document.querySelectorAll('[data-e2e="comment-list"] [class*="CommentItem"], [class*="CommentItem"]')
    commentNodes.forEach((node) => {
      const c = extractCommentFromNode(node)
      if (c) newComments++
    })
    const msgNodes = document.querySelectorAll('[class*="im-message"], [data-e2e="im-message-item"]')
    msgNodes.forEach((node) => {
      const m = extractMessageFromNode(node)
      if (m) newMessages++
    })
  } finally {
    scanning = false
  }
  return { newComments, newMessages }
}

// ─── 防封延迟工具 ─────────────────────────────────────────────
function randomDelay(min = 3000, max = 6000) {
  return min + Math.random() * (max - min)
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function withRetry(fn, retries = 3, baseDelay = 1000) {
  let lastErr = null
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      console.warn(`[旺财抖音] 第 ${i + 1} 次失败:`, e?.message || e)
      if (i < retries - 1) await sleep(baseDelay * Math.pow(2, i))
    }
  }
  throw lastErr
}

// ─── 私信发送 (DOM 注入) ─────────────────────────────────────────────
async function sendDM(userId, content) {
  return withRetry(async () => {
    // 1. 防封延迟
    await sleep(randomDelay(3000, 6000))
    // 2. 点击用户头像进入私信
    const userEl = document.querySelector(`[data-user-id="${userId}"], [class*="UserName"][data-user-id="${userId}"]`)
    if (userEl) {
      userEl.click()
      await sleep(1500)
    }
    // 3. 找到输入框并填入内容
    const inputEl = document.querySelector('[data-e2e="im-input"], [class*="im-input"], [contenteditable="true"][class*="input"]') 
      || document.querySelector('textarea[class*="im"]')
    if (!inputEl) throw new Error('找不到私信输入框')
    // 模拟真实输入
    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      nativeInputValueSetter?.call(inputEl, content)
      inputEl.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      // contenteditable
      inputEl.focus()
      document.execCommand('insertText', false, content)
    }
    await sleep(500)
    // 4. 点击发送按钮
    const sendBtn = document.querySelector('[data-e2e="im-send"], [class*="send-btn"], button[class*="Send"]')
    if (!sendBtn) throw new Error('找不到发送按钮')
    sendBtn.click()
    await sleep(800)
    return true
  })
}

// ─── 评论回复 (DOM 注入) ─────────────────────────────────────────────
async function replyComment(commentId, content) {
  return withRetry(async () => {
    await sleep(randomDelay(2000, 4000))
    // 1. 找到对应评论的"回复"按钮
    const commentNode = document.querySelector(`[data-comment-id="${commentId}"]`)
      || Array.from(document.querySelectorAll('[class*="CommentItem"]')).find((n) => {
        const text = n.textContent || ''
        return text.includes(commentId.split('_').pop() || '')
      })
    if (!commentNode) throw new Error('找不到评论节点')
    // 2. 点击"回复"
    const replyBtn = commentNode.querySelector('[class*="reply"], [data-e2e="comment-reply"]')
    if (replyBtn) {
      replyBtn.click()
      await sleep(1000)
    }
    // 3. 填入回复内容
    const inputEl = document.querySelector('[class*="comment-input"], [contenteditable="true"][class*="CommentInput"]')
    if (!inputEl) throw new Error('找不到评论输入框')
    inputEl.focus()
    document.execCommand('insertText', false, content)
    await sleep(500)
    // 4. 点击发送
    const sendBtn = commentNode.querySelector('[class*="send"], [data-e2e="comment-send"]')
      || document.querySelector('[class*="comment-send"]')
    if (!sendBtn) throw new Error('找不到评论发送按钮')
    sendBtn.click()
    await sleep(800)
    return true
  })
}

// ─── 视频点赞 ─────────────────────────────────────────────
async function likeVideo(videoId) {
  return withRetry(async () => {
    await sleep(randomDelay(1500, 3000))
    const likeBtn = document.querySelector('[data-e2e="video-like"], [class*="LikeButton"], [class*="like-btn"]')
    if (!likeBtn) throw new Error('找不到点赞按钮')
    // 检查是否已点赞
    if (likeBtn.classList.contains('active') || likeBtn.querySelector('[class*="active"]')) {
      return true
    }
    likeBtn.click()
    await sleep(800)
    return true
  })
}

// ─── 暴露 API ─────────────────────────────────────────────
contextBridge.exposeInMainWorld('wangcaiDouyin', {
  platform: 'douyin',
  version: '1.1.0',

  start() {
    startObserver()
    return true
  },

  stop() {
    stopObserver()
    return true
  },

  onComment(cb) {
    commentCallback = cb
  },

  onMessage(cb) {
    messageCallback = cb
  },

  getComments() {
    return [...commentCache].sort((a, b) => b.videoPlayCount - a.videoPlayCount)
  },

  getMessages() {
    return [...messageCache]
  },

  async scan() {
    return scan()
  },

  async sendDM(userId, content) {
    return sendDM(userId, content)
  },

  async replyComment(commentId, content) {
    return replyComment(commentId, content)
  },

  async likeVideo(videoId) {
    return likeVideo(videoId)
  },

  clearCache() {
    seenComments.clear()
    seenMessages.clear()
    commentCache.length = 0
    messageCache.length = 0
  },

  getStats() {
    return {
      platform: 'douyin',
      commentsTracked: commentCache.length,
      messagesTracked: messageCache.length,
      observing: !!observer,
    }
  },
})

console.log('[旺财抖音] preload v1.1.0 已注入 (评论监听 + 私信注入 + 防封延迟)')
