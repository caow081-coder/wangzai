/**
 * 旺财微信真实接入层 — 基于 weixin-agent-sdk (ClawBot)
 *
 * 这是你方案里的 ClawBot Connector 实现:
 *  - login() → 扫码登录真实微信
 *  - start(agent) → 自动收发真实微信消息
 *  - bot.sendMessage() → 主动发消息（群发/激活）
 *
 * 消息闭环:
 *   微信消息 → ClawBot SDK → 旺财 Agent → AI 大脑 → 安全护盾 → 微信回复
 *
 * 用法:
 *   import { WeChatBridge } from '@/lib/wechat/bridge'
 *   const bridge = new WeChatBridge()
 *   await bridge.login()  // 扫码登录
 *   bridge.start()        // 开始自动回复
 *   bridge.broadcast('618活动来了!')  // 群发
 */

import { login, start, logout, isLoggedIn, type Agent, type ChatRequest, type ChatResponse, type Bot } from 'weixin-agent-sdk'
import { fastRuleEngine, inferDelta, driftIdentity, compilePersona, compileActionPlan, validatePlan, type IdentityVector } from '@/lib/identity/kernel'

// 旺财的 AI Agent 实现 — 接收到微信消息后调用 AI 大脑回复
class WangcaiAgent implements Agent {
  private conversations = new Map<string, string[]>()
  private identities = new Map<string, IdentityVector>()  // 每个用户的身份向量
  private personas: any[] = []

  setPersonas(personas: any[]) {
    this.personas = personas
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { conversationId, text, media } = request
    console.log(`[旺财] 收到微信消息 from ${conversationId}: ${text}`)

    let userContent = text
    if (media?.type === 'image') {
      userContent = `[图片] ${text || '请描述这张图片'}`
    }

    // === Multi-Speed Pipeline ===
    // Step 1: 快速规则引擎 (0ms, 70%请求不走LLM)
    const fastReply = fastRuleEngine(userContent)
    if (fastReply.handled) {
      console.log(`[旺财] 快速规则命中: ${fastReply.reason}`)
      return { text: fastReply.reply! }
    }

    // Step 2: 更新身份向量
    const currentIdentity = this.identities.get(conversationId) ?? {
      trust: 30, intent: 20, emotion: 50, urgency: 20, resistance: 30, value: 40,
    }
    const delta = inferDelta(userContent)
    const newIdentity = driftIdentity(currentIdentity, delta)
    this.identities.set(conversationId, newIdentity)

    // Step 3: 人格编译器 — 根据身份向量编译混合人格
    let personaContext = ''
    if (this.personas.length > 0) {
      const blend = compilePersona(newIdentity, this.personas)
      personaContext = `\n[系统] 当前客户状态: 信任${newIdentity.trust} 意图${newIdentity.intent} 情绪${newIdentity.emotion} 紧迫${newIdentity.urgency} 抗拒${newIdentity.resistance} 价值${newIdentity.value}\n[系统] 推荐策略: ${blend.strategy}\n[系统] 人格混合: ${blend.blends.map(b => `${b.personaName}${b.weight}%`).join('+')}`
    }

    // Step 4: 调用 AI 大脑 (300-1500ms)
    const history = this.conversations.get(conversationId) ?? []
    history.push(userContent)

    try {
      const reply = await this.callBrain(history, personaContext)
      history.push(reply)
      this.conversations.set(conversationId, history.slice(-20))

      // Step 5: Action DSL — 编译执行计划
      const plan = compileActionPlan(reply, 0.8)
      const validation = validatePlan(plan)
      if (!validation.valid) {
        console.warn(`[旺财] 执行计划被拒绝: ${validation.reason}`)
        return { text: '抱歉，我需要确认一下再回复您~' }
      }

      console.log(`[旺财] AI回复 to ${conversationId}: ${reply.slice(0, 50)} (策略: ${personaContext.match(/策略: (.+)/)?.[1] || '默认'})`)
      return { text: reply }
    } catch (err) {
      console.error(`[旺财] AI回复失败:`, err)
      return { text: '抱歉，我正在思考中，请稍等片刻~' }
    }
  }

