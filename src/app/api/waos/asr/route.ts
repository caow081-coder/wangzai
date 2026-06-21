/**
 * WAOS ASR — 语音转文字 API
 *
 * POST /api/waos/asr
 *   { audio (base64), format }
 *
 * 用途: 客户发语音消息 → ASR转文字 → 送入AI对话处理
 */

import { NextRequest, NextResponse } from 'next/server'
import { getZAI } from '@/lib/zai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { audio, format = 'mp3' } = await req.json()

  if (!audio) {
    return NextResponse.json({ error: 'audio required (base64)' }, { status: 400 })
  }

  const startedAt = Date.now()

  try {
    const zai = await getZAI()
    const text = await zai.audio.asr.create({
      file: audio,
    })

    return NextResponse.json({
      text,
      latency: Date.now() - startedAt,
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
    service: 'WAOS ASR — 语音转文字',
    description: '客户发语音消息 → ASR转文字 → 送入AI对话',
    method: 'POST only',
    params: { audio: 'base64 encoded audio', format: 'mp3 (default)' },
  })
}
