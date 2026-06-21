/**
 * WAOS TTS — 人设语音生成 API
 *
 * POST /api/waos/tts
 *   { text, personaId, voice, config }
 *
 * 用途: 每个人设有自己的声线 → 文字转语音 → 发语音消息给客户
 *
 * 人设声线映射:
 *  - 顾问(🌿): 温暖男声
 *  - 逼单(🔥): 磁性男声
 *  - 客服(💧): 温柔女声
 *  - 教授(👨‍🏫): 沉稳男声
 *  - 宝妈(👩‍👧): 活泼女声
 */

import { NextRequest, NextResponse } from 'next/server'
import { getZAI } from '@/lib/zai'
import { filterOutput } from '@/lib/safety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 人设声线映射
const PERSONA_VOICES: Record<string, { name: string; desc: string; gender: 'male' | 'female'; speed: number }> = {
  consultant: { name: 'tongtong', desc: '温暖男声', gender: 'male', speed: 1.0 },
  closer:     { name: 'tongtong', desc: '磁性男声', gender: 'male', speed: 1.1 },
  service:    { name: 'yaoyao',   desc: '温柔女声', gender: 'female', speed: 0.9 },
  professor:  { name: 'tongtong', desc: '沉稳男声', gender: 'male', speed: 0.85 },
  mom:        { name: 'yaoyao',   desc: '活泼女声', gender: 'female', speed: 1.15 },
}

export async function POST(req: NextRequest) {
  let body: { text?: string; personaId?: string; config?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { text, personaId = 'consultant', config = {} } = body || {}

  if (!text || typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }

  // 防止超大文本请求 DoS（单次 TTS 最多 1000 字）
  if (text.length > 1000) {
    return NextResponse.json({ error: `text too long (max 1000 chars, got ${text.length})` }, { status: 413 })
  }

  // 安全过滤：防止 TTS 合成违规/价格承诺内容
  const filtered = filterOutput(text)
  if (filtered.filtered) {
    console.warn(`[TTS] 输入被安全过滤: personaId=${personaId} reason=${filtered.reason}`)
    return NextResponse.json({
      error: 'text contains banned content, refused',
      reason: filtered.reason,
      layer: filtered.layer,
    }, { status: 400 })
  }

  const startedAt = Date.now()
  const voice = PERSONA_VOICES[personaId] || PERSONA_VOICES.consultant

  try {
    // 使用 Z.AI TTS SDK
    const zai = await getZAI()
    const audioBuffer = await zai.audio.tts.create({
      input: text,
      voice: voice.name,
      speed: voice.speed,
      response_format: 'mp3',
    })

    // 返回 base64 音频
    const base64 = Buffer.from(audioBuffer).toString('base64')

    return NextResponse.json({
      success: true,
      audio: `data:audio/mp3;base64,${base64}`,
      voice: voice.desc,
      personaId,
      text,
      duration: Math.ceil(text.length / 4),  // 估算秒数
      latency: Date.now() - startedAt,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({
      error: errMsg,
      latency: Date.now() - startedAt,
      fallback: true,
      message: 'TTS 生成失败，请检查 Z.AI SDK 是否可用',
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'WAOS TTS — 人设语音生成',
    description: '每个人设有自己的声线，文字转语音后可发语音消息',
    voices: Object.entries(PERSONA_VOICES).map(([id, v]) => ({
      personaId: id,
      voice: v.name,
      desc: v.desc,
      gender: v.gender,
      speed: v.speed,
    })),
  })
}
