/**
 * WAOS 性能指标查询 API (Sprint 4-3)
 *
 * GET /api/waos/metrics-monitoring
 *   可选 query: ?operation=llm_call  — 只返回该操作的指标
 *
 * 返回结构：
 *   { total, recent: MetricEntry[], byOperation: { [op]: { count, avgMs, successRate } } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getMetrics, clearMetrics } from '@/lib/monitoring/metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const operation = url.searchParams.get('operation') || undefined
    const snapshot = getMetrics(operation)
    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      ...snapshot,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    clearMetrics()
    return NextResponse.json({ success: true, message: '指标缓冲已清空' })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    )
  }
}
