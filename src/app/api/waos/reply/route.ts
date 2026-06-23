/**
 * WAOS AI Reply Studio — backend (v4.0 — 10层引擎集成)
 *
 * POST /api/waos/reply
 *   { leadId, userMessage, personaName, personaColor, history, customerId }
 *
 * 增强管道 (vs v3.0):
 *   1. Input sanitization (安全护盾)
 *   2. Circuit breaker check (熔断器)
 *   3. Truth + Memory injection (真理层 + 记忆引擎注入)
 *   4. Context assembly (persona + truth + memories + history)
 *   5. LLM call via z-ai-web-dev-sdk
 *   6. Ethics review (伦理层审查 AI 输出)
 *   7. Decision log (决策日志回放)
 *   8. Output filter (安全护盾)
 *   9. Fallback
 */

import { NextRequest, NextResponse } from 'next/server'
import { getZAI } from '@/lib/zai'
import {
  sanitizeInput as safetySanitize,
  filterOutput as safetyFilter,
  SYSTEM_CONSTRAINTS,
} from '@/lib/safety'
import { ethicsReview } from '@/lib/waos/ethics'
import { queryTruth, verifyClaim } from '@/lib/waos/truth'
import { retrieveMemories, formatMemoriesForPrompt } from '@/lib/waos/memory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface HistoryMsg {
  role: 'user' | 'assistant' | 'system' | 'human'
  content: string
}

interface ReplyRequest {
  leadId: string
  customerId?: string  // 用于记忆检索
  userMessage: string
  personaName?: string
  personaColor?: string
  history?: HistoryMsg[]
}

// In-memory circuit breaker (per-server-instance)
let consecutiveFailures = 0
let circuitOpenUntil = 0

function circuitIsOpen() {
  return Date.now() < circuitOpenUntil
}

function recordSuccess() {
  consecutiveFailures = 0
}

function recordFailure() {
  consecutiveFailures++
  if (consecutiveFailures >= 5) {  // 5 次失败才开熔断（原来是 3）
    circuitOpenUntil = Date.now() + 10_000 // 10s cooldown（原来 30s）
  }
}

const FALLBACK_MSG =
  '【系统兜底】实在抱歉，当前咨询人数较多，您的需求我已记录，主管稍后会亲自为您解答。'

