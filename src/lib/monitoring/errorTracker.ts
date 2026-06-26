/**
 * WAOS 错误追踪服务
 *
 * 轻量级错误收集 + 持久化 + 聚合，不依赖外部服务
 */

import { db } from '@/lib/db'

interface ErrorEntry {
  id: string
  message: string
  stack?: string
  type: 'uncaught' | 'unhandled' | 'api' | 'render' | 'ipc'
  count: number
  firstSeen: number
  lastSeen: number
  context?: Record<string, unknown>
}

const errorCache = new Map<string, ErrorEntry>()
const MAX_CACHE = 200

export function captureError(
  error: Error | string,
  type: ErrorEntry['type'] = 'api',
  context?: Record<string, unknown>
): string {
  const message = typeof error === 'string' ? error : error.message
  const stack = typeof error === 'string' ? undefined : error.stack
  const key = `${type}:${message.slice(0, 100)}`
  const now = Date.now()

  let entry = errorCache.get(key)
  if (entry) {
    entry.count++
    entry.lastSeen = now
    if (context) entry.context = { ...entry.context, ...context }
  } else {
    entry = {
      id: `err_${now}_${Math.random().toString(36).slice(2, 8)}`,
      message, stack, type, count: 1, firstSeen: now, lastSeen: now, context,
    }
    errorCache.set(key, entry)
    if (errorCache.size > MAX_CACHE) {
      const oldest = Array.from(errorCache.entries()).sort((a, b) => a[1].firstSeen - b[1].firstSeen)[0]
      if (oldest) errorCache.delete(oldest[0])
    }
  }

  if (entry.count <= 3 || entry.count % 10 === 0) {
    db.eventLog.create({
      data: {
        type: `error_${type}`,
        payload: JSON.stringify({
          id: entry.id,
          message: entry.message,
          stack: entry.stack?.slice(0, 2000),
          count: entry.count,
          context: entry.context,
        }),
      },
    }).catch(() => {})
  }

  console.error(`[${type.toUpperCase()}] ${message}`, context || '')
  return entry.id
}

export function getErrorStats() {
  const errors = Array.from(errorCache.values()).sort((a, b) => b.lastSeen - a.lastSeen)
  return {
    total: errors.length,
    totalOccurrences: errors.reduce((s, e) => s + e.count, 0),
    byType: {
      uncaught: errors.filter(e => e.type === 'uncaught').length,
      unhandled: errors.filter(e => e.type === 'unhandled').length,
      api: errors.filter(e => e.type === 'api').length,
      render: errors.filter(e => e.type === 'render').length,
      ipc: errors.filter(e => e.type === 'ipc').length,
    },
    recent: errors.slice(0, 20).map(e => ({
      id: e.id, message: e.message.slice(0, 200), type: e.type, count: e.count,
      firstSeen: e.firstSeen, lastSeen: e.lastSeen,
    })),
  }
}

export function clearErrors() { errorCache.clear() }

export function installGlobalErrorHandlers() {
  process.on('uncaughtException', (err) => {
    captureError(err, 'uncaught', { pid: process.pid })
  })
  process.on('unhandledRejection', (reason) => {
    captureError(reason instanceof Error ? reason : String(reason), 'unhandled', { pid: process.pid })
  })
}
