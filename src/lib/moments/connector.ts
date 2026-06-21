/**
 * 旺财朋友圈接入适配层
 *
 * 微信朋友圈没有官方 Agent SDK，可通过以下方式接入：
 *  1. 微信网页版 DOM 注入（Electron BrowserView + preload）
 *  2. 微信 PC 客户端 hook（ClawBot 私有协议，灰度）
 *  3. 朋友圈评论 webhook（企业微信 + 灰度白名单）
 *
 * 当前实现：适配器接口 + 模拟数据 + 意向分计算 + 巡视任务调度
 * 后续接入真实朋友圈时只需替换 MomentsConnector 实现
 *
 * 设计参考：src/lib/wechat-video/connector.ts
 * 意向分算法与视频号/抖音保持一致，便于跨场控面板复用
 */

// ============== 数据接口 ==============

/** 朋友圈动态 */
export interface MomentPost {
  id: string
  authorId: string
  authorName: string
  authorAvatar: string
  content: string
  images: string[]
  likeCount: number
  commentCount: number
  publishedAt: number
  isLiked: boolean
  isOwn: boolean // 是否是自己发的朋友圈
}

/** 朋友圈评论 */
export interface MomentComment {
  id: string
  postId: string
  userId: string
  userName: string
  avatar: string
  content: string
  intentScore: number // 意向分 0-100
  intentReason: string
  replyStatus: 'pending' | 'replied'
  aiReply?: string
  timestamp: number
}

/** 巡视任务目标类型 */
export type PatrolTarget = 'friends' | 'own_posts' | 'specific_user'

/** 巡视任务状态 */
export type PatrolStatus = 'pending' | 'patrolling' | 'completed' | 'paused'

/** 巡视日志条目 */
export interface PatrolLog {
  ts: number
  level: 'info' | 'warn' | 'success'
  msg: string
}

/** 朋友圈巡视任务 */
export interface PatrolTask {
  id: string
  target: PatrolTarget
  targetId?: string
  status: PatrolStatus
  progress: number // 0-100
  scannedCount: number
  newCommentsCount: number
  highIntentCount: number
  startedAt?: number
  completedAt?: number
  logs: PatrolLog[]
}

/** 朋友圈 Connector 接口 */
export interface MomentsConnector {
  login(): Promise<boolean>
  isLoggedIn(): boolean
  getPosts(limit?: number): Promise<MomentPost[]>
  getComments(postId?: string): Promise<MomentComment[]>
  patrol(): Promise<PatrolTask> // 启动巡视
  getPatrolStatus(): PatrolTask | null
  replyComment(commentId: string, content: string): Promise<boolean>
  likePost(postId: string): Promise<boolean>
  postMoment(content: string, images?: string[]): Promise<boolean> // 发朋友圈
  logout(): void
}

// ============== 意向分计算（与视频号/抖音对齐）==============

