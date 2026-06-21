/**
 * 旺财视频号接入适配层
 *
 * 微信视频号没有像微信 ClawBot 那样的官方 Agent SDK，
 * 可通过以下方式接入：
 *  1. 视频号网页版 DOM 注入（Electron BrowserView + preload）
 *  2. 视频号助手 API（需企业认证 + 灰度白名单）
 *  3. 视频号评论 / 私信 webhook（灰度）
 *
 * 当前实现：适配器接口 + 模拟数据 + 意向分计算 + API 占位
 * 后续接入真实视频号时只需替换 WechatVideoConnector 实现
 */

// ============== 数据接口 ==============

export interface VideoComment {
  id: string
  userId: string
  userName: string
  avatar: string
  content: string
  videoId: string
  videoTitle: string
  videoPlayCount: number
  videoLikeCount: number
  intentScore: number        // 意向分 0-100
  intentReason: string       // 意向判定原因
  replyStatus: 'pending' | 'replied' | 'dm_sent'
  aiReply?: string
  timestamp: number
}

export interface VideoMessage {
  id: string
  fromUserId: string
  fromUserName: string
  content: string
  type: 'text' | 'image' | 'video'
  timestamp: number
  videoId?: string
}

export interface WechatVideoConnector {
  login(): Promise<boolean>
  isLoggedIn(): boolean
  getComments(videoId?: string): Promise<VideoComment[]>
  getMessages(): Promise<VideoMessage[]>
  replyComment(commentId: string, content: string): Promise<boolean>
  sendDM(userId: string, content: string): Promise<boolean>
  likeVideo(videoId: string): Promise<boolean>
  logout(): void
}

// ============== 意向分计算 ==============

// 意向关键词权重表（命中即加分 / 减分）
const INTENT_KEYWORDS: Array<{ words: string[]; score: number; label: string }> = [
  { words: ['多少钱', '价格', '优惠', '便宜'], score: 30, label: '询价' },
  { words: ['想买', '换车', '试驾', '到店'], score: 25, label: '购车意向' },
  { words: ['好看', '喜欢', '关注'], score: 10, label: '好感' },
  { words: ['太贵', '不值', '算了'], score: -10, label: '负面' },
]

const BASE_INTENT_SCORE = 50
const INTENT_SCORE_MIN = 0
const INTENT_SCORE_MAX = 100

/**
 * 计算评论意向分
 * @param content 评论内容
 * @returns { score, reason } 意向分与命中原因
 */
function calculateIntent(content: string): { score: number; reason: string } {
  let score = BASE_INTENT_SCORE
  const reasons: string[] = []
  for (const rule of INTENT_KEYWORDS) {
    const hit = rule.words.find((w) => content.includes(w))
    if (hit) {
      score += rule.score
      const sign = rule.score >= 0 ? '+' : ''
      reasons.push(`${rule.label}(${hit}${sign}${rule.score})`)
    }
  }
  // 钳制到 0-100
  score = Math.max(INTENT_SCORE_MIN, Math.min(INTENT_SCORE_MAX, score))
  const reason = reasons.length
    ? `${reasons.join(' | ')} | 基础50`
    : '基础意向分(无明确关键词)'
  return { score, reason }
}

// ============== Promise 超时保护 ==============

const DEFAULT_TIMEOUT_MS = 10000

