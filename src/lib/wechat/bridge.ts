/**
 * 旺财微信真实接入层 — 基于 weixin-agent-sdk (ClawBot)
 * 使用动态 import 避免编译时模块解析问题
 */

let sdk: any = null
async function loadSDK() {
  if (!sdk) {
    sdk = await import('weixin-agent-sdk')
  }
  return sdk
}

export interface IdentityVector {
  trust: number; intent: number; emotion: number; urgency: number; resistance: number; value: number
}

class WangcaiAgent {
  private conversations = new Map<string, string[]>()
  private identities = new Map<string, IdentityVector>()
  private personas: any[] = []

  setPersonas(personas: any[]) { this.personas = personas }

  async chat(request: any): Promise<any> {
    const { conversationId, text, media } = request
    console.log(`[旺财] 收到微信消息 from ${conversationId}: ${text}`)

    let userContent = text
    if (media?.type === 'image') userContent = `[图片] ${text || '请描述这张图片'}`

    // 快速规则引擎
    const { fastRuleEngine } = await import('@/lib/identity/kernel')
    const fastReply = fastRuleEngine(userContent)
    if (fastReply.handled) return { text: fastReply.reply }

    // 身份漂移
    const { inferDelta, driftIdentity, compilePersona, compileActionPlan, validatePlan } = await import('@/lib/identity/kernel')
    const currentIdentity = this.identities.get(conversationId) ?? { trust: 30, intent: 20, emotion: 50, urgency: 20, resistance: 30, value: 40 }
    const delta = inferDelta(userContent)
    const newIdentity = driftIdentity(currentIdentity, delta)
    this.identities.set(conversationId, newIdentity)

    // 人格编译
    let personaContext = ''
    if (this.personas.length > 0) {
      const blend = compilePersona(newIdentity, this.personas)
      personaContext = `\n[系统] 客户状态: 信任${newIdentity.trust} 意图${newIdentity.intent} 情绪${newIdentity.emotion}\n[系统] 策略: ${blend.strategy}\n[系统] 人格: ${blend.blends.map((b:any) => `${b.personaName}${b.weight}%`).join('+')}`
    }

    // AI 大脑
    const history = this.conversations.get(conversationId) ?? []
    history.push(userContent)
    try {
      const messages = history.map((t, i) => ({ role: i % 2 === 0 ? 'user' as const : 'assistant' as const, content: t }))
      if (personaContext && messages.length > 0) {
        const lastUser = [...messages].reverse().find(m => m.role === 'user')
        if (lastUser) lastUser.content = personaContext + '\n\n客户: ' + lastUser.content
      }
      const res = await fetch('http://localhost:3000/api/waos/brain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model: 'auto', cookies: {} }),
      })
      const data = await res.json()
      const reply = data.reply || '抱歉，我没听懂'
      history.push(reply)
      this.conversations.set(conversationId, history.slice(-20))

      // Action DSL
      const plan = compileActionPlan(reply, 0.8)
      const validation = validatePlan(plan)
      if (!validation.valid) return { text: '抱歉，我需要确认一下~' }

      return { text: reply }
    } catch { return { text: '抱歉，请稍等~' } }
  }

  clearSession(id: string) { this.conversations.delete(id); this.identities.delete(id) }
  getIdentity(id: string): IdentityVector | null { return this.identities.get(id) ?? null }
}

export class WeChatBridge {
  private agent: WangcaiAgent
  private bot: any = null
  private loggedIn = false
  private accountId: string | null = null
  private listeners: any = {}

  constructor() { this.agent = new WangcaiAgent() }

  on(listeners: any) { Object.assign(this.listeners, listeners) }

  async login(): Promise<boolean> {
    try {
      const sdk = await loadSDK()
      if (sdk.isLoggedIn()) { this.loggedIn = true; return true }
      this.accountId = await sdk.login()
      this.loggedIn = true
      this.listeners.onLogin?.(this.accountId)
      return true
    } catch (err) {
      this.listeners.onError?.(err instanceof Error ? err.message : '登录失败')
      return false
    }
  }

  isLoggedIn(): boolean { return this.loggedIn }
  start(): boolean {
    if (!this.loggedIn) return false
    const wrappedAgent = {
      chat: async (req: any) => {
        this.listeners.onMessage?.(req.conversationId, req.text)
        const res = this.agent.chat(req)
        const r = await res
        if (r.text) this.listeners.onReply?.(req.conversationId, r.text)
        return r
      },
      clearSession: (id: string) => this.agent.clearSession(id),
    }
    const sdk = loadSDK()
    sdk.then(s => { this.bot = s.start(wrappedAgent, { accountId: this.accountId || undefined }) })
    return true
  }

  async broadcast(message: string): Promise<boolean> {
    if (!this.bot) return false
    try { await this.bot.sendMessage(message); return true } catch { return false }
  }

  stop() { this.bot = null }
  logout() {
    loadSDK().then(s => s.logout())
    this.loggedIn = false; this.bot = null; this.accountId = null
  }
}

let bridgeInstance: WeChatBridge | null = null
export function getWeChatBridge(): WeChatBridge {
  if (!bridgeInstance) bridgeInstance = new WeChatBridge()
  return bridgeInstance
}
