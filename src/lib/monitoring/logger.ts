/**
 * WAOS 结构化日志服务
 *
 * JSON 格式日志 + 内存环形缓冲 + 轮转
 * 替代 console.log 的无结构日志
 */

import { db } from '@/lib/db'
import { maskSensitive } from '@/lib/crypto'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface StructuredLog {
  id: string
  level: LogLevel
  message: string
  module?: string
  timestamp: number
  context?: Record<string, unknown>
}

// ─── 环形缓冲（内存最近 1000 条）─────────────────────────────────
const LOG_BUFFER_SIZE = 1000
const logBuffer: StructuredLog[] = []
let logBufferIndex = 0

// ─── 写日志 ─────────────────────────────────────────────
export function log(level: LogLevel, message: string, module?: string, context?: Record<string, unknown>): string {
  // PII 脱敏：对 context 里的 wx_id/phone/content 字段自动打码
  const sanitizedContext = context ? maskSensitive(context) : undefined
  const entry: StructuredLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    level,
    message,
    module,
    timestamp: Date.now(),
    context: sanitizedContext,
  }

  // 环形缓冲写入
  if (logBuffer.length < LOG_BUFFER_SIZE) {
    logBuffer.push(entry)
  } else {
    logBuffer[logBufferIndex] = entry
    logBufferIndex = (logBufferIndex + 1) % LOG_BUFFER_SIZE
  }

  // 控制台输出（带颜色 + JSON 格式）
  const colors: Record<LogLevel, string> = {
    debug: '\x1b[36m',  // cyan
    info: '\x1b[32m',   // green
    warn: '\x1b[33m',   // yellow
    error: '\x1b[31m',  // red
  }
  const reset = '\x1b[0m'
  const time = new Date(entry.timestamp).toISOString().slice(11, 19)
  const moduleStr = module ? `[${module}]` : ''
  console.log(`${colors[level]}${time} ${level.toUpperCase().padEnd(5)}${moduleStr}${reset} ${message}${context ? ' ' + JSON.stringify(context) : ''}`)

  // 持久化 warn/error 到 DB（采样，避免高频写）
  if ((level === 'warn' || level === 'error') && Math.random() < 0.3) {
    db.eventLog.create({
      data: {
        type: `log_${level}`,
        payload: JSON.stringify({ message, module, context: context ? JSON.stringify(context).slice(0, 500) : undefined }),
      },
    }).catch(() => {})
  }

  return entry.id
}

// ─── 便捷方法 ─────────────────────────────────────────────
export const logger = {
  debug: (msg: string, module?: string, ctx?: Record<string, unknown>) => log('debug', msg, module, ctx),
  info: (msg: string, module?: string, ctx?: Record<string, unknown>) => log('info', msg, module, ctx),
  warn: (msg: string, module?: string, ctx?: Record<string, unknown>) => log('warn', msg, module, ctx),
  error: (msg: string, module?: string, ctx?: Record<string, unknown>) => log('error', msg, module, ctx),
}

// ─── 查询日志 ─────────────────────────────────────────────
export function getLogs(options: { level?: LogLevel; module?: string; limit?: number; since?: number } = {}): StructuredLog[] {
  const { level, module, limit = 100, since } = options
  let result = [...logBuffer].sort((a, b) => b.timestamp - a.timestamp)
  if (level) result = result.filter(l => l.level === level)
  if (module) result = result.filter(l => l.module === module)
  if (since) result = result.filter(l => l.timestamp >= since)
  return result.slice(0, limit)
}

// ─── 日志统计 ─────────────────────────────────────────────
export function getLogStats() {
  const byLevel: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 }
  for (const l of logBuffer) byLevel[l.level]++
  const byModule: Record<string, number> = {}
  for (const l of logBuffer) {
    const m = l.module || 'unknown'
    byModule[m] = (byModule[m] || 0) + 1
  }
  return {
    total: logBuffer.length,
    byLevel,
    byModule,
    oldest: logBuffer.length > 0 ? Math.min(...logBuffer.map(l => l.timestamp)) : null,
    newest: logBuffer.length > 0 ? Math.max(...logBuffer.map(l => l.timestamp)) : null,
  }
}

// ─── 清空日志 ─────────────────────────────────────────────
export function clearLogs() {
  logBuffer.length = 0
  logBufferIndex = 0
}