/**
 * 给 Promise 包一层超时保护
 * @param promise 原始 Promise
 * @param ms 超时毫秒，默认 10s
 * @param label 用于错误日志的标签
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number = DEFAULT_TIMEOUT_MS,
  label: string = 'operation',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[wechat-video] ${label} 超时 ${ms}ms`))
    }, ms)
    promise.then(
      (val) => {
        clearTimeout(timer)
        resolve(val)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

// ============== Mock 实现 ==============

export class MockWechatVideoConnector implements WechatVideoConnector {
  private loggedIn = false
  private messages: VideoMessage[] = []
  private comments: VideoComment[] = []
  private likedVideoIds = new Set<string>()

  constructor() {
    this.comments = this.buildSeedComments()
    this.messages = this.buildSeedMessages()
  }

  /**
   * 构造 8 条种子评论数据（奔驰销售场景）
   * 覆盖 GLC / GLE / E级 / S级 / C级 / EQE / 迈巴赫 / AMG 八大车系
   * 每条评论通过 calculateIntent 自动计算意向分
   */
  private buildSeedComments(): VideoComment[] {
    const now = Date.now()
    // 注意：intentScore 与 intentReason 由 calculateIntent 计算，这里不写死
    const raw: Array<Omit<VideoComment, 'intentScore' | 'intentReason'>> = [
      {
        id: 'vc1', userId: 'vu001', userName: '老张说车', avatar: '张',
        content: '奔驰GLC多少钱？现在有优惠吗',
        videoId: 'vv1', videoTitle: '2024款奔驰GLC到店实拍',
        videoPlayCount: 286000, videoLikeCount: 12300,
        replyStatus: 'pending', timestamp: now - 300000,
      },
      {
        id: 'vc2', userId: 'vu002', userName: '黑科技玩家', avatar: '黑',
        content: 'GLE 350想买一台，能到店试驾吗',
        videoId: 'vv2', videoTitle: '奔驰GLE 350 试驾报告',
        videoPlayCount: 412000, videoLikeCount: 21500,
        replyStatus: 'pending', timestamp: now - 600000,
      },
      {
        id: 'vc3', userId: 'vu003', userName: '商务精英', avatar: '商',
        content: 'E级跟5系哪个好？最近想换车',
        videoId: 'vv3', videoTitle: '奔驰E级 vs 宝马5系',
        videoPlayCount: 158000, videoLikeCount: 8600,
        replyStatus: 'pending', timestamp: now - 900000,
      },
      {
        id: 'vc4', userId: 'vu004', userName: '老板座驾', avatar: '板',
        content: 'S级迈巴赫首付多少月供压力',
        videoId: 'vv4', videoTitle: '迈巴赫S级提车分享',
        videoPlayCount: 645000, videoLikeCount: 38900,
        replyStatus: 'pending', timestamp: now - 1200000,
      },
      {
        id: 'vc5', userId: 'vu005', userName: '颜值党', avatar: '颜',
        content: 'C级这颜色好看，已关注',
        videoId: 'vv5', videoTitle: '奔驰C级提车日记',
        videoPlayCount: 97000, videoLikeCount: 5400,
        replyStatus: 'pending', timestamp: now - 1500000,
      },
      {
        id: 'vc6', userId: 'vu006', userName: '电车信徒', avatar: '电',
        content: 'EQE续航怎么样？价格太贵了吧',
        videoId: 'vv6', videoTitle: '奔驰EQE长测报告',
        videoPlayCount: 223000, videoLikeCount: 9100,
        replyStatus: 'pending', timestamp: now - 1800000,
      },
      {
        id: 'vc7', userId: 'vu007', userName: '性能控', avatar: '控',
        content: 'AMG GT 63 试驾还要预约吗',
        videoId: 'vv7', videoTitle: 'AMG GT 63 街道暴力测试',
        videoPlayCount: 528000, videoLikeCount: 31200,
        replyStatus: 'pending', timestamp: now - 2100000,
      },
      {
        id: 'vc8', userId: 'vu008', userName: '务实派', avatar: '务',
        content: 'GLC太贵了不值这个价，算了看X3',
        videoId: 'vv1', videoTitle: '2024款奔驰GLC到店实拍',
        videoPlayCount: 286000, videoLikeCount: 12300,
        replyStatus: 'pending', timestamp: now - 2400000,
      },
    ]

    return raw.map((c) => {
      const { score, reason } = calculateIntent(c.content)
      return { ...c, intentScore: score, intentReason: reason }
    })
  }

  /** 构造 2 条种子私信消息 */
  private buildSeedMessages(): VideoMessage[] {
    const now = Date.now()
    return [
      {
        id: 'vm1', fromUserId: 'vu001', fromUserName: '老张说车',
        content: 'GLC能优惠多少', type: 'text',
        timestamp: now - 200000, videoId: 'vv1',
      },
      {
        id: 'vm2', fromUserId: 'vu002', fromUserName: '黑科技玩家',
        content: '明天能到店试驾吗', type: 'text',
        timestamp: now - 100000, videoId: 'vv2',
      },
    ]
  }

  async login(): Promise<boolean> {
    return withTimeout(
      Promise.resolve(true).then(() => {
        this.loggedIn = true
        return true
      }),
      DEFAULT_TIMEOUT_MS,
      'login',
    )
  }

  isLoggedIn(): boolean {
    return this.loggedIn
  }

  async getComments(videoId?: string): Promise<VideoComment[]> {
    return withTimeout(
      Promise.resolve().then(() => {
        const list = videoId
          ? this.comments.filter((c) => c.videoId === videoId)
          : this.comments
        // 按播放量降序：高播放量视频优先截流
        return [...list].sort((a, b) => b.videoPlayCount - a.videoPlayCount)
      }),
      DEFAULT_TIMEOUT_MS,
      'get_comments',
    )
  }

  async getMessages(): Promise<VideoMessage[]> {
    return withTimeout(
      Promise.resolve([...this.messages]),
      DEFAULT_TIMEOUT_MS,
      'get_messages',
    )
  }

  async replyComment(commentId: string, content: string): Promise<boolean> {
    return withTimeout(
      Promise.resolve().then(() => {
        const comment = this.comments.find((c) => c.id === commentId)
        if (!comment) return false
        comment.replyStatus = 'replied'
        comment.aiReply = content
        return true
      }),
      DEFAULT_TIMEOUT_MS,
      'reply_comment',
    )
  }

  async sendDM(userId: string, content: string): Promise<boolean> {
    return withTimeout(
      Promise.resolve().then(() => {
        const comment = this.comments.find((c) => c.userId === userId)
        if (comment) comment.replyStatus = 'dm_sent'
        // 写入一条消息记录，便于后续追溯
        this.messages.push({
          id: `vm_${Date.now()}`,
          fromUserId: userId,
          fromUserName: comment?.userName ?? 'unknown',
          content,
          type: 'text',
          timestamp: Date.now(),
          videoId: comment?.videoId,
        })
        return true
      }),
      DEFAULT_TIMEOUT_MS,
      'send_dm',
    )
  }

  async likeVideo(videoId: string): Promise<boolean> {
    return withTimeout(
      Promise.resolve().then(() => {
        this.likedVideoIds.add(videoId)
        return true
      }),
      DEFAULT_TIMEOUT_MS,
      'like_video',
    )
  }

  logout(): void {
    this.loggedIn = false
  }
}

// ============== 单例 ==============

let wechatVideoConnector: WechatVideoConnector | null = null

export function getWechatVideoConnector(): WechatVideoConnector {
  if (!wechatVideoConnector) {
    wechatVideoConnector = new MockWechatVideoConnector()
  }
  return wechatVideoConnector
}
