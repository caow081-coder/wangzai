/**
 * 旺财微信真实接入 API
 *
 * POST /api/waos/wechat/login   — 扫码登录（返回二维码终端提示）
 * POST /api/waos/wechat/start   — 启动自动回复
 * POST /api/waos/wechat/broadcast — 群发消息
 * POST /api/waos/wechat/stop    — 停止
 * GET  /api/waos/wechat/status  — 状态
 *
 * 基于 weixin-agent-sdk (ClawBot) 实现真实微信收发
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWeChatBridge } from '@/lib/wechat/bridge'
import { sanitizeInput } from '@/lib/safety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bridge = getWeChatBridge()

// 全局状态
let botRunning = false
let loginStatus = false
let messageCount = 0
let replyCount = 0

// 设置事件监听
bridge.on({
  onMessage: (from: string, text: string) => {
    messageCount++
    console.log(`[WECHAT] 收到消息 from ${from}: ${text.slice(0, 50)}`)
  },
  onReply: (to: string, text: string) => {
    replyCount++
    console.log(`[WECHAT] 发送回复 to ${to}: ${text.slice(0, 50)}`)
  },
  onLogin: (accountId: string) => {
    loginStatus = true
    console.log(`[WECHAT] 登录成功: ${accountId}`)
  },
  onError: (err: string | Error) => {
    console.error(`[WECHAT] 错误: ${err}`)
  },
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = body.action

  try {
    switch (action) {
      case 'login': {
        // 超时保护：API 层 15s 超时，避免前端长时间等待
        const loginPromise = bridge.login()
        const timeoutPromise = new Promise<false>((resolve) => setTimeout(() => resolve(false), 15000))
        const ok = await Promise.race([loginPromise, timeoutPromise])
        return NextResponse.json({
          action: 'login',
          success: ok,
          loggedIn: bridge.isLoggedIn(),
          message: ok ? '登录成功，已开始监听消息' : '登录超时或失败，请确保微信客户端已启动并扫码（最长等待 120 秒）',
          tip: ok ? undefined : '在 Windows Electron 端点击「微信连接」按钮，扫码后即可自动收发消息',
        })
      }

      case 'start': {
        if (!bridge.isLoggedIn()) {
          return NextResponse.json({
            action: 'start',
            success: false,
            error: '请先登录微信',
          }, { status: 400 })
        }
        const ok = bridge.start()
        botRunning = ok
        return NextResponse.json({
          action: 'start',
          success: ok,
          running: botRunning,
          message: ok ? '微信自动回复已启动' : '启动失败',
        })
      }

      case 'broadcast': {
        if (!botRunning) {
          return NextResponse.json({
            action: 'broadcast',
            success: false,
            error: '请先启动自动回复',
          }, { status: 400 })
        }
        if (!body.message || typeof body.message !== 'string') {
          return NextResponse.json({
            action: 'broadcast',
            success: false,
            error: 'message required (non-empty string)',
          }, { status: 400 })
        }
        // 安全过滤：群发消息必须过 SafetyShield
        const sanity = sanitizeInput(body.message)
        if (!sanity.ok) {
          console.warn(`[WECHAT] broadcast 被安全拦截: ${sanity.reason}`)
          return NextResponse.json({
            action: 'broadcast',
            success: false,
            error: `消息未过安全检测: ${sanity.reason}`,
            layer: sanity.layer,
          }, { status: 400 })
        }
        const ok = await bridge.broadcast(body.message)
        return NextResponse.json({
          action: 'broadcast',
          success: ok,
          message: body.message?.slice(0, 50),
        })
      }

      case 'stop': {
        bridge.stop()
        botRunning = false
        return NextResponse.json({
          action: 'stop',
          success: true,
          running: false,
        })
      }

      case 'logout': {
        bridge.logout()
        botRunning = false
        loginStatus = false
        return NextResponse.json({
          action: 'logout',
          success: true,
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[WECHAT] action=${action} 失败:`, errMsg)
    return NextResponse.json({
      action,
      success: false,
      error: errMsg,
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    service: '旺财微信真实接入 (ClawBot)',
    loggedIn: bridge.isLoggedIn(),
    running: botRunning,
    messageCount,
    replyCount,
    sdk: 'weixin-agent-sdk@0.5.0',
    actions: ['login', 'start', 'broadcast', 'stop', 'logout'],
  })
}