// 意向关键词权重表（命中即加分 / 减分）
const INTENT_KEYWORDS: Array<{ words: string[]; score: number; label: string }> = [
  { words: ['多少钱', '价格', '优惠', '便宜', '首付', '月供'], score: 30, label: '询价' },
  { words: ['想买', '换车', '试驾', '到店', '预定', '定金'], score: 25, label: '购车意向' },
  { words: ['好看', '喜欢', '关注', '心动', '羡慕'], score: 10, label: '好感' },
  { words: ['太贵', '不值', '算了', '考虑下', '再看看'], score: -10, label: '负面' },
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
      reject(new Error(`[moments] ${label} 超时 ${ms}ms`))
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

/** 异步 sleep 工具 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ============== Mock 实现 ==============

export class MockMomentsConnector implements MomentsConnector {
  private loggedIn = false
  private posts: MomentPost[] = []
  private comments: MomentComment[] = []
  private likedPostIds = new Set<string>()
  private patrolTask: PatrolTask | null = null
  private patrolTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.posts = this.buildSeedPosts()
    this.comments = this.buildSeedComments()
  }

  /**
   * 构造 6 条朋友圈种子数据（奔驰销售场景）
   * 3 条自己的 + 3 条好友的：
   *  - 新车到店（自）
   *  - 试驾活动（自）
   *  - 客户提车（自）
   *  - 优惠通知（好友）
   *  - 保养提醒（好友）
   *  - 品牌故事（好友）
   */
  private buildSeedPosts(): MomentPost[] {
    const now = Date.now()
    return [
      {
        id: 'mp1',
        authorId: 'self',
        authorName: '苏念安 · 奔驰销售',
        authorAvatar: '苏',
        content:
          '【新车到店】2024款奔驰GLC到店实拍！全新M254发动机+ISG集成式启发，动力升级油耗更低。现车充足，欢迎到店品鉴，可安排上门试驾🚗',
        images: [
          'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=400',
          'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400',
        ],
        likeCount: 86,
        commentCount: 4,
        publishedAt: now - 30 * 60 * 1000,
        isLiked: false,
        isOwn: true,
      },
      {
        id: 'mp2',
        authorId: 'self',
        authorName: '苏念安 · 奔驰销售',
        authorAvatar: '苏',
        content:
          '【周末试驾活动】本周六日奔驰全系试驾会，到店即送精美礼品。GLC/GLE/E级全线开放试驾，预约从速！名额仅限20位✨',
        images: ['https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=400'],
        likeCount: 124,
        commentCount: 3,
        publishedAt: now - 3 * 60 * 60 * 1000,
        isLiked: false,
        isOwn: true,
      },
      {
        id: 'mp3',
        authorId: 'self',
        authorName: '苏念安 · 奔驰销售',
        authorAvatar: '苏',
        content:
          '恭喜林总喜提奔驰E级！感谢信任，愿这台E级陪伴您丈量山海，前程似锦。提车仪式感满满，下次保养记得找我哦～',
        images: ['https://images.unsplash.com/photo-1542362567-b07e54358753?w=400'],
        likeCount: 156,
        commentCount: 2,
        publishedAt: now - 24 * 60 * 60 * 1000,
        isLiked: true,
        isOwn: true,
      },
      {
        id: 'mp4',
        authorId: 'friend001',
        authorName: '李老炮说车',
        authorAvatar: '李',
        content:
          '听说这周奔驰有活动？想问问GLC260现在落地价多少，有没有兄弟刚提车的报个价，谢谢',
        images: [],
        likeCount: 23,
        commentCount: 4,
        publishedAt: now - 6 * 60 * 60 * 1000,
        isLiked: false,
        isOwn: false,
      },
      {
        id: 'mp5',
        authorId: 'friend002',
        authorName: '王姐的养车日记',
        authorAvatar: '王',
        content:
          '【保养提醒】奔驰车主朋友们注意啦，B保马上到时间，有了解活动价格的姐妹吗？4S店报5000+，外面保养靠谱吗',
        images: [],
        likeCount: 41,
        commentCount: 2,
        publishedAt: now - 12 * 60 * 60 * 1000,
        isLiked: false,
        isOwn: false,
      },
      {
        id: 'mp6',
        authorId: 'friend003',
        authorName: '老钱观车',
        authorAvatar: '钱',
        content:
          '分享一篇奔驰百年品牌故事：从1886年卡尔本茨的第一辆汽车，到今天EQ电动化转型，三叉星徽始终在守护出行梦想。值得细品',
        images: [
          'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=400',
        ],
        publishedAt: now - 48 * 60 * 60 * 1000,
        likeCount: 78,
        commentCount: 2,
        isLiked: true,
        isOwn: false,
      },
    ]
  }

  /**
   * 构造评论种子数据（每条朋友圈 2-4 条评论）
   * 意向分通过 calculateIntent 自动计算
   */
  private buildSeedComments(): MomentComment[] {
    const now = Date.now()
    const raw: Array<Omit<MomentComment, 'intentScore' | 'intentReason'>> = [
      // ── mp1 新车到店 ──
      {
        id: 'mc1', postId: 'mp1', userId: 'fu001', userName: '陈先生', avatar: '陈',
        content: 'GLC现在多少钱？优惠多少',
        replyStatus: 'pending', timestamp: now - 25 * 60 * 1000,
      },
      {
        id: 'mc2', postId: 'mp1', userId: 'fu002', userName: 'Lisa', avatar: 'L',
        content: '想换车，能到店试驾吗',
        replyStatus: 'pending', timestamp: now - 20 * 60 * 1000,
      },
      {
        id: 'mc3', postId: 'mp1', userId: 'fu003', userName: '阿强', avatar: '强',
        content: '颜值好看，已关注',
        replyStatus: 'pending', timestamp: now - 15 * 60 * 1000,
      },
      // ── mp2 周末试驾活动 ──
      {
        id: 'mc4', postId: 'mp2', userId: 'fu004', userName: '木子', avatar: '木',
        content: 'GLE 350试驾要预约吗？这周末有空',
        replyStatus: 'pending', timestamp: now - 150 * 60 * 1000,
      },
      {
        id: 'mc5', postId: 'mp2', userId: 'fu005', userName: '大卫', avatar: '大',
        content: '首付多少月供压力？',
        replyStatus: 'pending', timestamp: now - 120 * 60 * 1000,
      },
      {
        id: 'mc6', postId: 'mp2', userId: 'fu006', userName: '老司机', avatar: '司',
        content: '太贵了不值这个价，算了看X3',
        replyStatus: 'pending', timestamp: now - 90 * 60 * 1000,
      },
      {
        id: 'mc7', postId: 'mp2', userId: 'fu007', userName: 'Tony', avatar: 'T',
        content: '心动了，预定要交定金吗',
        replyStatus: 'pending', timestamp: now - 60 * 60 * 1000,
      },
      // ── mp3 客户提车 ──
      {
        id: 'mc8', postId: 'mp3', userId: 'fu008', userName: '林总本人', avatar: '林',
        content: '感谢念安专业服务，下次保养找你',
        replyStatus: 'pending', timestamp: now - 20 * 60 * 60 * 1000,
      },
      {
        id: 'mc9', postId: 'mp3', userId: 'fu009', userName: '羡慕的网友', avatar: '羡',
        content: '羡慕！E级多少钱落地的',
        replyStatus: 'pending', timestamp: now - 18 * 60 * 60 * 1000,
      },
      // ── mp4 好友问价 ──
      {
        id: 'mc10', postId: 'mp4', userId: 'friend001', userName: '李老炮说车', avatar: '李',
        content: 'GLC260现在落地价多少',
        replyStatus: 'pending', timestamp: now - 5 * 60 * 60 * 1000,
      },
      {
        id: 'mc11', postId: 'mp4', userId: 'fu010', userName: '热心车友', avatar: '热',
        content: '我也想买，价格怎么样',
        replyStatus: 'pending', timestamp: now - 4 * 60 * 60 * 1000,
      },
      {
        id: 'mc12', postId: 'mp4', userId: 'fu011', userName: '过来人', avatar: '过',
        content: '上周刚提，优惠还行，可以到店谈',
        replyStatus: 'pending', timestamp: now - 3 * 60 * 60 * 1000,
      },
      // ── mp5 保养提醒 ──
      {
        id: 'mc13', postId: 'mp5', userId: 'fu012', userName: '车友阿凯', avatar: '凯',
        content: '4S店保养价格不便宜，关注活动优惠',
        replyStatus: 'pending', timestamp: now - 10 * 60 * 60 * 1000,
      },
      {
        id: 'mc14', postId: 'mp5', userId: 'fu013', userName: '理性派', avatar: '理',
        content: '外面保养不值，再看看吧',
        replyStatus: 'pending', timestamp: now - 8 * 60 * 60 * 1000,
      },
      // ── mp6 品牌故事 ──
      {
        id: 'mc15', postId: 'mp6', userId: 'fu014', userName: '品牌粉', avatar: '粉',
        content: '三叉星徽百年传承，喜欢这个调性',
        replyStatus: 'pending', timestamp: now - 40 * 60 * 60 * 1000,
      },
      {
        id: 'mc16', postId: 'mp6', userId: 'fu015', userName: '历史迷', avatar: '史',
        content: '卡尔本茨真伟大，关注了',
        replyStatus: 'pending', timestamp: now - 36 * 60 * 60 * 1000,
      },
    ]

    return raw.map((c) => {
      const { score, reason } = calculateIntent(c.content)
      return { ...c, intentScore: score, intentReason: reason }
    })
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

  async getPosts(limit?: number): Promise<MomentPost[]> {
    return withTimeout(
      Promise.resolve().then(() => {
        const list = [...this.posts].sort((a, b) => b.publishedAt - a.publishedAt)
        return limit ? list.slice(0, limit) : list
      }),
      DEFAULT_TIMEOUT_MS,
      'get_posts',
    )
  }

  async getComments(postId?: string): Promise<MomentComment[]> {
    return withTimeout(
      Promise.resolve().then(() => {
        const list = postId
          ? this.comments.filter((c) => c.postId === postId)
          : this.comments
        // 按 timestamp 升序（旧评论在前，新评论在后）
        return [...list].sort((a, b) => a.timestamp - b.timestamp)
      }),
      DEFAULT_TIMEOUT_MS,
      'get_comments',
    )
  }

  /**
   * 启动巡视任务
   * 模拟扫描进度（每 500ms +10），同步 push 日志
   * 巡视过程中实时统计 scannedCount / newCommentsCount / highIntentCount
   */
  async patrol(): Promise<PatrolTask> {
    return withTimeout(
      new Promise<PatrolTask>((resolve) => {
        // 若已有巡视任务在执行，直接返回当前状态
        if (this.patrolTask && this.patrolTask.status === 'patrolling') {
          resolve(this.patrolTask)
          return
        }

        const task: PatrolTask = {
          id: `patrol_${Date.now()}`,
          target: 'friends',
          status: 'patrolling',
          progress: 0,
          scannedCount: 0,
          newCommentsCount: 0,
          highIntentCount: 0,
          startedAt: Date.now(),
          logs: [
            {
              ts: Date.now(),
              level: 'info',
              msg: '巡视任务启动，目标：全部朋友圈',
            },
          ],
        }
        this.patrolTask = task

        // 清理旧定时器
        if (this.patrolTimer) {
          clearInterval(this.patrolTimer)
          this.patrolTimer = null
        }

        // 逐条扫描朋友圈
        const totalPosts = this.posts.length
        // 每 500ms 推进 10%，对应扫描约 totalPosts/10 条
        const postsPerTick = Math.max(1, Math.ceil(totalPosts / 10))

        this.patrolTimer = setInterval(() => {
          if (!this.patrolTask || this.patrolTask.status !== 'patrolling') return

          const prevScanned = this.patrolTask.scannedCount
          const nextScanned = Math.min(totalPosts, prevScanned + postsPerTick)
          const delta = nextScanned - prevScanned
          void delta

          // 为本次扫描的朋友圈统计新评论与高意向评论
          let newComments = 0
          let highIntent = 0
          for (let i = prevScanned; i < nextScanned; i++) {
            const post = this.posts[i]
            if (!post) continue
            const comments = this.comments.filter((c) => c.postId === post.id)
            newComments += comments.length
            highIntent += comments.filter((c) => c.intentScore >= 70).length
            // 每扫描一条朋友圈 push 一条 info/warn 日志
            const level: PatrolLog['level'] =
              comments.some((c) => c.intentScore >= 70) ? 'warn' : 'info'
            this.patrolTask.logs.push({
              ts: Date.now(),
              level,
              msg: `扫描「${post.authorName}」朋友圈：${comments.length} 条评论，${
                comments.filter((c) => c.intentScore >= 70).length
              } 条高意向`,
            })
          }

          this.patrolTask.scannedCount = nextScanned
          this.patrolTask.newCommentsCount += newComments
          this.patrolTask.highIntentCount += highIntent
          this.patrolTask.progress = Math.min(
            100,
            Math.round((nextScanned / totalPosts) * 100),
          )

          // 进度达到 100 完成巡视
          if (this.patrolTask.progress >= 100) {
            this.patrolTask.status = 'completed'
            this.patrolTask.completedAt = Date.now()
            this.patrolTask.logs.push({
              ts: Date.now(),
              level: 'success',
              msg: `巡视完成：扫描 ${this.patrolTask.scannedCount} 条朋友圈，发现 ${this.patrolTask.newCommentsCount} 条新评论，${this.patrolTask.highIntentCount} 条高意向待跟进`,
            })
            if (this.patrolTimer) {
              clearInterval(this.patrolTimer)
              this.patrolTimer = null
            }
          }
        }, 500)

        // 立即 resolve 任务对象，前端可通过 getPatrolStatus 轮询进度
        resolve(task)
      }),
      DEFAULT_TIMEOUT_MS,
      'patrol',
    )
  }

  getPatrolStatus(): PatrolTask | null {
    return this.patrolTask
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

  async likePost(postId: string): Promise<boolean> {
    return withTimeout(
      Promise.resolve().then(() => {
        const post = this.posts.find((p) => p.id === postId)
        if (!post) return false
        if (!this.likedPostIds.has(postId)) {
          this.likedPostIds.add(postId)
          post.likeCount += 1
          post.isLiked = true
        }
        return true
      }),
      DEFAULT_TIMEOUT_MS,
      'like_post',
    )
  }

  async postMoment(content: string, images: string[] = []): Promise<boolean> {
    return withTimeout(
      Promise.resolve().then(() => {
        if (!content.trim()) return false
        const now = Date.now()
        const newPost: MomentPost = {
          id: `mp_${now}`,
          authorId: 'self',
          authorName: '苏念安 · 奔驰销售',
          authorAvatar: '苏',
          content: content.trim(),
          // 最多 9 张图
          images: images.filter(Boolean).slice(0, 9),
          likeCount: 0,
          commentCount: 0,
          publishedAt: now,
          isLiked: false,
          isOwn: true,
        }
        this.posts.unshift(newPost)
        return true
      }),
      DEFAULT_TIMEOUT_MS,
      'post_moment',
    )
  }

  logout(): void {
    this.loggedIn = false
    if (this.patrolTimer) {
      clearInterval(this.patrolTimer)
      this.patrolTimer = null
    }
  }
}

// ============== 单例 ==============

let momentsConnector: MomentsConnector | null = null

export function getMomentsConnector(): MomentsConnector {
  if (!momentsConnector) {
    momentsConnector = new MockMomentsConnector()
  }
  return momentsConnector
}

// 导出 calculateIntent（供 preload / UI 复用）
export { calculateIntent }
