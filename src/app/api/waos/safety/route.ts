/**
 * WAOS Safety Shield inspect endpoint
 * GET /api/waos/safety
 *   Inspect what the SafetyShield would do with a given input/output
 * POST /api/waos/safety
 *   { input, output } -> { inputSanitized, outputFiltered, reason }
 *
 * 使用共享 @/lib/safety 模块，与 /api/waos/reply 行为完全一致。
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  BANNED_KEYWORDS,
  INJECTION_PATTERNS,
  PRICE_PROMISE_PATTERN,
  sanitizeInput,
  filterOutput,
} from '@/lib/safety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    service: 'WAOS SafetyShield',
    bannedKeywords: BANNED_KEYWORDS,
    injectionPatterns: INJECTION_PATTERNS.map(p => p.source),
    pricePromisePattern: PRICE_PROMISE_PATTERN.source,
    constraints: [
      'No specific price promises (e.g. 5折, 立减100元)',
      'No competitor links or off-platform contact',
      'No fabricated product info',
      'Polite refusal on sensitive topics',
      'Never reveal AI identity',
    ],
    defenseLayers: [
      'Layer 1: Prompt injection detection (CN+EN regex)',
      'Layer 2: Banned keyword detection',
      'Layer 3: Price promise detection',
      'Anti-bypass: Unicode NFKC normalization + whitespace stripping',
    ],
  })
}

export async function POST(req: NextRequest) {
  let input: string | undefined
  let output: string | undefined
  try {
    const body = await req.json()
    input = body?.input
    output = body?.output
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result: {
    inputSanitized: boolean
    inputReason?: string
    inputLayer?: string
    outputFiltered: boolean
    outputReason?: string
    outputLayer?: string
    safeOutput?: string
  } = { inputSanitized: true, outputFiltered: false }

  if (input && typeof input === 'string') {
    const r = sanitizeInput(input)
    result.inputSanitized = r.ok
    if (!r.ok) {
      result.inputReason = r.reason
      result.inputLayer = r.layer
    }
  }
  if (output && typeof output === 'string') {
    const r = filterOutput(output)
    result.outputFiltered = r.filtered
    result.safeOutput = r.safe
    if (r.filtered) {
      result.outputReason = r.reason
      result.outputLayer = r.layer
    }
  }
  return NextResponse.json(result)
}
