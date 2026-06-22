/**
 * WAOS PII 数据迁移脚本
 *
 * 把数据库里已存的明文 PII 数据加密为 ENC: 格式
 * 对齐 6.22审计优化 Sprint 1 第三步
 *
 * 运行方式：npx tsx scripts/migrate-encrypt.ts
 * 或通过 API: POST /api/waos/migrate-encrypt { action: 'migrate' }
 */

import { db } from '@/lib/db'
import { encrypt, isEncrypted } from '@/lib/crypto'

export async function migrateEncryptExistingData(): Promise<{
  message: number
  lead: number
  comment: number
  total: number
  errors: string[]
}> {
  const errors: string[] = []
  let messageCount = 0
  let leadCount = 0
  let commentCount = 0

  console.log('[Migrate] 开始 PII 数据加密迁移...')

  // ─── 迁移 Message.content ───
  try {
    const messages = await db.$queryRaw<{ id: string; content: string }[]>`
      SELECT id, content FROM Message WHERE content IS NOT NULL AND content NOT LIKE 'ENC:%'
    `
    console.log(`[Migrate] Message 需迁移 ${messages.length} 条`)
    for (const msg of messages) {
      try {
        const encrypted = encrypt(msg.content)
        await db.$executeRaw`UPDATE Message SET content = ${encrypted} WHERE id = ${msg.id}`
        messageCount++
      } catch (e) {
        errors.push(`Message ${msg.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } catch (e) {
    errors.push(`Message 迁移失败: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ─── 迁移 Lead.name + Lead.lastMessage ───
  try {
    const leads = await db.$queryRaw<{ id: string; name: string; lastMessage: string | null }[]>`
      SELECT id, name, lastMessage FROM Lead
      WHERE (name IS NOT NULL AND name NOT LIKE 'ENC:%')
         OR (lastMessage IS NOT NULL AND lastMessage NOT LIKE 'ENC:%')
    `
    console.log(`[Migrate] Lead 需迁移 ${leads.length} 条`)
    for (const lead of leads) {
      try {
        const updates: string[] = []
        const params: any[] = []
        if (lead.name && !isEncrypted(lead.name)) {
          updates.push('name = ?')
          params.push(encrypt(lead.name))
        }
        if (lead.lastMessage && !isEncrypted(lead.lastMessage)) {
          updates.push('lastMessage = ?')
          params.push(encrypt(lead.lastMessage))
        }
        if (updates.length > 0) {
          params.push(lead.id)
          await db.$executeRawUnsafe(
            `UPDATE Lead SET ${updates.join(', ')} WHERE id = ?`,
            ...params
          )
          leadCount++
        }
      } catch (e) {
        errors.push(`Lead ${lead.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } catch (e) {
    errors.push(`Lead 迁移失败: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ─── 迁移 Comment.content + Comment.userName ───
  try {
    const comments = await db.$queryRaw<{ id: string; content: string; userName: string }[]>`
      SELECT id, content, userName FROM Comment
      WHERE (content IS NOT NULL AND content NOT LIKE 'ENC:%')
         OR (userName IS NOT NULL AND userName NOT LIKE 'ENC:%')
    `
    console.log(`[Migrate] Comment 需迁移 ${comments.length} 条`)
    for (const cmt of comments) {
      try {
        const updates: string[] = []
        const params: any[] = []
        if (cmt.content && !isEncrypted(cmt.content)) {
          updates.push('content = ?')
          params.push(encrypt(cmt.content))
        }
        if (cmt.userName && !isEncrypted(cmt.userName)) {
          updates.push('userName = ?')
          params.push(encrypt(cmt.userName))
        }
        if (updates.length > 0) {
          params.push(cmt.id)
          await db.$executeRawUnsafe(
            `UPDATE Comment SET ${updates.join(', ')} WHERE id = ?`,
            ...params
          )
          commentCount++
        }
      } catch (e) {
        errors.push(`Comment ${cmt.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } catch (e) {
    errors.push(`Comment 迁移失败: ${e instanceof Error ? e.message : String(e)}`)
  }

  const total = messageCount + leadCount + commentCount
  console.log(`[Migrate] 迁移完成: Message ${messageCount} / Lead ${leadCount} / Comment ${commentCount} / 总计 ${total}`)
  if (errors.length > 0) {
    console.error(`[Migrate] 错误 ${errors.length} 条:`, errors.slice(0, 5))
  }

  return { message: messageCount, lead: leadCount, comment: commentCount, total, errors }
}

// ─── 验证迁移结果：抽样检查数据库里是否还有明文 ───
export async function verifyEncryption(): Promise<{
  messageEncrypted: number
  messagePlain: number
  leadEncrypted: number
  leadPlain: number
  commentEncrypted: number
  commentPlain: number
  isAllEncrypted: boolean
}> {
  const messageStats = await db.$queryRaw<{ encrypted: number; plain: number }[]>`
    SELECT
      SUM(CASE WHEN content LIKE 'ENC:%' THEN 1 ELSE 0 END) as encrypted,
      SUM(CASE WHEN content NOT LIKE 'ENC:%' AND content IS NOT NULL THEN 1 ELSE 0 END) as plain
    FROM Message
  `
  const leadStats = await db.$queryRaw<{ encrypted: number; plain: number }[]>`
    SELECT
      SUM(CASE WHEN name LIKE 'ENC:%' THEN 1 ELSE 0 END) as encrypted,
      SUM(CASE WHEN name NOT LIKE 'ENC:%' AND name IS NOT NULL THEN 1 ELSE 0 END) as plain
    FROM Lead
  `
  const commentStats = await db.$queryRaw<{ encrypted: number; plain: number }[]>`
    SELECT
      SUM(CASE WHEN content LIKE 'ENC:%' THEN 1 ELSE 0 END) as encrypted,
      SUM(CASE WHEN content NOT LIKE 'ENC:%' AND content IS NOT NULL THEN 1 ELSE 0 END) as plain
    FROM Comment
  `

  const messageEncrypted = Number(messageStats[0]?.encrypted || 0)
  const messagePlain = Number(messageStats[0]?.plain || 0)
  const leadEncrypted = Number(leadStats[0]?.encrypted || 0)
  const leadPlain = Number(leadStats[0]?.plain || 0)
  const commentEncrypted = Number(commentStats[0]?.encrypted || 0)
  const commentPlain = Number(commentStats[0]?.plain || 0)

  return {
    messageEncrypted,
    messagePlain,
    leadEncrypted,
    leadPlain,
    commentEncrypted,
    commentPlain,
    isAllEncrypted: messagePlain === 0 && leadPlain === 0 && commentPlain === 0,
  }
}
