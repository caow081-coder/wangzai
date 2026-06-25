/**
 * WAOS Engines API — 核心引擎接口
 *
 * POST   /api/waos/engines/verify     — 真理层验证
 * POST   /api/waos/engines/ethics     — 伦理审查
 * GET    /api/waos/engines/memory     — 记忆检索
 * POST   /api/waos/engines/memory     — 触发记忆压缩
 * GET    /api/waos/engines/relation   — 关系图谱
 * POST   /api/waos/engines/decision   — 决策日志记录
 * GET    /api/waos/engines/decision   — 成交路径分析
 * POST   /api/waos/engines/learning   — 触发夜间训练
 * GET    /api/waos/engines/learning   — 审核队列
 * PATCH  /api/waos/engines/learning   — 审核批准/拒绝
 * GET    /api/waos/engines/aging      — 知识衰减检查
 * GET    /api/waos/engines/status     — 引擎状态
 */

import { NextRequest, NextResponse } from 'next/server'

// ─── 引擎导入 ───────────────────────────────────────
async function getEngines() {
  const [
    { verifyClaim, queryTruth },
    { retrieveMemories, compressConversation, formatMemoriesForPrompt },
    { initAnchor, blendPersona, checkDrift, generatePersonaConstraint },
    { ethicsReview, quickCheck },
    { addNode, addEdge, getNeighbors, getInfluence, buildRelationContext },
    { logDecision, analyzeConversionPath, analyzeActionEffectiveness, formatConversionPath },
    { nightlyTraining, approveLearning, rejectLearning },
    { runAgingCheck, getReviewQueue, refreshKnowledge },
  ] = await Promise.all([
    import('@/lib/waos/truth'),
    import('@/lib/waos/memory'),
    import('@/lib/waos/persona-anchor'),
    import('@/lib/waos/ethics'),
    import('@/lib/waos/relation-graph'),
    import('@/lib/waos/decision-replay'),
    import('@/lib/waos/learning'),
    import('@/lib/waos/knowledge-aging'),
  ])

  return {
    verifyClaim, queryTruth,
    retrieveMemories, compressConversation, formatMemoriesForPrompt,
    initAnchor, blendPersona, checkDrift, generatePersonaConstraint,
    ethicsReview, quickCheck,
    addNode, addEdge, getNeighbors, getInfluence, buildRelationContext,
    logDecision, analyzeConversionPath, analyzeActionEffectiveness, formatConversionPath,
    nightlyTraining, approveLearning, rejectLearning,
    runAgingCheck, getReviewQueue, refreshKnowledge,
  }
}

// ─── 主路由 ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || ''

  try {
    const body = await request.json().catch(() => ({}))
    const engines = await getEngines()

    switch (action) {
      // ─── 真理层 ───
      case 'verify': {
        const result = await engines.verifyClaim(body.claim || '')
        return NextResponse.json(result)
      }

      // ─── 伦理审查 ───
      case 'ethics': {
        const result = await engines.ethicsReview(body.content || '')
        return NextResponse.json(result)
      }

      // ─── 记忆压缩 ───
      case 'memory-compress': {
        const facts = await engines.compressConversation(
          body.customerId || '',
          body.messages || []
        )
        return NextResponse.json({ facts, count: facts.length })
      }

      // ─── 决策日志 ───
      case 'decision-log': {
        await engines.logDecision({
          customerId: body.customerId || '',
          intent: body.intent || null,
          stage: body.stage || null,
          personaMix: body.personaMix || null,
          action: body.action || 'reply',
          templateId: body.templateId || null,
          replyContent: body.replyContent || null,
          result: body.result || null,
          confidence: body.confidence || 0,
          latency: body.latency || 0,
          tokensUsed: body.tokensUsed || 0,
        })
        return NextResponse.json({ ok: true })
      }

      // ─── 夜间训练 ───
      case 'learning-train': {
        const result = await engines.nightlyTraining()
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json({ error: 'Unknown action: ' + action }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || ''

  try {
    const engines = await getEngines()

    switch (action) {
      // ─── 记忆检索 ───
      case 'memory': {
        const customerId = searchParams.get('customerId') || ''
        const query = searchParams.get('query') || ''
        const topK = parseInt(searchParams.get('topK') || '5')
        const memories = await engines.retrieveMemories(customerId, query, topK)
        const prompt = engines.formatMemoriesForPrompt(memories)
        return NextResponse.json({ memories, prompt })
      }

      // ─── 关系图谱 ───
      case 'relation': {
        const customerId = searchParams.get('customerId') || ''
        const context = engines.buildRelationContext(customerId)
        return NextResponse.json({ context })
      }

      // ─── 决策回放 ───
      case 'decision-path': {
        const customerId = searchParams.get('customerId') || ''
        const path = await engines.analyzeConversionPath(customerId)
        if (!path) return NextResponse.json({ error: 'No decisions found' }, { status: 404 })
        const formatted = engines.formatConversionPath(path)
        return NextResponse.json({ path, formatted })
      }

      // ─── 动作效果分析 ───
      case 'decision-effectiveness': {
        const effectiveness = await engines.analyzeActionEffectiveness()
        return NextResponse.json({ effectiveness })
      }

      // ─── 审核队列 ───
      case 'learning-review': {
        const { db } = await import('@/lib/db')
        const queue = await db.learningReview.findMany({
          where: { status: 'pending' },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
        return NextResponse.json({ queue })
      }

      // ─── 知识衰减 ───
      case 'aging-check': {
        const report = await engines.runAgingCheck()
        return NextResponse.json(report)
      }

      // ─── 待审核知识 ───
      case 'aging-review': {
        const queue = await engines.getReviewQueue()
        return NextResponse.json({ queue })
      }

      // ─── 引擎状态 ───
      case 'status': {
        const drift = engines.checkDrift('default')
        return NextResponse.json({
          truth: true,
          memory: true,
          personaAnchor: drift,
          ethics: true,
          relationGraph: true,
          decisionReplay: true,
          learning: true,
          knowledgeAging: true,
        })
      }

      default:
        return NextResponse.json({ error: 'Unknown action: ' + action }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || ''

  try {
    const body = await request.json().catch(() => ({}))
    const engines = await getEngines()

    switch (action) {
      // 批准学习建议
      case 'learning-approve': {
        await engines.approveLearning(body.id || '')
        return NextResponse.json({ ok: true })
      }

      // 拒绝学习建议
      case 'learning-reject': {
        await engines.rejectLearning(body.id || '')
        return NextResponse.json({ ok: true })
      }

      // 刷新知识
      case 'aging-refresh': {
        await engines.refreshKnowledge(body.id || '')
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action: ' + action }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
