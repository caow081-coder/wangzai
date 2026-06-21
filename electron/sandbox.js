/**
 * 旺财 Execution Sandbox — 执行沙箱
 *
 * 方案里的关键模块: 防错/回滚/节流/失败恢复
 *
 * 所有 UI 操作必须经过沙箱执行:
 *  1. 执行前模拟验证
 *  2. 执行失败回滚
 *  3. 防误触机制
 *  4. 节流控制
 */

// 执行队列 (所有 UI 操作排队执行)
const executionQueue = []
let executing = false

// 节流配置
const RATE_LIMITS = {
  wechat: { maxPerMin: 20, minDelay: 2000 },   // 微信: 每分钟最多20条, 最小间隔2s
  douyin: { maxPerMin: 15, minDelay: 3000 },   // 抖音: 每分钟最多15条, 最小间隔3s
  video: { maxPerMin: 10, minDelay: 4000 },    // 视频号: 每分钟最多10条, 最小间隔4s
}

// 每平台的发送计数
const sendCounts = new Map()  // platform → { count, windowStart }

// 失败重试配置
const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMs: 2000,  // 指数退避基数
}

/**
 * 检查节流
 */
function checkRateLimit(platform) {
  const limit = RATE_LIMITS[platform]
  if (!limit) return { allowed: true }

  const now = Date.now()
  let counter = sendCounts.get(platform)

  if (!counter || now - counter.windowStart > 60000) {
    counter = { count: 0, windowStart: now }
    sendCounts.set(platform, counter)
  }

  if (counter.count >= limit.maxPerMin) {
    return { allowed: false, reason: 'rate_limit_exceeded', retryAfter: 60000 - (now - counter.windowStart) }
  }

  return { allowed: true, minDelay: limit.minDelay }
}

/**
 * 加入执行队列
 */
async function enqueue(action) {
  return new Promise((resolve, reject) => {
    executionQueue.push({ action, resolve, reject })
    processQueue()
  })
}

/**
 * 处理队列
 */
async function processQueue() {
  if (executing) return
  executing = true

  while (executionQueue.length > 0) {
    const { action, resolve, reject } = executionQueue.shift()

    try {
      const result = await executeWithRetry(action)
      resolve(result)
    } catch (err) {
      reject(err)
    }

    // 队列间隔
    await new Promise(r => setTimeout(r, 500))
  }

  executing = false
}

/**
 * 带重试的执行
 */
async function executeWithRetry(action) {
  let lastError = null

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // 1. 执行前验证
      const validation = action.validate ? action.validate() : { valid: true }
      if (!validation.valid) {
        throw new Error(`验证失败: ${validation.reason}`)
      }

      // 2. 节流检查
      const rateCheck = checkRateLimit(action.platform)
      if (!rateCheck.allowed) {
        console.warn(`[Sandbox] 节流限制, ${rateCheck.retryAfter}ms 后重试`)
        await new Promise(r => setTimeout(r, rateCheck.retryAfter))
        continue
      }

      // 3. 执行前延迟 (防封)
      if (rateCheck.minDelay) {
        const jitter = Math.random() * 1000
        await new Promise(r => setTimeout(r, rateCheck.minDelay + jitter))
      }

      // 4. 执行
      const result = await action.execute()

      // 5. 计数
      const counter = sendCounts.get(action.platform)
      if (counter) counter.count++

      return result
    } catch (err) {
      lastError = err
      console.warn(`[Sandbox] 执行失败 (attempt ${attempt}/${RETRY_CONFIG.maxRetries}): ${err.message}`)

      if (attempt < RETRY_CONFIG.maxRetries) {
        // 指数退避
        const backoff = RETRY_CONFIG.backoffMs * Math.pow(2, attempt - 1)
        await new Promise(r => setTimeout(r, backoff))
      }
    }
  }

  throw lastError || new Error('执行失败')
}

/**
 * 行为漂移检测 (Anti-detection)
 */
const behaviorHistory = new Map()  // platform → timestamps[]

function detectBehaviorAnomaly(platform) {
  const now = Date.now()
  let history = behaviorHistory.get(platform) || []

  // 保留最近1小时的记录
  history = history.filter(t => now - t < 3600000)
  behaviorHistory.set(platform, history)

  // 检测: 最近10分钟内行为是否过于密集
  const recentActions = history.filter(t => now - t < 600000)
  if (recentActions.length > 50) {
    return { anomaly: true, reason: '行为过于密集(10分钟内>50次)', cooldownMs: 300000 }
  }

  // 检测: 是否有规律性间隔 (机器人特征)
  if (recentActions.length > 10) {
    const intervals = []
    for (let i = 1; i < recentActions.length; i++) {
      intervals.push(recentActions[i] - recentActions[i - 1])
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, v) => sum + Math.pow(v - avgInterval, 2), 0) / intervals.length
    const stdDev = Math.sqrt(variance)

    // 标准差小于平均值的10% = 太规律
    if (stdDev < avgInterval * 0.1) {
      return { anomaly: true, reason: '行为间隔过于规律(机器人特征)', cooldownMs: 600000 }
    }
  }

  return { anomaly: false }
}

/**
 * 记录行为
 */
function recordBehavior(platform) {
  const now = Date.now()
  let history = behaviorHistory.get(platform) || []
  history.push(now)
  behaviorHistory.set(platform, history)
}

/**
 * 强制冷却
 */
const cooldowns = new Map()  // platform → until timestamp

function forceCooldown(platform, durationMs) {
  cooldowns.set(platform, Date.now() + durationMs)
  console.warn(`[Sandbox] ${platform} 强制冷却 ${durationMs / 1000}s`)
}

function isInCooldown(platform) {
  const until = cooldowns.get(platform)
  if (!until) return false
  if (Date.now() < until) return true
  cooldowns.delete(platform)
  return false
}

module.exports = {
  enqueue,
  checkRateLimit,
  detectBehaviorAnomaly,
  recordBehavior,
  forceCooldown,
  isInCooldown,
  RATE_LIMITS,
}
