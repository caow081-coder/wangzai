/**
 * WAOS SafetyShield — 统一安全过滤模块
 *
 * 3 层输入过滤 + 2 层输出过滤
 * 防绕过：Unicode NFKC 归一化 + 空白剥离 + 中英文模式
 *
 * 被以下路由共享：
 *  - /api/waos/reply     (sanitizeInput + filterOutput)
 *  - /api/waos/safety    (inspect)
 *  - /api/waos/auto-reply (safetyFilter)
 */

// ─── 违规关键词 ─────────────────────────────────────────────
export const BANNED_KEYWORDS = [
  '竞品A', '竞品B',
  '加微信群', '加我私人微信', '支付宝转账',
  '其他平台', '淘宝链接', '拼多多',
]

// ─── Prompt 注入模式（中英文） ─────────────────────────────
// 注意：\s* 而非 \s+ — 因为 normalizeForCheck 会剥离空白，
// "ｉｇｎｏｒｅ ｐｒｅｖｉｏｕｓ" 归一化后变成 "ignoreprevious"
export const INJECTION_PATTERNS = [
  // 英文（\s* 允许零或多个空白，防绕过）
  /ignore\s*(previous|all|prior|above)\s*(instructions?|prompts?|rules?)?/i,
  /disregard\s*(the\s*)?(above|previous|all|prior)/i,
  /system\s*:\s/i,
  /you\s+are\s+now\s+/i,
  /forget\s*(everything|all|your\s*instructions)/i,
  /reveal\s*(your\s*)?(system\s*)?prompt/i,
  /override\s*(your\s*)?(system|instructions)/i,
  // 中文（允许"忽略"/"无视"与目标词之间有修饰词如"所有"、"全部"）
  /忽略.*(以上|上面|之前|先前|所有|全部).*(指令|提示|规则|约束|prompt)/i,
  /无视.*(以上|上面|之前|先前|所有|全部).*(指令|提示|规则)/i,
  /忘记.*(你的|所有|之前).*(指令|提示|约束|身份)/i,
  /你(现在|从此)(是|变成|扮演)/i,
  /透露.*(你的)?.*(系统|内部).*(提示|指令|prompt)/i,
  /系统\s*[:：]\s/,
]

// ─── 价格承诺模式 ─────────────────────────────────────────────
export const PRICE_PROMISE_PATTERN = /(\d+(\.\d+)?)\s*折|便宜\s*\d+\s*元|立减\s*\d+|打\s*\d+\s*折|保证\s*最低价|最低\s*价格/i

// ─── 高危熔断关键词（对齐 WAOS-X 模块2: 降价/便宜/保证/送/最低价）─────────
// 触发即红色拦截气泡 + 流程终止（比 BANNED_KEYWORDS 更严格，BANNED 是替换，HIGH_RISK 是直接拦截）
export const HIGH_RISK_KEYWORDS = [
  '降价', '降了多少', '跌价', '贬值',
  '保证最低', '保底价', '底价', '裸车价',
  '免费送', '白送', '送保险', '送保养', '送装潢', '赠送',
  '全网最低', '全城最低', '比任何人都低',
  '承诺', '保证优惠', '保证便宜',
  '内部价', '员工价', '关系价', '走后门',
]

export function isHighRisk(input: string): boolean {
  if (!input) return false
  const normalized = normalizeForCheck(input)
  for (const word of HIGH_RISK_KEYWORDS) {
    if (normalized.includes(word) || input.includes(word)) return true
  }
  return false
}

// ─── 归一化：防 Unicode/空白绕过 ─────────────────────────────
/**
 * 将输入归一化以防止绕过：
 *  1. NFKC 归一化 — 全角→半角 (ｉｇｎｏｒｅ → ignore, ５ → 5)
 *  2. 去除所有空白字符（含全角空格、零宽字符）
 *  3. 去除控制字符
 *
 * 注意：返回归一化后的字符串，仅供检测使用；
 *       实际传给 LLM 的仍是原始输入。
 */
export function normalizeForCheck(input: string): string {
  if (!input) return ''
  return input
    .normalize('NFKC')                          // 全角→半角
    .replace(/[\u200B-\u200D\uFEFF]/g, '')      // 零宽字符
    .replace(/\s+/g, '')                        // 所有空白（含\n\t\r全角空格）
}

