/**
 * WAOS 错误追踪 + 日志 API
 *
 * GET /api/waos/errors          — 错误统计
 * GET /api/waos/errors?view=logs — 结构化日志
 * GET /api/waos/errors?view=log_stats — 日志统计
 * POST /api/waos/errors         — 前端上报错误
 * DELETE /api/waos/errors       — 清除错误/日志
 */

import { NextRequest, NextResponse } from 'next/server'
import { captureError, getErrorStats, clearErrors } from '@/lib/monitoring/errorTracker'
import { getLogs, getLogStats, clearLogs, logger } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const view = url.searchParams.get('view') || 'errors'

  try {
    if (view === 'errors') {
      const stats = getErrorStats()
      return NextResponse.json({ view: 'errors', ...stats })
    }
    if (view === 'logs') {
      const level = url.searchParams.get('level') as any
      const moduleName = url.searchParams.get('module') || undefined
      const limit = parseInt(url.searchParams.get('limit') || '100')
      const since = parseInt(url.searchParams.get('since') || '0') || undefined
      const logs = getLogs({ level, module: moduleName, limit, since })
      return NextResponse.json({ view: 'logs', logs, count: logs.length })
    }
    if (view === 'log_stats') {
      return NextResponse.json({ view: 'log_stats', ...getLogStats() })
    }
    return NextResponse.json({ error: `未知 view: ${view}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  try {
    // 前端上报错误
    if (body.type === 'render_error' || body.type === 'client_error') {
      const id = captureError(
        body.message || body.error || '客户端错误',
        'render',
        { url: body.url, stack: body.stack, userAgent: body.userAgent }
      )
      logger.warn('前端错误上报', 'client', { id, message: body.message })
      return NextResponse.json({ success: true, errorId: id })
    }

    // 前端上报日志
    if (body.type === 'log') {
      const level = (body.level || 'info') as 'debug' | 'info' | 'warn' | 'error'
      logger[level](body.message || '', body.module, body.context)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: `未知 type: ${body.type}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url)
  const target = url.searchParams.get('target') || 'errors'
  try {
    if (target === 'errors') clearErrors()
    if (target === 'logs') clearLogs()
    if (target === 'all') { clearErrors(); clearLogs() }
    return NextResponse.json({ success: true, cleared: target })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
