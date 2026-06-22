/**
 * WAOS PII 数据加密工具
 *
 * AES-256-GCM 对称加密
 * - 密钥派生：优先 Electron safeStorage → 环境变量 → 机器指纹派生（降级）
 * - 加密格式：iv:authTag:encrypted (Base64)
 * - 透明兼容：解密时如果遇到明文（旧数据），直接返回不报错
 *
 * 对齐 6.22审计优化文档 Sprint 1 第一步
 */

import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto'
import * as os from 'os'

// ─── 密钥管理 ─────────────────────────────────────────────
let masterKey: Buffer | null = null

function getMasterKey(): Buffer {
  if (masterKey) return masterKey

  // 1. 优先从环境变量读取（生产环境通过 Electron 主进程注入）
  const keyFromEnv = process.env.WAOS_ENCRYPTION_KEY
  if (keyFromEnv && keyFromEnv.length === 64) {
    masterKey = Buffer.from(keyFromEnv, 'hex')
    return masterKey
  }

  // 2. 降级：基于机器指纹派生（开发环境，比明文强但不够安全）
  //    生产环境必须通过 Electron safeStorage 注入 WAOS_ENCRYPTION_KEY
  const homedir = os.homedir()
  masterKey = scryptSync('waos-master-salt', 'waos-' + homedir, 32)
  return masterKey
}

/**
 * 设置主密钥（Electron 主进程启动时调用）
 * @param keyHex 64 位十六进制密钥（32 字节）
 */
export function setMasterKey(keyHex: string): void {
  if (keyHex.length !== 64) {
    throw new Error('主密钥必须是 64 位十六进制（32 字节）')
  }
  masterKey = Buffer.from(keyHex, 'hex')
}

/**
 * 生成新主密钥（首次启动时调用，存储到 safeStorage）
 */
export function generateMasterKey(): string {
  return randomBytes(32).toString('hex')
}

// ─── 加密/解密 ─────────────────────────────────────────────

/**
 * AES-256-GCM 加密
 * @param text 明文
 * @returns 格式：iv:authTag:encrypted (Base64)
 */
export function encrypt(text: string): string {
  if (!text || typeof text !== 'string') return text

  // 如果已经是加密格式，不重复加密
  if (isEncrypted(text)) return text

  try {
    const key = getMasterKey()
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-gcm', key, iv)

    let encrypted = cipher.update(text, 'utf8', 'base64')
    encrypted += cipher.final('base64')

    const authTag = cipher.getAuthTag().toString('base64')
    return `ENC:${iv.toString('base64')}:${authTag}:${encrypted}`
  } catch (e) {
    console.error('[Crypto] 加密失败，返回原文:', e)
    return text // 加密失败不阻断业务
  }
}

/**
 * AES-256-GCM 解密
 * @param encryptedText 格式：ENC:iv:authTag:encrypted
 * @returns 明文（如果非加密格式，直接返回兼容旧数据）
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText || typeof encryptedText !== 'string') return encryptedText

  // 非加密格式（旧明文数据），直接返回
  if (!isEncrypted(encryptedText)) return encryptedText

  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 4) return encryptedText

    const iv = Buffer.from(parts[1], 'base64')
    const authTag = Buffer.from(parts[2], 'base64')
    const encrypted = parts[3]

    const key = getMasterKey()
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (e) {
    console.error('[Crypto] 解密失败，返回原文:', e)
    return encryptedText // 解密失败不阻断业务
  }
}

/**
 * 判断是否是加密格式
 */
export function isEncrypted(text: string): boolean {
  return typeof text === 'string' && text.startsWith('ENC:')
}

// ─── 批量加密/解密 ─────────────────────────────────────────────

export function encryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj }
  for (const field of fields) {
    if (result[field] && typeof result[field] === 'string') {
      ;(result[field] as string) = encrypt(result[field] as string)
    }
  }
  return result
}

export function decryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj }
  for (const field of fields) {
    if (result[field] && typeof result[field] === 'string') {
      ;(result[field] as string) = decrypt(result[field] as string)
    }
  }
  return result
}

// ─── 需要加密的 PII 字段配置 ─────────────────────────────────────────────

// Message 表需要加密的字段
export const MESSAGE_ENCRYPT_FIELDS = ['content'] as const

// Lead 表需要加密的字段（客户姓名/标签等）
export const LEAD_ENCRYPT_FIELDS = ['name', 'lastMessage'] as const

// Comment 表需要加密的字段
export const COMMENT_ENCRYPT_FIELDS = ['content', 'userName'] as const

// Persona 表需要加密的字段（联系方式）
export const PERSONA_ENCRYPT_FIELDS = [] as const // 联系方式在人设 business.contact，单独处理

// ─── 日志脱敏 ─────────────────────────────────────────────

/**
 * 脱敏 wx_id（微信ID）：wxid_xxx → wxid_***123
 */
export function maskWxId(wxId: string): string {
  if (!wxId || wxId.length < 8) return '***'
  return wxId.slice(0, 6) + '***' + wxId.slice(-3)
}

/**
 * 脱敏手机号：13888888888 → 138****8888
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return '***'
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

/**
 * 脱敏消息内容：保留前 10 字 + ***
 */
export function maskContent(content: string): string {
  if (!content) return ''
  if (content.length <= 10) return content + '***'
  return content.slice(0, 10) + '***'
}

/**
 * 日志脱敏：遍历对象，对 wx_id/phone/content 字段打码
 */
export function maskSensitive(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      if (/wx_?id|wxId/i.test(key)) {
        result[key] = maskWxId(value)
      } else if (/phone|mobile|tel/i.test(key)) {
        result[key] = maskPhone(value)
      } else if (/content|message|text/i.test(key)) {
        result[key] = maskContent(value)
      } else {
        result[key] = value
      }
    } else {
      result[key] = value
    }
  }
  return result
}
