/**
 * WAOS 性能指标埋点
 *
 * 对齐 6.22审计优化 Sprint 4: 关键操作耗时记录
 */

export interface MetricEntry {
  id: string
  operation: string  // message_process | llm_call | websocket_latency | api_call
  durationMs: number
  success: boolean
  timestamp: number
  context?: Record<string, unknown>
}

const METRIC_BUFFER_SIZE = 1000
const metricBuffer: MetricEntry[] = []

/** 记录指标 */
export function recordMetric(
  operation: string,
  durationMs: number,
  success: boolean,
  context?: Record<string, unknown>
): void {
  const entry: MetricEntry = {
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    operation,
    durationMs,
    success,
    timestamp: Date.now(),
    context,
  }
  if (metricBuffer.length < METRIC_BUFFER_SIZE) {
    metricBuffer.push(entry)
  } else {
    metricBuffer.shift()
    metricBuffer.push(entry)
  }
}

/** 测量异步操作耗时 */
export async function measure<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    recordMetric(operation, Date.now() - start, true, context)
    return result
  } catch (e) {
    recordMetric(operation, Date.now() - start, false, {
      ...context,
      error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}

/** 同步操作测量 */
export function measureSync<T>(operation: string, fn: () => T, context?: Record<string, unknown>): T {
  const start = Date.now()
  try {
    const result = fn()
    recordMetric(operation, Date.now() - start, true, context)
    return result
  } catch (e) {
    recordMetric(operation, Date.now() - start, false, {
      ...context,
      error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}

/** 查询指标 */
export function getMetrics(operation?: string): {
  total: number
  recent: MetricEntry[]
  byOperation: Record<string, { count: number; avgMs: number; maxMs: number; minMs: number; successRate: number }>
} {
  const filtered = operation ? metricBuffer.filter(m => m.operation === operation) : metricBuffer
  const byOp: Record<string, { count: number; avgMs: number; maxMs: number; minMs: number; successRate: number }> = {}

  for (const m of filtered) {
    if (!byOp[m.operation]) {
      byOp[m.operation] = { count: 0, avgMs: 0, maxMs: 0, minMs: Infinity, successRate: 0 }
    }
    byOp[m.operation].count++
    byOp[m.operation].avgMs += m.durationMs
    byOp[m.operation].maxMs = Math.max(byOp[m.operation].maxMs, m.durationMs)
    byOp[m.operation].minMs = Math.min(byOp[m.operation].minMs, m.durationMs)
    if (m.success) byOp[m.operation].successRate++
  }

  for (const op of Object.keys(byOp)) {
    byOp[op].avgMs = Math.round(byOp[op].avgMs / byOp[op].count)
    byOp[op].successRate = Math.round((byOp[op].successRate / byOp[op].count) * 100)
    if (byOp[op].minMs === Infinity) byOp[op].minMs = 0
  }

  return {
    total: filtered.length,
    recent: filtered.slice(-100),
    byOperation: byOp,
  }
}

/** 清空指标 */
export function clearMetrics() {
  metricBuffer.length = 0
}
