/**
 * WAOS Persona Anchor — 人格锚点
 *
 * 方案文档第三层漏洞：
 *   学习引擎全量学习 → 人格漂移 → 99%数字人项目死亡原因
 *   解决方案：原始人格 70% + 最近学习 30%
 *
 * 核心机制：
 *   - basePersona: 系统初始训练出的原始人格（不可变核心）
 *   - learnedTraits: 从交互中学习的动态特征
 *   - anchorWeight: 默认 0.70，即原始人格占 70%
 *   - driftDetection: 检测人格漂移并告警
 */

import { compilePersona, type IdentityVector, type PersonaBlend } from '@/lib/identity/kernel'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ─── 类型 ────────────────────────────────────────────
export interface PersonaAnchor {
  profileId: string
  basePersona: PersonaBlend         // 原始人格 — 不可变核心
  learnedTraits: LearnedTraits      // 从交互中学习的特征
  anchorWeight: number              // 原始人格权重 (0-1), 默认 0.7
  lastCalibrated: Date              // 最后一次校准时间
  driftScore: number                // 漂移分数 (0-100, 越高越危险)
}

export interface LearnedTraits {
  warmthBias: number        // -50 ~ +50
  professionalismBias: number
  pressureBias: number
  patienceBias: number
  humorBias: number
  authorityBias: number
  emojiLevelBias: number    // -50 ~ +50
  commonPhrases: string[]   // 最近常用话术
  responseSpeedBias: number // -50 ~ +50 (负=更快, 正=更慢)
}

export interface AnchorConfig {
  profileId: string
  anchorWeight: number      // 默认 0.70
  driftAlertThreshold: number // 默认 30
}

// ─── 默认学习特征 ───────────────────────────────────
const DEFAULT_TRAITS: LearnedTraits = {
  warmthBias: 0,
  professionalismBias: 0,
  pressureBias: 0,
  patienceBias: 0,
  humorBias: 0,
  authorityBias: 0,
  emojiLevelBias: 0,
  commonPhrases: [],
  responseSpeedBias: 0,
}

// ─── 持久化存储（JSON 文件，重启不丢）─────────────
const ANCHOR_FILE = join(process.cwd(), 'db', 'persona-anchors.json')
const anchors = new Map<string, PersonaAnchor>()

// 启动时从磁盘恢复
function loadAnchors(): void {
  try {
    if (existsSync(ANCHOR_FILE)) {
      const raw = readFileSync(ANCHOR_FILE, 'utf-8')
      const data = JSON.parse(raw)
      for (const [k, v] of Object.entries(data)) {
        const a = v as any
        a.lastCalibrated = new Date(a.lastCalibrated)
        anchors.set(k, a as PersonaAnchor)
      }
      console.log(`[PersonaAnchor] 已从磁盘恢复 ${anchors.size} 个锚点`)
    }
  } catch (e) {
    console.error('[PersonaAnchor] 恢复失败，从零开始:', e)
  }
}

function saveAnchors(): void {
  try {
    const obj: Record<string, any> = {}
    for (const [k, v] of anchors) obj[k] = v
    mkdirSync(join(process.cwd(), 'db'), { recursive: true })
    writeFileSync(ANCHOR_FILE, JSON.stringify(obj, null, 2), 'utf-8')
  } catch (e) {
    console.error('[PersonaAnchor] 持久化失败:', e)
  }
}

// 模块加载时恢复
loadAnchors()

// ─── 初始化锚点 ─────────────────────────────────────
/**
 * 初始化人格锚点，捕获"原始人格"快照
 */
export function initAnchor(
  profileId: string,
  identity: IdentityVector,
  personas: any[],
  config?: Partial<AnchorConfig>
): PersonaAnchor {
  const w = Math.max(0, Math.min(1, config?.anchorWeight ?? 0.70)) // 审计: 强制 [0,1] 范围
  const basePersona = compilePersona(identity, personas)
  const anchor: PersonaAnchor = {
    profileId,
    basePersona: JSON.parse(JSON.stringify(basePersona)), // 深拷贝
    learnedTraits: { ...DEFAULT_TRAITS },
    anchorWeight: w,
    lastCalibrated: new Date(),
    driftScore: 0,
  }
  anchors.set(profileId, anchor)
  saveAnchors()
  return anchor
}

// ─── 混合人格 ───────────────────────────────────────
/**
 * 计算当前有效人格 = basePersona × anchorWeight + learnedTraits × (1 - anchorWeight)
 */
export function blendPersona(anchor: PersonaAnchor): PersonaBlend {
  const w = anchor.anchorWeight
  const lw = 1 - w
  const b = anchor.basePersona.compiled
  const t = anchor.learnedTraits

  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

  return {
    ...anchor.basePersona,
    compiled: {
      warmth: clamp(b.warmth + t.warmthBias * lw * 0.5),
      professionalism: clamp(b.professionalism + t.professionalismBias * lw * 0.5),
      pressure: clamp(b.pressure + t.pressureBias * lw * 0.5),
      patience: clamp(b.patience + t.patienceBias * lw * 0.5),
      humor: clamp(b.humor + t.humorBias * lw * 0.5),
      authority: clamp(b.authority + t.authorityBias * lw * 0.5),
      speed: b.speed,
      emojiLevel: clamp(b.emojiLevel + t.emojiLevelBias * lw * 0.5),
    },
  }
}

