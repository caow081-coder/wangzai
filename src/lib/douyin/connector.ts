/**
 * 旺财抖音适配层
 *
 * 抖音没有像微信 ClawBot 那样的官方 Agent SDK，
 * 但可以通过以下方式接入:
 *  1. 抖音开放平台 API (需企业认证)
 *  2. 抖音网页版 DOM 注入 (Electron BrowserView)
 *  3. 抖音私信/评论 webhook (企业号)
 *
 * 当前实现: 适配器接口 + 模拟数据 + API 占位
 * 后续接入真实抖音时只需替换 DouyinConnector 实现
 */

export interface DouyinMessage {
  id: string
  fromUserId: string
  fromUserName: string
  fromUserAvatar: string
  content: string
  type: 'text' | 'image' | 'video' | 'comment'
  timestamp: number
  videoId?: string
  videoTitle?: string
}

export interface DouyinComment {
  id: string
  userId: string
  userName: string
  avatar: string
  content: string
  videoId: string
  videoTitle: string
  videoPlayCount: number
  intentScore: number
  intentReason: string
  replyStatus: 'pending' | 'replied' | 'dm_sent'
  aiReply?: string
  timestamp: number
}

export interface DouyinConnector {
  login(): Promise<boolean>
  isLoggedIn(): boolean
  getMessages(): Promise<DouyinMessage[]>
  getComments(videoId?: string): Promise<DouyinComment[]>
  sendDM(userId: string, content: string): Promise<boolean>
  replyComment(commentId: string, content: string): Promise<boolean>
  logout(): void
}

export class MockDouyinConnector implements DouyinConnector {
  private loggedIn = false
  private messages: DouyinMessage[] = []
  private comments: DouyinComment[] = []

  constructor() {
    this.comments = [
      { id: 'dc1', userId: 'u001', userName: '奔驰粉小王', avatar: '王', content: 'GLE多少钱？有优惠吗', videoId: 'v1', videoTitle: '2024款奔驰GLE评测', videoPlayCount: 156000, intentScore: 92, intentReason: '询价+优惠', replyStatus: 'pending', timestamp: Date.now() - 300000 },
      { id: 'dc2', userId: 'u002', userName: '换车达人', avatar: '换', content: '最近想换SUV，GLE和X5怎么选', videoId: 'v2', videoTitle: 'GLE vs X5 对比', videoPlayCount: 320000, intentScore: 85, intentReason: '换车意向+竞品对比', replyStatus: 'pending', timestamp: Date.now() - 600000 },
      { id: 'dc3', userId: 'u003', userName: '宝妈车主', avatar: '宝', content: 'GLC家用够吗？油耗多少', videoId: 'v3', videoTitle: 'GLC日常使用体验', videoPlayCount: 89000, intentScore: 78, intentReason: '家用需求+油耗关注', replyStatus: 'pending', timestamp: Date.now() - 900000 },
      { id: 'dc4', userId: 'u004', userName: '围观群众', avatar: '围', content: '好看，已关注', videoId: 'v1', videoTitle: '2024款奔驰GLE评测', videoPlayCount: 156000, intentScore: 30, intentReason: '仅关注无购买意图', replyStatus: 'pending', timestamp: Date.now() - 1200000 },
      { id: 'dc5', userId: 'u005', userName: '金融calculator', avatar: '金', content: '首付多少？月供压力大吗', videoId: 'v2', videoTitle: 'GLE vs X5 对比', videoPlayCount: 320000, intentScore: 88, intentReason: '购买力询问+月供关注', replyStatus: 'pending', timestamp: Date.now() - 1500000 },
    ]
  }

  async login(): Promise<boolean> { this.loggedIn = true; return true }
  isLoggedIn(): boolean { return this.loggedIn }
  async getMessages(): Promise<DouyinMessage[]> { return this.messages }
  async getComments(videoId?: string): Promise<DouyinComment[]> {
    if (videoId) return this.comments.filter(c => c.videoId === videoId)
    return [...this.comments].sort((a, b) => b.videoPlayCount - a.videoPlayCount)
  }
  async sendDM(userId: string, content: string): Promise<boolean> {
    const comment = this.comments.find(c => c.userId === userId)
    if (comment) comment.replyStatus = 'dm_sent'
    return true
  }
  async replyComment(commentId: string, content: string): Promise<boolean> {
    const comment = this.comments.find(c => c.id === commentId)
    if (comment) { comment.replyStatus = 'replied'; comment.aiReply = content }
    return true
  }
  logout(): void { this.loggedIn = false }
}

let douyinConnector: DouyinConnector | null = null
export function getDouyinConnector(): DouyinConnector {
  if (!douyinConnector) douyinConnector = new MockDouyinConnector()
  return douyinConnector
}
