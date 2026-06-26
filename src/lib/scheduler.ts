/**
 * WAOS 任务队列 + 调度器
 *
 * 对齐 6.22审计优化 Sprint 3: 定时跟进/延迟消息/批量任务
 * 不依赖 Redis/BullMQ（桌面应用单机），用内存队列 + 定时器实现
 */

import { db } from '@/lib/db'

interface ScheduledTask {
  id: string
  type: 'followup' | 'delayed_message' | 'sop_resume' | 'batch_send'
  payload: Record<string, unknown>
  executeAt: number  // 执行时间戳
  createdAt: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  attempts: number
  maxAttempts: number
  lastError?: string
  completedAt?: number
}

// ─── 内存队列（生产可换 BullMQ + Redis）──────────────────────
const taskQueue = new Map<string, ScheduledTask>()
let schedulerTimer: NodeJS.Timeout | null = null
const CHECK_INTERVAL = 60 * 1000  // 每分钟检查一次

// ─── 任务处理器注册 ─────────────────────────────────────────────
type TaskHandler = (payload: Record<string, unknown>) => Promise<void>
const handlers = new Map<string, TaskHandler>()

export function registerHandler(type: string, handler: TaskHandler) {
  handlers.set(type, handler)
  console.log(`[Scheduler] 注册任务处理器: ${type}`)
}

// ─── 添加任务 ─────────────────────────────────────────────
export function scheduleTask(
  type: ScheduledTask['type'],
  payload: Record<string, unknown>,
  delayMs: number,
  maxAttempts = 3
): string {
  const task: ScheduledTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    executeAt: Date.now() + delayMs,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
    maxAttempts,
  }
  taskQueue.set(task.id, task)
  console.log(`[Scheduler] 任务已调度: ${task.id} type=${type} 延迟${delayMs}ms`)
  return task.id
}

// ─── 取消任务 ─────────────────────────────────────────────
export function cancelTask(taskId: string): boolean {
  const task = taskQueue.get(taskId)
  if (!task) return false
  if (task.status === 'running') return false
  task.status = 'cancelled'
  return true
}

// ─── 列出任务 ─────────────────────────────────────────────
export function listTasks(status?: ScheduledTask['status']): ScheduledTask[] {
  const tasks = Array.from(taskQueue.values())
  return status ? tasks.filter(t => t.status === status) : tasks
}

// ─── 执行单个任务 ─────────────────────────────────────────────
async function executeTask(task: ScheduledTask): Promise<void> {
  const handler = handlers.get(task.type)
  if (!handler) {
    throw new Error(`无处理器: ${task.type}`)
  }
  task.status = 'running'
  task.attempts++
  try {
    await handler(task.payload)
    task.status = 'completed'
    task.completedAt = Date.now()
    console.log(`[Scheduler] 任务完成: ${task.id}`)
  } catch (e) {
    task.lastError = e instanceof Error ? e.message : String(e)
    if (task.attempts >= task.maxAttempts) {
      task.status = 'failed'
      console.error(`[Scheduler] 任务失败(${task.attempts}/${task.maxAttempts}): ${task.id} - ${task.lastError}`)
    } else {
      task.status = 'pending'
      // 指数退避：下次执行时间 = 现在 + 2^attempts * 60秒
      task.executeAt = Date.now() + Math.pow(2, task.attempts) * 60 * 1000
      console.warn(`[Scheduler] 任务重试(${task.attempts}/${task.maxAttempts}): ${task.id} 将在 ${Math.pow(2, task.attempts)}分钟后重试`)
    }
  }
}

// ─── 调度器主循环 ─────────────────────────────────────────────
async function processQueue() {
  const now = Date.now()
  const dueTasks = Array.from(taskQueue.values()).filter(
    t => t.status === 'pending' && t.executeAt <= now
  )
  for (const task of dueTasks) {
    await executeTask(task)
  }
  // 清理已完成/失败超过 24 小时的任务
  const cleanupBefore = now - 24 * 60 * 60 * 1000
  for (const [id, task] of taskQueue) {
    if ((task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')
        && task.completedAt && task.completedAt < cleanupBefore) {
      taskQueue.delete(id)
    }
  }
}

// ─── 启动调度器 ─────────────────────────────────────────────
export function startScheduler(): NodeJS.Timeout {
  if (schedulerTimer) return schedulerTimer
  schedulerTimer = setInterval(() => {
    processQueue().catch(e => console.error('[Scheduler] 处理队列失败:', e))
  }, CHECK_INTERVAL)
  console.log(`[Scheduler] 调度器已启动（每${CHECK_INTERVAL / 1000}秒检查）`)

  // 注册内置处理器
  registerHandler('sop_resume', async (payload) => {
    const { instanceId } = payload
    if (instanceId) {
      // 动态 import 避免循环依赖
      const { resumeInstance } = await import('@/lib/sop/runtime')
      await resumeInstance(instanceId as string)
    }
  })

  registerHandler('followup', async (payload) => {
    const { customerId, reason } = payload
    console.log(`[Scheduler] 执行跟进: 客户${customerId} 原因${reason}`)
    // TODO: 触发 SOP 或通知人工
  })

  return schedulerTimer
}

// ─── 停止调度器 ─────────────────────────────────────────────
export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
    console.log('[Scheduler] 调度器已停止')
  }
}

// ─── 统计 ─────────────────────────────────────────────
export function getSchedulerStats() {
  const tasks = Array.from(taskQueue.values())
  return {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    running: tasks.filter(t => t.status === 'running').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
    cancelled: tasks.filter(t => t.status === 'cancelled').length,
  }
}
