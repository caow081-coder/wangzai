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
  onMessage: (from, text) => {
    messageCount++
    console.log(`[WECHAT] 收到消息 from ${from}: ${text.slice(0, 50)}`)
  },
  onReply: (to, text) => {
    replyCount++
    console.log(`[WECHAT] 发送回复 to ${to}: ${text.slice(0, 50)}`)
  },
  onLogin: (accountId) => {
    loginStatus = true
    console.log(`[WECHAT] 登录成功: ${accountId}`)
  },
  onError: (err) => {
    console.error(`[WECHAT] 错误: ${err}`)
  },
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = body.action

  switch (action) {
    case 'login': {
      try {
        const ok = await bridge.login()
        return NextResponse.json({
          action: 'login',
          success: ok,
          loggedIn: bridge.isLoggedIn(),
          message: ok ? '请在终端扫描二维码登录微信' : '登录失败',
        })
      } catch (err) {
        return NextResponse.json({
          action: 'login',
          success: false,
          error: err instanceof Error ? err.message : 'unknown',
        }, { status: 500 })
      }
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
