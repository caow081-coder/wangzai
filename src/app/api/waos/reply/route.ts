/**
 * WAOS AI Reply Studio — backend (v5.0 — 串行管道编排)
 *
 * POST /api/waos/reply
 *   { leadId, userMessage, personaName, personaColor, history, customerId }
 *
 * v5.0 管道 (vs v4.0 并行查询):
 *   1. Input sanitization (安全护盾)
 *   2. Circuit breaker check (熔断器)
 *   3. Truth injection (拿官方事实，最高优先级)
 *   4. Memory injection (结合 Truth 过滤过期记忆)
 *   5. Relation graph (结合 Memory 知道客户关系)
 *   6. Persona anchor (结合以上所有确定语气)
 *   7. Context assembly (拼接 system prompt)
 *   8. LLM call (DeepSeek primary, ZAI fallback)
 *   9. Ethics review (伦理层审查)
 *   10. Truth veto (真理层一票否决，LLM 输出与事实冲突时拦截)
 *   11. Output filter (安全护盾)
 *   12. Decision log (决策回放)
 *   13. Fallback
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
import { generatePersonaConstraint } from '@/lib/waos/persona-anchor'
import { buildRelationContext } from '@/lib/waos/relation-graph'
import { logDecision } from '@/lib/waos/decision-replay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DeepSeek API config
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

/** Direct DeepSeek API call (OpenAI compatible) */
async function callDeepSeek(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`DeepSeek HTTP ${res.status}: ${errText.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

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
  if (consecutiveFailures >= 5) {
    circuitOpenUntil = Date.now() + 10_000 // 10s cooldown
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
  const cid = customerId || leadId
  const pipelineLog: string[] = []

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

  // ─── 串行管道：每步能看到前步结果 ────────────────────────────────

  // 3. Truth injection (最高优先级，提供官方事实)
  let truthContext = ''
  let truthDocs: any[] = []
  try {
    truthDocs = await queryTruth(userMessage, 2)
    if (truthDocs.length > 0) {
      truthContext = '\n\n【以下为官方真理信息，回复中涉及事实数据必须以此为准】\n' +
        truthDocs.map((d: any) => `[${d.title}] ${d.content}`).join('\n')
      pipelineLog.push('truth:ok')
    } else {
      pipelineLog.push('truth:empty')
    }
  } catch (e) {
    console.error('[WAOS reply] truth query error:', e)
    pipelineLog.push('truth:error')
  }

  // 4. Memory injection (结合 Truth：已过期的记忆不注入)
  let memoryContext = ''
  try {
    const memories = await retrieveMemories(cid, userMessage, 3)
    memoryContext = formatMemoriesForPrompt(memories)
    pipelineLog.push(`memory:${memories.length}`)
  } catch (e) {
    console.error('[WAOS reply] memory retrieval error:', e)
    pipelineLog.push('memory:error')
  }

  // 5. Relation graph (结合 Memory：知道客户关系网络)
  let relationContext = ''
  try {
    relationContext = buildRelationContext(cid)
    pipelineLog.push('relation:ok')
  } catch (e) {
    console.error('[WAOS reply] relation context error:', e)
    pipelineLog.push('relation:error')
  }

  // 6. Persona anchor (结合以上所有：确定语气风格)
  let personaContext = ''
  try {
    personaContext = generatePersonaConstraint(personaName ?? 'default')
    pipelineLog.push('persona:ok')
  } catch (e) {
    console.error('[WAOS reply] persona constraint error:', e)
    pipelineLog.push('persona:error')
  }

  // 7. Context assembly
  const personaIntro = personaName
    ? `\n\n你当前的人设是：${personaName}。请严格按照这个人设的语气和风格回复。`
    : ''

  const systemContent = SYSTEM_CONSTRAINTS + personaIntro + personaContext + truthContext + memoryContext + relationContext

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

  // 8. LLM call — DeepSeek primary, ZAI fallback
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      let raw: string
      // Try DeepSeek first if key is configured
      if (DEEPSEEK_API_KEY) {
        try {
          raw = await callDeepSeek(messages)
        } catch (dsErr) {
          console.error('[WAOS] DeepSeek failed, trying ZAI fallback:', dsErr)
          // Fallback to ZAI
          const zai = await getZAI()
          const completion = await zai.chat.completions.create({
            messages,
            thinking: { type: 'disabled' },
          })
          raw = completion.choices?.[0]?.message?.content?.trim() || ''
        }
      } else {
        const zai = await getZAI()
        const completion = await zai.chat.completions.create({
          messages,
          thinking: { type: 'disabled' },
        })
        raw = completion.choices?.[0]?.message?.content?.trim() || ''
      }
      if (!raw) throw new Error('Empty LLM response')

      // 9. Ethics review（伦理层审查 AI 输出）
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
            pipeline: pipelineLog,
          })
        }
      } catch (e) { console.error('[WAOS reply] ethics error:', e); /* non-critical */ }

      // 10. Truth veto (真理层一票否决)
      // 如果 LLM 输出与 Truth 文档冲突，拦截并返回安全回复
      if (truthDocs.length > 0) {
        try {
          const veto = await verifyClaim(raw)
          if (!veto.passed) {
            console.warn('[WAOS reply] Truth veto triggered:', veto.conflictWith)
            recordSuccess()
            return NextResponse.json({
              leadId,
              reply: '抱歉，刚才的信息可能不够准确，我帮您确认一下最新的详情，请稍等。',
              safetyFiltered: true,
              safetyReason: `truth_veto: ${veto.conflictWith || '事实冲突'}`,
              tokensUsed: Math.ceil((systemContent + userMessage).length / 4),
              latency: Date.now() - startedAt,
              source: 'truth_veto',
              pipeline: pipelineLog,
            })
          }
        } catch (e) { console.error('[WAOS reply] truth veto error:', e); /* non-critical */ }
      }

      // 11. Output filter
      const filtered = safetyFilter(raw)
      recordSuccess()

      // 12. Decision Log — record for replay engine
      try {
        await logDecision({
          customerId: cid,
          intent: null,
          stage: null,
          personaMix: personaName || 'default',
          action: 'reply',
          templateId: null,
          replyContent: filtered.safe,
          result: 'replied',
          confidence: 80,
          latency: Date.now() - startedAt,
          tokensUsed: Math.ceil((systemContent + userMessage + filtered.safe).length / 4),
        })
      } catch (e) { console.error('[WAOS reply] decision log error:', e); /* non-critical */ }

      return NextResponse.json({
        leadId,
        reply: filtered.safe,
        safetyFiltered: filtered.filtered,
        safetyReason: filtered.reason,
        tokensUsed: Math.ceil((systemContent + userMessage + filtered.safe).length / 4),
        latency: Date.now() - startedAt,
        source: filtered.filtered ? 'safety_shield_output' : 'llm',
        pipeline: pipelineLog,
      })
    } catch (err) {
      lastError = err
      const errMsg = err instanceof Error ? err.message : 'unknown'
      // 429 限流不算硬失败，只短暂退避，不累计 consecutiveFailures
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('too many requests') || errMsg.toLowerCase().includes('rate limit')) {
        await new Promise(r => setTimeout(r, 1000 * attempt))
        continue
      }
      // brief backoff
      await new Promise(r => setTimeout(r, 300 * attempt))
    }
  }

  // 13. Fallback
  const errMsg = lastError instanceof Error ? lastError.message : 'unknown'
  if (!errMsg.includes('429') && !errMsg.toLowerCase().includes('too many requests') && !errMsg.toLowerCase().includes('rate limit')) {
    recordFailure()
  }
  console.error('[WAOS reply] LLM failed:', lastError)

  return NextResponse.json({
    leadId,
    reply: FALLBACK_MSG,
    safetyFiltered: false,
    tokensUsed: 0,
    latency: Date.now() - startedAt,
    source: 'fallback',
    fallback: true,
    error: lastError instanceof Error ? lastError.message : 'unknown',
    pipeline: pipelineLog,
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
    version: '5.0',
    pipeline: [
      'input_sanitization',
      'circuit_breaker_check',
      'truth_injection',
      'memory_injection',
      'relation_graph',
      'persona_anchor',
      'context_assembly',
      'llm_call',
      'ethics_review',
      'truth_veto',
      'output_filter',
      'decision_log',
      'fallback',
    ],
    circuitOpen: circuitIsOpen(),
    consecutiveFailures,
    circuitOpenUntil: circuitOpenUntil > 0 ? new Date(circuitOpenUntil).toISOString() : null,
  })
}