// ─── 输入检测 ─────────────────────────────────────────────
export interface SanitizeResult {
  ok: boolean
  reason?: string
  layer?: 'injection' | 'banned' | 'price' | 'high_risk'
}

export function sanitizeInput(rawInput: string): SanitizeResult {
  if (!rawInput) return { ok: true }
  const normalized = normalizeForCheck(rawInput)

  // 第 0 层：高危熔断（最高优先级，对齐 WAOS-X 模块2）
  if (isHighRisk(rawInput)) {
    const matched = HIGH_RISK_KEYWORDS.find(w => normalized.includes(w) || rawInput.includes(w))
    return { ok: false, reason: `高危熔断: ${matched}`, layer: 'high_risk' }
  }

  // 第 1 层：Prompt 注入检测
  for (const p of INJECTION_PATTERNS) {
    if (p.test(normalized) || p.test(rawInput)) {
      return { ok: false, reason: `Prompt 注入检测: ${p.source.slice(0, 40)}`, layer: 'injection' }
    }
  }

  // 第 2 层：违规关键词检测
  for (const word of BANNED_KEYWORDS) {
    if (normalized.includes(word) || rawInput.includes(word)) {
      return { ok: false, reason: `输入包含违规词: ${word}`, layer: 'banned' }
    }
  }

  // 第 3 层：价格承诺检测
  if (PRICE_PROMISE_PATTERN.test(normalized) || PRICE_PROMISE_PATTERN.test(rawInput)) {
    const m = rawInput.match(PRICE_PROMISE_PATTERN) || normalized.match(PRICE_PROMISE_PATTERN)
    return { ok: false, reason: `价格承诺请求: ${m?.[0]}`, layer: 'price' }
  }

  return { ok: true }
}

// ─── 输出过滤 ─────────────────────────────────────────────
export interface FilterResult {
  safe: string
  filtered: boolean
  reason?: string
  layer?: 'banned' | 'price' | 'high_risk'
}

export function filterOutput(rawOutput: string): FilterResult {
  if (!rawOutput) return { safe: '', filtered: false }
  const normalized = normalizeForCheck(rawOutput)

  // 第 0 层：高危熔断（AI 回复含"降价/保证最低/送保险"等，直接拦截）
  if (isHighRisk(rawOutput)) {
    const matched = HIGH_RISK_KEYWORDS.find(w => normalized.includes(w) || rawOutput.includes(w))
    return {
      safe: '【高危拦截】抱歉，这个问题我需要请主管亲自为您解答，请稍等。',
      filtered: true,
      reason: `高危词: ${matched}`,
      layer: 'high_risk',
    }
  }

  // 第 1 层：违规关键词替换
  for (const word of BANNED_KEYWORDS) {
    if (normalized.includes(word) || rawOutput.includes(word)) {
      return {
        safe: '【系统拦截】抱歉，关于这个问题我无法直接回答，请允许我请主管为您解答。',
        filtered: true,
        reason: `违规词: ${word}`,
        layer: 'banned',
      }
    }
  }

  // 第 2 层：价格承诺替换
  const m = normalized.match(PRICE_PROMISE_PATTERN) || rawOutput.match(PRICE_PROMISE_PATTERN)
  if (m) {
    return {
      safe: '抱歉，具体优惠我需要帮您向主管申请一下，请稍等。',
      filtered: true,
      reason: `价格承诺: ${m[0]}`,
      layer: 'price',
    }
  }

  return { safe: rawOutput, filtered: false }
}

// ─── 系统约束（人设+安全规则） ─────────────────────────────
export const SYSTEM_CONSTRAINTS = `你是一名经验丰富的私域运营顾问，负责和潜在客户进行微信对话。

严格约束（绝对不能违反）：
1. 绝对不能承诺任何具体价格折扣（如"5折"、"立减100元"），只能说"我帮您申请一下优惠"或"我可以问问主管有没有活动"。
2. 绝对不能提供其他电商平台的链接或联系方式。
3. 不能编造产品功能、库存数量、发货时间。
4. 遇到骂人、政治敏感、黄赌毒话题，只回复："抱歉，无法理解您的意思，请问还有其他产品问题吗？"
5. 保持人设：温和专业、不卑不亢、引导成交但不逼迫。
6. 单次回复不超过 80 字，符合微信聊天节奏。
7. 永远不要在回复中提及"我是一个 AI"、"作为语言模型"等暴露身份的话。`
