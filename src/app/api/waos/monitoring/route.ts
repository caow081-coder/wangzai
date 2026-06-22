/**
 * 性能指标 + 错误追踪 API
 * GET /api/waos/monitoring          — 性能指标
 * GET /api/waos/monitoring?view=errors — 错误统计
 * GET /api/waos/monitoring?view=logs    — 结构化日志
 * GET /api/waos/monitoring?view=all     — 全部汇总
 */

import { NextRequest, NextResponse } from 'next/server'
import { getMetrics, clearMetrics } from '@/lib/monitoring/metrics'
import { getErrorStats, clearErrors } from '@/lib/monitoring/errorTracker'
import { getLogStats, getLogs } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const view = url.searchParams.get('view') || 'metrics'

  try {
    if (view === 'metrics') {
      const operation = url.searchParams.get('operation') || undefined
      return NextResponse.json({ view: 'metrics', ...getMetrics(operation) })
    }
    if (view === 'errors') {
      return NextResponse.json({ view: 'errors', ...getErrorStats() })
    }
    if (view === 'logs') {
      const level = url.searchParams.get('level') as any
      const limit = parseInt(url.searchParams.get('limit') || '100')
      return NextResponse.json({ view: 'logs', logs: getLogs({ level, limit }) })
    }
    if (view === 'all') {
      return NextResponse.json({
        view: 'all',
        metrics: getMetrics(),
        errors: getErrorStats(),
        logs: getLogStats(),
      })
    }
    return NextResponse.json({ error: `未知 view: ${view}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url)
  const target = url.searchParams.get('target') || 'all'
  try {
    if (target === 'metrics') clearMetrics()
    if (target === 'errors') clearErrors()
    if (target === 'all') { clearMetrics(); clearErrors() }
    return NextResponse.json({ success: true, cleared: target })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
