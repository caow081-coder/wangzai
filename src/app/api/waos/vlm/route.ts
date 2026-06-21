/**
 * WAOS VLM — 多模态图片理解 API
 *
 * POST /api/waos/vlm
 *   { image (base64 or URL), question, provider, config }
 *
 * 用途: 客户发截图（收款码/产品图/竞品截图）→ AI 看图理解 → 转文字送入对话
 *
 * 支持的 provider:
 *  1. zai    — Z.AI Vision（内置，无需Key）
 *  2. openai — OpenAI GPT-4o（需apiKey）
 *  3. doubao — 豆包多模态（需cookie，免费看图）
 *  4. qianwen — 通义千问VL（需apiKey）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getZAI } from '@/lib/zai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { image, question = '请描述这张图片的内容', provider = 'zai', config = {} } = await req.json()

  if (!image) {
    return NextResponse.json({ error: 'image required (base64 or URL)' }, { status: 400 })
  }

  const startedAt = Date.now()

  try {
    let description = ''

    switch (provider) {
      case 'zai': {
        const zai = await getZAI()
        const response = await zai.chat.completions.createVision({
          model: 'glm-4v',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: question },
              { type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` } },
            ],
          }],
          thinking: { type: 'disabled' },
        })
        description = response.choices?.[0]?.message?.content || ''
        break
      }

      case 'openai': {
        if (!config.apiKey) {
          return NextResponse.json({ error: 'apiKey required for openai VLM' }, { status: 400 })
        }
        const res = await fetch(`${config.apiUrl || 'https://api.openai.com/v1'}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model || 'gpt-4o-mini',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: question },
                { type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` } },
              ],
            }],
            max_tokens: 500,
          }),
          signal: AbortSignal.timeout(config.timeout || 30000),
        })
        const data = await res.json()
        description = data.choices?.[0]?.message?.content || ''
        break
      }

      case 'doubao': {
        // 豆包多模态逆向（需cookie，免费看图）
        if (!config.cookie) {
          return NextResponse.json({
            error: 'cookie required for doubao VLM',
            hint: '豆包支持免费图片理解。登录 doubao.com → F12 → 复制 Cookie',
          }, { status: 400 })
        }

        // 模式 A: Docker doubao2api 服务（推荐，支持多模态）
        if (config.dockerUrl) {
          try {
            const dRes = await fetch(`${config.dockerUrl}/v1/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.cookie}`,
              },
              body: JSON.stringify({
                model: config.model || 'doubao-pro-32k',
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'text', text: question },
                    { type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` } },
                  ],
                }],
                stream: false,
              }),
              signal: AbortSignal.timeout(config.timeout || 20000),
            })
            if (dRes.ok) {
              const dData = await dRes.json()
              description = dData.choices?.[0]?.message?.content || ''
              if (description) break
            }
          } catch {
            // Docker 未启动，走降级
          }
        }

        // 降级到 Z.AI VLM（doubao.com 直连不支持图片上传，必须用 Docker）
        const zai = await getZAI()
        let response
        try {
          response = await zai.chat.completions.createVision({
            model: 'glm-4v',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: question },
                { type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` } },
              ],
            }],
            thinking: { type: 'disabled' },
          })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'unknown'
          if (errMsg.includes('429') || errMsg.includes('Too many requests')) {
            return NextResponse.json({
              error: 'Z.AI Vision 限流，请稍后重试或配置 Docker doubao2api',
              latency: Date.now() - startedAt,
              retryAfter: 5,
            }, { status: 429 })
          }
          throw err
        }
        description = response.choices?.[0]?.message?.content || ''
        return NextResponse.json({
          description, latency: Date.now() - startedAt, provider: 'zai',
          warning: '豆包VLM需 Docker doubao2api 镜像（端口7446）。当前降级到 Z.AI Vision。',
          hint: '生产建议: docker compose 启动 wangchuxiaoji/doubao2api:latest',
        })
      }

      default:
        return NextResponse.json({ error: `Unknown VLM provider: ${provider}` }, { status: 400 })
    }

    return NextResponse.json({
      description,
      latency: Date.now() - startedAt,
      provider,
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'unknown',
      latency: Date.now() - startedAt,
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'WAOS VLM — 多模态图片理解',
    description: '客户发截图 → AI看图理解 → 转文字送入对话',
    providers: [
      { id: 'zai', name: 'Z.AI Vision (内置)', requiresKey: false },
      { id: 'openai', name: 'GPT-4o', requiresKey: true, fields: ['apiUrl', 'apiKey', 'model'] },
      { id: 'doubao', name: '豆包多模态 (逆向免费)', requiresKey: true, fields: ['cookie'], desc: '支持看图+对话' },
    ],
  })
}
