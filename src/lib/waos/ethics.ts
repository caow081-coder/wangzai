/**
 * WAOS Ethics Layer — 行为边界层
 *
 * 方案文档第四层漏洞：
 *   成交率高 ≠ 正确。制造焦虑 → 成交 → 学习引擎学到焦虑话术 → 人格黑化
 *   解决方案：限制夸大宣传、违规承诺、虚假成交
 *
 * 核心机制：
 *   - 预定义伦理规则（forbidden / warning / review）
 *   - 正则 + 关键词两级检测
 *   - block: 拦截不发
 *   - warn: 标记警告但仍发
 *   - flag_for_review: 标记待人工审核
 */

import { db } from '@/lib/db'

// ─── 类型 ────────────────────────────────────────────
export interface EthicsResult {
  passed: boolean
  violations: EthicsViolation[]
  action: 'pass' | 'warn' | 'block'
}

export interface EthicsViolation {
  ruleId: string
  ruleName: string
  category: string
  action: 'block' | 'warn' | 'flag_for_review'
  reason: string
  matched: string
}

// ─── 内置规则（硬编码兜底）────────────────────────────
const BUILTIN_RULES: { name: string; pattern: RegExp; action: 'block' | 'warn' | 'flag_for_review'; category: string; description: string }[] = [
  // ─── forbidden: 直接拦截 ───
  {
    name: '虚假承诺-包过',
    pattern: /保证.*?通过|包[过录]|必过|100%|百分之百.*?通过|肯定.*?录取/,
    action: 'block',
    category: 'forbidden',
    description: '不得做出"包过""100%通过"等虚假承诺',
  },
  {
    name: '违规承诺-内部名额',
    pattern: /内部.*?名额|走后门|特殊渠道|关系.*?名额|打招呼/,
    action: 'block',
    category: 'forbidden',
    description: '不得暗示有特殊渠道或内部名额',
  },
  {
    name: '夸大宣传-绝对化',
    pattern: /最好的|第一|唯一|全网最|绝对最|史无前例|前所未有|无人能比/,
    action: 'warn',
    category: 'forbidden',
    description: '不得使用绝对化广告用语',
  },
  {
    name: '虚假价格承诺',
    pattern: /最低价.*?保证|差价.*?退还|买贵.*?赔/,
    action: 'warn',
    category: 'forbidden',
    description: '不得承诺最低价保证（除非真理层授权）',
  },
  // ─── warning: 标记警告 ───
  {
    name: '焦虑制造',
    pattern: /再不来.*?就[晚没].*?了|错过.*?后悔|最后.*?机会|名额.*?不多了|再不.*就来不及了/,
    action: 'warn',
    category: 'warning',
    description: '避免过度制造焦虑促单',
  },
  {
    name: '贬低竞品',
    pattern: /(宝马|奥迪|奔驰|雷克萨斯).*?(垃圾|不行|差|烂|坑|骗)/,
    action: 'warn',
    category: 'warning',
    description: '避免贬低竞品',
  },
  {
    name: '骚扰式跟进',
    pattern: /(怎么还不|还不.*?回复|为什么.*?不理我|是不是.*?不.*?我了)/,
    action: 'warn',
    category: 'warning',
    description: '避免骚扰式追问',
  },
  // ─── review: 标记审核 ───
  {
    name: '承诺退款',
    pattern: /随时退款|无条件退款|不满意.*?退款|全额.*?退款/,
    action: 'flag_for_review',
    category: 'review',
    description: '退款承诺需核实政策',
  },
  {
    name: '透露个人信息',
    pattern: /(身份证号|银行卡号|手机号).*?(\d{15,19})/,
    action: 'block',
    category: 'forbidden',
    description: '不得在对话中透露/索要隐私信息',
  },
]

// ─── 核心：伦理审查 ─────────────────────────────────
/**
 * 审查 AI 生成的回复内容
 * @param content  待审查的回复文本
 * @returns 审查结果：pass / warn / block
 */
export async function ethicsReview(content: string): Promise<EthicsResult> {
  const violations: EthicsViolation[] = []

  // 1. 先查内置规则（硬编码，确保不遗漏）
  for (const rule of BUILTIN_RULES) {
    const match = content.match(rule.pattern)
    if (match) {
      violations.push({
        ruleId: `builtin:${rule.name}`,
        ruleName: rule.name,
        category: rule.category,
        action: rule.action,
        reason: rule.description,
        matched: match[0],
      })
    }
  }

  // 2. 查数据库自定义规则
  try {
    const customRules = await db.ethicsRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
    })

    for (const rule of customRules) {
      try {
        const pattern = new RegExp(JSON.parse(rule.pattern).regex || rule.pattern, 'i')
        const match = content.match(pattern)
        if (match) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category,
            action: rule.action as EthicsViolation['action'],
            reason: rule.description,
            matched: match[0],
          })
        }
      } catch {
        // 规则格式错误，跳过
      }
    }
  } catch {
    // DB 不可用时仅用内置规则
  }

  // 3. 判定最终动作：取最高严重级别
  const severityOrder: Record<string, number> = {
    'block': 3,
    'warn': 2,
    'flag_for_review': 1,
  }

  if (violations.length === 0) {
    return { passed: true, violations: [], action: 'pass' }
  }

  const maxSeverity = Math.max(...violations.map(v => severityOrder[v.action] || 0))
  const action = maxSeverity >= 3 ? 'block' : maxSeverity >= 2 ? 'warn' : 'pass'

  return { passed: action !== 'block', violations, action }
}

// ─── 快捷审查 ───────────────────────────────────────
/**
 * 快速审查，返回是否通过（忽略警告）
 */
export function quickCheck(content: string): boolean {
  // 仅执行内置规则的 block 级别检查
  for (const rule of BUILTIN_RULES) {
    if (rule.action === 'block' && rule.pattern.test(content)) {
      return false
    }
  }
  return true
}

// ─── 规则管理 ───────────────────────────────────────
export async function addRule(data: {
  name: string
  description: string
  category: string
  pattern: string
  action: string
  priority?: number
}) {
  return db.ethicsRule.create({ data })
}

export async function listRules(category?: string) {
  const where: any = {}
  if (category) where.category = category
  return db.ethicsRule.findMany({ where, orderBy: { priority: 'desc' } })
}

export async function toggleRule(id: string, isActive: boolean) {
  return db.ethicsRule.update({ where: { id }, data: { isActive } })
}