  clearSession(conversationId: string) {
    this.conversations.delete(conversationId)
    this.identities.delete(conversationId)
  }

  // 获取用户身份向量 (供前端展示)
  getIdentity(conversationId: string): IdentityVector | null {
    return this.identities.get(conversationId) ?? null
  }

  private async callBrain(history: string[], personaContext: string): Promise<string> {
    const messages = [
      ...history.map((text, i) => ({
        role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: text,
      })),
    ]

    // 如果有身份上下文，加到最后一条用户消息前
    if (personaContext && messages.length > 0) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
      if (lastUserMsg) {
        lastUserMsg.content = personaContext + '\n\n客户消息: ' + lastUserMsg.content
      }
    }

    const res = await fetch('http://localhost:3000/api/waos/brain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model: 'auto', cookies: {} }),
    })

    const data = await res.json()
    return data.reply || '抱歉，我没听懂，能再说一遍吗？'
  }
}

/**
 * 旺财微信桥接器
 */
export class WeChatBridge {
  private agent: WangcaiAgent
  private bot: Bot | null = null
  private loggedIn = false
  private accountId: string | null = null

  // 事件监听
  private listeners: {
    onMessage?: (from: string, text: string) => void
    onReply?: (to: string, text: string) => void
    onLogin?: (accountId: string) => void
    onError?: (err: string) => void
  } = {}

  constructor() {
    this.agent = new WangcaiAgent()
  }

  /** 设置事件监听 */
  on(listeners: typeof this.listeners) {
    Object.assign(this.listeners, listeners)
  }

  /** 扫码登录微信 */
  async login(): Promise<boolean> {
    try {
      if (isLoggedIn()) {
        this.loggedIn = true
        return true
      }
      console.log('[旺财] 请扫描终端中的二维码登录微信...')
      this.accountId = await login()
      this.loggedIn = true
      this.listeners.onLogin?.(this.accountId)
      console.log(`[旺财] 微信登录成功! accountId=${this.accountId}`)
      return true
    } catch (err) {
      console.error('[旺财] 微信登录失败:', err)
      this.listeners.onError?.(err instanceof Error ? err.message : '登录失败')
      return false
    }
  }

  /** 检查是否已登录 */
  isLoggedIn(): boolean {
    return this.loggedIn && isLoggedIn()
  }

  /** 启动自动回复 */
  start(): boolean {
    if (!this.loggedIn) {
      console.error('[旺财] 请先登录微信')
      return false
    }

    // 包装 agent，加入事件监听
    const wrappedAgent: Agent = {
      chat: async (req: ChatRequest): Promise<ChatResponse> => {
        this.listeners.onMessage?.(req.conversationId, req.text)
        const res = await this.agent.chat(req)
        if (res.text) {
          this.listeners.onReply?.(req.conversationId, res.text)
        }
        return res
      },
      clearSession: (id: string) => this.agent.clearSession(id),
    }

    this.bot = start(wrappedAgent, { accountId: this.accountId || undefined })
    console.log('[旺财] 微信自动回复已启动!')
    return true
  }

  /** 主动发消息（群发/激活） */
  async broadcast(message: string): Promise<boolean> {
    if (!this.bot) {
      console.error('[旺财] 请先启动自动回复')
      return false
    }
    try {
      await this.bot.sendMessage(message)
      console.log(`[旺财] 群发消息: ${message.slice(0, 30)}`)
      return true
    } catch (err) {
      console.error('[旺财] 群发失败:', err)
      return false
    }
  }

  /** 停止 */
  stop() {
    this.bot = null
    console.log('[旺财] 微信自动回复已停止')
  }

  /** 登出 */
  logout() {
    logout()
    this.loggedIn = false
    this.bot = null
    this.accountId = null
    console.log('[旺财] 已登出微信')
  }
}

// 单例
let bridgeInstance: WeChatBridge | null = null
export function getWeChatBridge(): WeChatBridge {
  if (!bridgeInstance) {
    bridgeInstance = new WeChatBridge()
  }
  return bridgeInstance
}
