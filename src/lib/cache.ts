/**
 * WAOS 内存缓存层
 *
 * 对齐 6.22审计优化 Sprint 3: 缓存高频查询
 * 桌面应用单机，不依赖 Redis，用 Map + TTL 实现
 */

interface CacheEntry<T> {
  value: T
  expireAt: number  // 0 = 永不过期
  createdAt: number
  hitCount: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const DEFAULT_TTL = 5 * 60 * 1000  // 5 分钟

// ─── 设置缓存 ─────────────────────────────────────────────
export function cacheSet<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL): void {
  cache.set(key, {
    value,
    expireAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
    createdAt: Date.now(),
    hitCount: 0,
  })
}

// ─── 获取缓存 ─────────────────────────────────────────────
export function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expireAt > 0 && Date.now() > entry.expireAt) {
    cache.delete(key)
    return null
  }
  entry.hitCount++
  return entry.value as T
}

// ─── 获取或计算（缓存穿透保护）─────────────────────────────────
export async function cacheGetOrSet<T>(
  key: string,
  factory: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL
): Promise<T> {
  const cached = cacheGet<T>(key)
  if (cached !== null) return cached
  const value = await factory()
  cacheSet(key, value, ttlMs)
  return value
}

// ─── 删除缓存 ─────────────────────────────────────────────
export function cacheDelete(key: string): boolean {
  return cache.delete(key)
}

// ─── 按前缀清除 ─────────────────────────────────────────────
export function cacheClearByPrefix(prefix: string): number {
  let cleared = 0
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
      cleared++
    }
  }
  return cleared
}

// ─── 清空所有 ─────────────────────────────────────────────
export function cacheClearAll() {
  cache.clear()
}

// ─── 缓存统计 ─────────────────────────────────────────────
export function cacheStats() {
  let totalHits = 0
  let expired = 0
  const now = Date.now()
  for (const [, entry] of cache) {
    totalHits += entry.hitCount
    if (entry.expireAt > 0 && now > entry.expireAt) expired++
  }
  return {
    totalKeys: cache.size,
    totalHits,
    expired,
    keys: Array.from(cache.keys()).slice(0, 50),
  }
}

// ─── 缓存键生成器 ─────────────────────────────────────────────
export const cacheKeys = {
  lead: (id: string) => `lead:${id}`,
  persona: (id: string) => `persona:${id}`,
  knowledgeSearch: (query: string) => `kb:search:${query}`,
  sopDefinition: (id: string) => `sop:def:${id}`,
  llmReply: (messagesHash: string) => `llm:${messagesHash}`,
}
