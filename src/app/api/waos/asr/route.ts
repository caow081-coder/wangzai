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
  let body: { audio?: string; format?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { audio, format = 'mp3' } = body || {}

  if (!audio || typeof audio !== 'string') {
    return NextResponse.json({ error: 'audio required (base64)' }, { status: 400 })
  }

  // 防止超大音频 base64 导致 OOM（限制 ~10MB base64 ≈ 7.5MB 二进制）
  if (audio.length > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'audio too large (max 10MB base64)' }, { status: 413 })
  }

  const startedAt = Date.now()

  try {
    const zai = await getZAI()
    const text = await zai.audio.asr.create({
      file: audio,
    })

    return NextResponse.json({
      success: true,
      text,
      format,
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
