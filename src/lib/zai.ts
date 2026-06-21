/**
 * Z.AI SDK 单例缓存
 *
 * 避免每次 API 请求都调用 ZAI.create()，减少内存分配和 GC 压力。
 *
 * 用法:
 *   import { getZAI } from '@/lib/zai'
 *   const zai = await getZAI()
 *   const completion = await zai.chat.completions.create({ ... })
 */

import ZAI from 'z-ai-web-dev-sdk'

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null
let creatingPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null

/**
 * 获取 Z.AI SDK 单例实例（线程安全）
 * 第一次调用时创建，后续返回缓存
 */
export async function getZAI() {
  if (zaiInstance) return zaiInstance

  // 防止并发请求同时创建多个实例
  if (creatingPromise) return creatingPromise

  creatingPromise = ZAI.create().then((instance) => {
    zaiInstance = instance
    creatingPromise = null
    return instance
  }).catch((err) => {
    creatingPromise = null
    throw err
  })

  return creatingPromise
}

/**
 * 重置单例（仅用于测试）
 */
export function resetZAI() {
  zaiInstance = null
  creatingPromise = null
}