// ─── 学习更新 ───────────────────────────────────────
/**
 * 根据一次成功/失败的交互，微调学习特征
 * @param delta 正数=增强, 负数=减弱
 */
export function updateTraits(
  profileId: string,
  updates: Partial<LearnedTraits>
): void {
  const anchor = anchors.get(profileId)
  if (!anchor) return

  const t = anchor.learnedTraits
  const clamp = (v: number) => Math.max(-50, Math.min(50, v))

  if (updates.warmthBias !== undefined) t.warmthBias = clamp(t.warmthBias + updates.warmthBias)
  if (updates.professionalismBias !== undefined) t.professionalismBias = clamp(t.professionalismBias + updates.professionalismBias)
  if (updates.pressureBias !== undefined) t.pressureBias = clamp(t.pressureBias + updates.pressureBias)
  if (updates.patienceBias !== undefined) t.patienceBias = clamp(t.patienceBias + updates.patienceBias)
  if (updates.humorBias !== undefined) t.humorBias = clamp(t.humorBias + updates.humorBias)
  if (updates.authorityBias !== undefined) t.authorityBias = clamp(t.authorityBias + updates.authorityBias)
  if (updates.emojiLevelBias !== undefined) t.emojiLevelBias = clamp(t.emojiLevelBias + updates.emojiLevelBias)
  if (updates.responseSpeedBias !== undefined) t.responseSpeedBias = clamp(t.responseSpeedBias + updates.responseSpeedBias)

  // 记录常用话术
  if (updates.commonPhrases) {
    const merged = [...t.commonPhrases, ...updates.commonPhrases]
    t.commonPhrases = Array.from(new Set(merged)).slice(-20) // 保留最近20条
  }

  // 计算漂移分数
  anchor.driftScore = computeDriftScore(anchor)
  anchor.lastCalibrated = new Date()
  saveAnchors()
}

// ─── 漂移检测 ───────────────────────────────────────
/**
 * 计算人格漂移分数
 * 0 = 完全稳定, 100 = 严重漂移
 */
function computeDriftScore(anchor: PersonaAnchor): number {
  const t = anchor.learnedTraits
  let drift = 0

  // 各维度的偏移量累加
  drift += Math.abs(t.warmthBias)
  drift += Math.abs(t.professionalismBias)
  drift += Math.abs(t.pressureBias)
  drift += Math.abs(t.patienceBias)
  drift += Math.abs(t.humorBias)
  drift += Math.abs(t.authorityBias)
  drift += Math.abs(t.emojiLevelBias)

  // 归一化到 0-100
  return Math.min(100, Math.round(drift / 7 * 2))
}

// ─── 漂移告警 ───────────────────────────────────────
export interface DriftAlert {
  level: 'normal' | 'warning' | 'critical'
  score: number
  message: string
  recommendation: string
}

/**
 * 检查人格漂移是否需要告警
 */
export function checkDrift(profileId: string, threshold = 30): DriftAlert {
  const anchor = anchors.get(profileId)
  if (!anchor) return { level: 'normal', score: 0, message: '无锚点', recommendation: '' }

  const score = anchor.driftScore

  if (score > 60) {
    return {
      level: 'critical',
      score,
      message: `人格严重漂移！偏移分数: ${score}/100`,
      recommendation: '建议立即暂停自动学习，人工审核最近模板，必要时重置 learnedTraits',
    }
  }

  if (score > threshold) {
    return {
      level: 'warning',
      score,
      message: `人格开始偏移，偏移分数: ${score}/100`,
      recommendation: '请审核学习引擎最近新增的模板和话术',
    }
  }

  return {
    level: 'normal',
    score,
    message: '人格稳定',
    recommendation: '',
  }
}

// ─── 重置学习特征 ───────────────────────────────────
export function resetTraits(profileId: string): void {
  const anchor = anchors.get(profileId)
  if (anchor) {
    anchor.learnedTraits = { ...DEFAULT_TRAITS }
    anchor.driftScore = 0
    anchor.lastCalibrated = new Date()
    saveAnchors() // 审计: 重置后持久化
  }
}

// ─── 获取锚点状态 ───────────────────────────────────
export function getAnchor(profileId: string): PersonaAnchor | undefined {
  return anchors.get(profileId)
}

/**
 * 生成注入 AI prompt 的人格约束文本
 */
export function generatePersonaConstraint(profileId: string): string {
  const anchor = anchors.get(profileId)
  if (!anchor) return ''

  const blended = blendPersona(anchor)
  const c = blended.compiled

  const lines = [
    `【人格约束 — 原始人格权重: ${Math.round(anchor.anchorWeight * 100)}%】`,
    `温度: ${c.warmth}/100  专业度: ${c.professionalism}/100  施压力度: ${c.pressure}/100`,
    `耐心: ${c.patience}/100  幽默: ${c.humor}/100  权威: ${c.authority}/100`,
    `表情等级: ${c.emojiLevel}/100`,
  ]

  if (anchor.learnedTraits.commonPhrases.length > 0) {
    lines.push(`常用表达: ${anchor.learnedTraits.commonPhrases.slice(0, 5).join('、')}`)
  }

  if (anchor.driftScore > 30) {
    lines.push(`⚠️ 注意: 当前人格漂移分数 ${anchor.driftScore}/100，请保持核心人设不变`)
  }

  return lines.join('\n')
}