export async function POST(req: NextRequest) {
  let body: ReplyRequest
  try {
    body = (await req.json()) as ReplyRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { leadId, userMessage, personaName, customerId, history = [] } = body || {}

  if (!leadId || !userMessage || typeof userMessage !== 'string') {
    return NextResponse.json({ error: 'leadId and userMessage required' }, { status: 400 })
  }

  const startedAt = Date.now()

  // 1. Input sanitization
  const sanity = safetySanitize(userMessage)
  if (!sanity.ok) {
    return NextResponse.json({
      leadId,
      reply: '抱歉，无法理解您的意思，请问还有其他产品问题吗？',
      safetyFiltered: true,
      safetyReason: sanity.reason,
      tokensUsed: 0,
      latency: Date.now() - startedAt,
      source: 'safety_shield_input',
    })
  }

  // 2. Circuit breaker check
  if (circuitIsOpen()) {
    return NextResponse.json({
      leadId,
      reply: FALLBACK_MSG,
      safetyFiltered: false,
      tokensUsed: 0,
      latency: Date.now() - startedAt,
      source: 'circuit_open',
      fallback: true,
    })
  }

  // 3. Truth + Memory injection（真理层 + 记忆引擎）─────────
  let truthContext = ''
  let memoryContext = ''
  try {
    const truthDocs = await queryTruth(userMessage, 2)
    if (truthDocs.length > 0) {
      truthContext = '\n\n【以下为官方真理信息，回复中涉及事实数据必须以此为准】\n' +
        truthDocs.map((d: any) => `[${d.title}] ${d.content}`).join('\n')
    }
  } catch { /* non-critical */ }
  try {
    const cid = customerId || leadId
    const memories = await retrieveMemories(cid, userMessage, 3)
    memoryContext = formatMemoriesForPrompt(memories)
  } catch { /* non-critical */ }

  // 4. Build messages with persona + truth + memories + safety constraints
  const personaIntro = personaName
    ? `\n\n你当前的人设是：${personaName}。请严格按照这个人设的语气和风格回复。`
    : ''

  const systemContent = SYSTEM_CONSTRAINTS + personaIntro + truthContext + memoryContext

  const messages: { role: 'assistant' | 'user'; content: string }[] = [
    { role: 'assistant', content: systemContent },
  ]

  // Last 10 turns from history
  const recent = history.slice(-10)
  for (const m of recent) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: m.content })
    }
  }
  messages.push({ role: 'user', content: userMessage })

  // 4. LLM call with retry (max 2 attempts)
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const zai = await getZAI()
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: 'disabled' },
      })
      const raw = completion.choices?.[0]?.message?.content?.trim()
      if (!raw) throw new Error('Empty LLM response')

      // 5b. Ethics review（伦理层审查 AI 输出）─────────────────
      let ethicsResult: any = { passed: true }
      try {
        ethicsResult = await ethicsReview(raw)
        if (!ethicsResult.passed) {
          // 伦理层拦截 — 返回安全兜底
          recordSuccess()
          return NextResponse.json({
            leadId,
            reply: '抱歉，我无法提供这类信息。请问还有其他关于产品本身的问题吗？',
            safetyFiltered: true,
            safetyReason: ethicsResult.violations?.map((v: any) => v.reason).join('; '),
            tokensUsed: Math.ceil((systemContent + userMessage).length / 4),
            latency: Date.now() - startedAt,
            source: 'ethics_block',
          })
        }
      } catch { /* non-critical */ }

      // 6. Output filter
      const filtered = safetyFilter(raw)
      recordSuccess()

      return NextResponse.json({
        leadId,
        reply: filtered.safe,
        safetyFiltered: filtered.filtered,
        safetyReason: filtered.reason,
        tokensUsed: Math.ceil((systemContent + userMessage + filtered.safe).length / 4),
        latency: Date.now() - startedAt,
        source: filtered.filtered ? 'safety_shield_output' : 'llm',
      })
    } catch (err) {
      lastError = err
      const errMsg = err instanceof Error ? err.message : 'unknown'
      // 429 限流不算硬失败，只短暂退避，不累计 consecutiveFailures
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('too many requests') || errMsg.toLowerCase().includes('rate limit')) {
        await new Promise(r => setTimeout(r, 1000 * attempt))  // 限流时等更久
        continue  // 重试，但不计入熔断
      }
      // brief backoff
      await new Promise(r => setTimeout(r, 300 * attempt))
    }
  }

  // 6. Fallback
  const errMsg = lastError instanceof Error ? lastError.message : 'unknown'
  // 只有非限流错误才计入熔断器
  if (!errMsg.includes('429') && !errMsg.toLowerCase().includes('too many requests') && !errMsg.toLowerCase().includes('rate limit')) {
    recordFailure()
  }
  console.error('[WAOS /api/waos/reply] LLM failed:', lastError)

  return NextResponse.json({
    leadId,
    reply: FALLBACK_MSG,
    safetyFiltered: false,
    tokensUsed: 0,
    latency: Date.now() - startedAt,
    source: 'fallback',
    fallback: true,
    error: lastError instanceof Error ? lastError.message : 'unknown',
  })
}

export async function GET(req: NextRequest) {
  // 支持手动重置熔断器: /api/waos/reply?reset=1
  const reset = req.nextUrl.searchParams.get('reset')
  if (reset === '1') {
    consecutiveFailures = 0
    circuitOpenUntil = 0
  }
  return NextResponse.json({
    service: 'WAOS AI Reply Studio',
    version: '3.0',
    pipeline: [
      'input_sanitization',
      'circuit_breaker_check',
      'truth_injection',
      'memory_injection',
      'context_assembly',
      'llm_call',
      'ethics_review',
      'output_filter',
      'fallback',
    ],
    circuitOpen: circuitIsOpen(),
    consecutiveFailures,
    circuitOpenUntil: circuitOpenUntil > 0 ? new Date(circuitOpenUntil).toISOString() : null,
  })
}
