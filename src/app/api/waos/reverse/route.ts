/**
 * WAOS 逆向服务管理器
 *
 * 固化到软件里的逆向方案：
 * 1. 豆包逆向 (doubao-2api) — Docker 部署，多账号 Cookie 轮询
 * 2. Groq 官方免费层 — 注册即用，无需 Cookie
 * 3. DeepSeek 官方 — 极低价，国产最强推理
 *
 * POST /api/waos/reverse
 *   { action, serviceId, cookie, apiKey }
 *
 * action:
 *  - check-cookie: 检查 Cookie 有效性
 *  - check-docker: 检查 Docker 逆向服务是否运行
 *  - generate-compose: 生成 docker-compose.yml
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REVERSE_SERVICES = [
  {
    id: 'groq',
    name: 'Groq 官方免费层',
    type: 'official-free',
    description: '无需逆向，注册即用，月 $500 免费额度，500+ tok/s 超快',
    dockerRequired: false,
    apiEndpoint: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-4-scout-17b-16e-instruct'],
    multimodal: true,
    voice: true,
    requiresKey: true,
    requiresCookie: false,
    stable: true,
    setupSteps: [
      '访问 console.groq.com 注册（支持 GitHub/Google 登录）',
      '进入 API Keys 页面创建 Key',
      '复制 Key 填入输入框',
      '点击测试连接',
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 官方 API',
    type: 'official-free',
    description: '极低价（¥1/百万token），OpenAI 兼容，国产最强推理',
    dockerRequired: false,
    apiEndpoint: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    multimodal: false,
    voice: false,
    requiresKey: true,
    requiresCookie: false,
    stable: true,
    setupSteps: [
      '访问 platform.deepseek.com 注册',
      '充值 ¥10 即可使用很久',
      '创建 API Key',
      '填入输入框',
    ],
  },
  {
    id: 'doubao',
    name: '豆包逆向 (doubao-2api)',
    type: 'reverse',
    description: '免费多模态（看图+对话+文生图），需 Cookie+Docker',
    dockerRequired: true,
    dockerImage: 'lza6/doubao-2api:latest',
    dockerCompose: `version: '3'
services:
  doubao-2api:
    image: lza6/doubao-2api:latest
    ports:
      - "7445:7445"
    environment:
      - DOUBAO_COOKIE=__COOKIE__
      - MULTIPLE_COOKIE=__MULTI_COOKIE__
    restart: unless-stopped`,
    apiEndpoint: 'http://localhost:7445/v1',
    models: ['doubao-pro', 'doubao-lite'],
    multimodal: true,
    voice: false,
    requiresKey: false,
    requiresCookie: true,
    multiAccount: true,
    stable: false,
    warning: '逆向方案天然不稳定，Cookie 可能随时过期。多账号轮询可提高稳定性。参考: github.com/lza6/doubao-2api',
    setupSteps: [
      '安装 Docker: https://docker.com',
      '登录 doubao.com（建议无痕模式）',
      'F12 → Network → 复制 Cookie 值',
      '点击下方"生成 Docker 配置"按钮',
      '运行 docker compose up -d 启动逆向服务',
      '在输入框填入 Cookie（多个用逗号分隔）',
      '点击测试连接',
    ],
  },
  {
    id: 'doubao-mm',
    name: '豆包多模态 (doubao2api)',
    type: 'reverse',
    description: '聊天+图片生成+视频生成+音乐生成，功能最全',
    dockerRequired: true,
    dockerImage: 'wangchuxiaoji/doubao2api:latest',
    dockerCompose: `version: '3'
services:
  doubao2api:
    image: wangchuxiaoji/doubao2api:latest
    ports:
      - "7446:7446"
    environment:
      - DOUBAO_COOKIE=__COOKIE__
    restart: unless-stopped`,
    apiEndpoint: 'http://localhost:7446/v1',
    models: ['doubao-pro-32k', 'doubao-pro-128k'],
    multimodal: true,
    voice: false,
    requiresKey: false,
    requiresCookie: true,
    multiAccount: false,
    stable: false,
    warning: '支持图/视频/音乐生成，稳定性不如 doubao-2api',
    setupSteps: [
      '同 doubao-2api 步骤',
      'Docker 镜像: wangchuxiaoji/doubao2api',
      '端口 7446',
    ],
  },
]

export async function GET() {
  return NextResponse.json({
    service: 'WAOS 逆向服务管理器',
    services: REVERSE_SERVICES,
    recommendation: {
      primary: 'Groq 官方免费层 — 无门槛，注册即用，月 $500 免费',
      secondary: 'DeepSeek 官方 — 极低价，国产最强推理',
      advanced: '豆包逆向 — 免费多模态，需 Docker + Cookie',
    },
  })
}

export async function POST(req: NextRequest) {
  let body: { action?: string; serviceId?: string; cookie?: string; apiKey?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  // 兼容 action 缺失时的清晰报错
  const { action, serviceId, cookie, apiKey } = body || {}

  if (!action) {
    return NextResponse.json({
      error: 'action required',
      availableActions: ['check-cookie', 'check-docker', 'generate-compose'],
    }, { status: 400 })
  }

  try {
    switch (action) {
      case 'check-cookie': {
        if (!cookie) {
          return NextResponse.json({ valid: false, reason: 'Cookie 为空' })
        }
        const hasSessionId = cookie.includes('sessionid')
        const hasSidGuard = cookie.includes('sid_guard') || cookie.includes('sid_tt')
        const valid = hasSessionId || hasSidGuard
        return NextResponse.json({
          valid,
          reason: valid ? 'Cookie 格式正确' : 'Cookie 缺少 sessionid 或 sid_guard 字段',
          fields: { sessionid: hasSessionId, sid_guard: cookie.includes('sid_guard'), sid_tt: cookie.includes('sid_tt') },
          tip: valid ? '建议配置多个 Cookie 轮询防风控' : '请重新登录 doubao.com 获取完整 Cookie',
        })
      }

      case 'check-docker': {
        const service = REVERSE_SERVICES.find(s => s.id === serviceId)
        if (!service?.dockerRequired) {
          return NextResponse.json({ running: true, message: '该服务无需 Docker' })
        }
        try {
          const endpoint = service.apiEndpoint?.replace('/v1', '') || ''
          const res = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null)
          return NextResponse.json({
            running: res?.ok || false,
            endpoint: service.apiEndpoint,
            message: res?.ok ? 'Docker 逆向服务运行中' : `Docker 未启动。镜像: ${service.dockerImage}`,
          })
        } catch {
          return NextResponse.json({ running: false, message: `Docker 服务未启动` })
        }
      }

      case 'generate-compose': {
        const service = REVERSE_SERVICES.find(s => s.id === serviceId)
        if (!service?.dockerCompose) {
          return NextResponse.json({ error: '该服务不支持 Docker' }, { status: 400 })
        }
        // Cookie 可能是单个或多个（逗号分隔），两种占位符都替换
        const cookieValue = cookie || 'YOUR_COOKIE_HERE'
        const firstCookie = cookieValue.split(',')[0].trim()
        const multiCookieValue = cookieValue.includes(',') ? cookieValue : `${cookieValue},COOKIE2,COOKIE3`
        const compose = service.dockerCompose
          .replace(/__COOKIE__/g, firstCookie)
          .replace(/__MULTI_COOKIE__/g, multiCookieValue)
        return NextResponse.json({
          dockerCompose: compose,
          filename: 'docker-compose.reverse.yml',
          instructions: ['保存为 docker-compose.reverse.yml', '运行 docker compose up -d', '等待 5 秒后点测试连接'],
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[REVERSE] action=${action} 失败:`, errMsg)
    return NextResponse.json({ action, error: errMsg }, { status: 500 })
  }
}
