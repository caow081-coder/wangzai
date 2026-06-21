/**
 * WAOS RAG 知识库服务
 *
 * 不依赖外部 embedding API，用简化版 TF-IDF + 关键词匹配实现本地向量检索
 */

import { db } from '@/lib/db'

// AUDIT-SYS: 扩充停用词，覆盖更多中文常见虚词/语气词/单字（原列表仅 40 词，遗漏较多）
const STOP_WORDS = new Set([
  // 原有词
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '这', '那', '有', '个', '和', '与', '或', '也', '都', '就', '不', '没', '很', '太', '能', '会', '要', '想', '可以', '什么', '怎么', '多少', '为什么', '哪里', '哪个', '请问', '一下', '可能', '应该',
  // 新增虚词/代词/语气词
  '啊', '哦', '嗯', '呀', '哎', '唉', '哈', '嘛', '吧', '呢', '哇', '哟', '喔', '噢',
  '里', '上', '下', '中', '内', '外', '前', '后', '左', '右', '间',
  '大', '小', '多', '少', '高', '低', '长', '短', '好', '坏',
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '百', '千', '万', '亿',
  '说', '做', '看', '听', '走', '来', '去', '到', '过', '为', '给', '对',
  '那个', '这个', '那些', '这些', '那样', '这样', '那种', '这种',
  '已经', '正在', '将要', '刚才', '现在', '以前', '以后', '期间',
  '但是', '可是', '不过', '只是', '只有', '除非', '虽然', '尽管', '即使',
  '因为', '所以', '因此', '于是', '然后', '接着',
  '如果', '假如', '要是', '万一',
  '比较', '非常', '十分', '相当', '极其', '格外',
])

function tokenize(text: string): string[] {
  const clean = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').toLowerCase()
  const tokens: string[] = []
  const enWords = clean.match(/[a-z][a-z0-9]+/g) || []
  tokens.push(...enWords.filter(w => w.length > 1))
  const cnChars = clean.match(/[\u4e00-\u9fa5]+/g) || []
  for (const seg of cnChars) {
    for (let i = 0; i < seg.length - 1; i++) {
      const bigram = seg.slice(i, i + 2)
      if (!STOP_WORDS.has(bigram)) tokens.push(bigram)
    }
    if (seg.length === 1) tokens.push(seg)
  }
  return tokens
}

const docVectors = new Map<string, Map<string, number>>()
let docCount = 0
const df = new Map<string, number>()
let initialized = false
// AUDIT-SYS: 初始化互斥锁，防止并发 ensureInitialized 导致 docVectors/df Map 竞态写入
//   场景：两个 search 请求同时到达，均检测到 initialized=false，同时触发 findMany+计算
//   修复：用 promise 复用，第二次调用复用第一次的 in-flight Promise
let initializingPromise: Promise<void> | null = null

function computeTfIdf(tokens: string[], dfMap: Map<string, number>, totalDocs: number): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)
  const vector = new Map<string, number>()
  for (const [token, freq] of tf) {
    const tfVal = freq / tokens.length
    const dfVal = dfMap.get(token) || 1
    const idfVal = Math.log((totalDocs + 1) / dfVal) + 1
    vector.set(token, tfVal * idfVal)
  }
  return vector
}

function cosineSimilarity(v1: Map<string, number>, v2: Map<string, number>): number {
  let dot = 0, norm1 = 0, norm2 = 0
  for (const [k, val] of v1) {
    norm1 += val * val
    const v2val = v2.get(k)
    if (v2val) dot += val * v2val
  }
  for (const [, val] of v2) norm2 += val * val
  if (norm1 === 0 || norm2 === 0) return 0
  return dot / (Math.sqrt(norm1) * Math.sqrt(norm2))
}

async function ensureInitialized() {
  if (initialized) return
  // AUDIT-SYS: 复用 in-flight Promise，避免并发初始化
  if (initializingPromise) {
    await initializingPromise
    return
  }
  initializingPromise = (async () => {
    const docs = await db.knowledgeDoc.findMany({ select: { id: true, keywords: true, content: true } })
    docCount = docs.length
    df.clear()
    docVectors.clear()
    for (const doc of docs) {
      const tokens = tokenize(doc.keywords + ' ' + doc.content)
      const uniqueTokens = new Set(tokens)
      for (const t of uniqueTokens) df.set(t, (df.get(t) || 0) + 1)
      docVectors.set(doc.id, computeTfIdf(tokens, df, docCount))
    }
    initialized = true
    console.log(`[RAG] 已加载 ${docCount} 个文档，${df.size} 个唯一词`)
  })()
  try {
    await initializingPromise
  } finally {
    initializingPromise = null
  }
}

export interface SearchResult {
  doc: { id: string; title: string; content: string; category: string; tags: string[]; priority: number }
  score: number
  matchedKeywords: string[]
}

export async function search(query: string, options: { topK?: number; category?: string; minScore?: number } = {}): Promise<SearchResult[]> {
  await ensureInitialized()
  // AUDIT-SYS: 提高 minScore 默认值至 0.10，过滤低相关结果（原 0.05 几乎匹配任意文档）
  const { topK = 5, category, minScore = 0.10 } = options
  if (!query.trim()) return []
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []
  const queryVector = computeTfIdf(queryTokens, df, docCount)

  // AUDIT-SYS: 修复 N+1 查询。原实现对每个 docId 单独 findUnique，N 个文档发 N 次 DB 查询。
  //   改为：先算分 → 排序 → 取 topK*2（冗余）→ 一次性 where: { id: { in: [...] } } 批量查询
  const scoredIds: Array<{ docId: string; sim: number }> = []
  for (const [docId, docVec] of docVectors) {
    const sim = cosineSimilarity(queryVector, docVec)
    if (sim < minScore) continue
    scoredIds.push({ docId, sim })
  }
  scoredIds.sort((a, b) => b.sim - a.sim)
  const candidateIds = scoredIds.slice(0, (topK || 5) * 2).map(s => s.docId)
  if (candidateIds.length === 0) return []

  const docRows = await db.knowledgeDoc.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true, title: true, content: true, category: true, tags: true, priority: true, keywords: true },
  })
  const docMap = new Map(docRows.map(d => [d.id, d]))

  const results: SearchResult[] = []
  for (const { docId, sim } of scoredIds) {
    const doc = docMap.get(docId)
    if (!doc) continue
    if (category && doc.category !== category) continue
    const matchedKeywords = queryTokens.filter(t => doc.keywords.includes(t) || doc.content.includes(t))
    results.push({
      doc: { id: doc.id, title: doc.title, content: doc.content, category: doc.category, tags: safeParseTags(doc.tags), priority: doc.priority },
      score: sim,
      matchedKeywords: [...new Set(matchedKeywords)].slice(0, 10),
    })
    if (results.length >= topK) break
  }
  // 按相关性 × 优先级排序
  results.sort((a, b) => (b.score * b.doc.priority) - (a.score * a.doc.priority))
  if (results.length > 0) {
    db.knowledgeDoc.updateMany({
      where: { id: { in: results.map(r => r.doc.id) } },
      data: { hitCount: { increment: 1 } },
    }).catch(() => {})
  }
  return results
}

// AUDIT-SYS: 安全解析 JSON tags，避免 JSON.parse 异常导致整个 search 崩溃
function safeParseTags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function addDoc(data: { title: string; content: string; category?: string; tags?: string[]; keywords?: string; source?: string; priority?: number }): Promise<string> {
  const keywords = data.keywords || extractKeywords(data.title + ' ' + data.content)
  const doc = await db.knowledgeDoc.create({
    data: {
      title: data.title, content: data.content, category: data.category || 'FAQ',
      tags: JSON.stringify(data.tags || []), keywords, source: data.source || 'manual', priority: data.priority ?? 50,
    },
  })
  initialized = false
  return doc.id
}

export async function deleteDoc(id: string) {
  await db.knowledgeDoc.delete({ where: { id } })
  initialized = false
}

export async function listDocs(category?: string, limit = 100) {
  return db.knowledgeDoc.findMany({
    where: category ? { category } : undefined,
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
    select: { id: true, title: true, content: true, category: true, tags: true, priority: true, hitCount: true, updatedAt: true },
  })
}

function extractKeywords(text: string): string {
  const tokens = tokenize(text)
  const freq = new Map<string, number>()
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1)
  return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k]) => k).join(' ')
}

export async function initSeedKnowledgeBase(): Promise<number> {
  const existing = await db.knowledgeDoc.count()
  if (existing > 0) return 0
  const seeds = [
    { title: '奔驰C级 2024款', content: '奔驰C级 2024款 指导价 33.23-37.99万。C200L 约33万起，C260L 约36万起，C300L 约38万。搭载 M254 1.5T/2.0T 发动机 + ISG 集成式启发电机，动力升级油耗更低。竞品：宝马3系、奥迪A4L。', category: '车型', tags: ['C级', 'C200', 'C260', '轿车'], priority: 80 },
    { title: '奔驰GLC 2024款', content: '奔驰GLC 2024款 指导价 42.78-53.13万。GLC260 约43万，GLC300 约50万。SUV销量冠军，轴距 2977mm 空间宽敞。竞品：宝马X3、奥迪Q5L。', category: '车型', tags: ['GLC', 'GLC260', 'GLC300', 'SUV'], priority: 85 },
    { title: '奔驰GLE 2024款', content: '奔驰GLE 2024款 指导价 69.98-88.03万。GLE350 约70万，GLE450 约80万。中大型SUV，7座可选。竞品：宝马X5、奥迪Q7、雷克萨斯RX。', category: '车型', tags: ['GLE', 'GLE350', 'GLE450', 'SUV'], priority: 80 },
    { title: '奔驰E级 2024款', content: '奔驰E级 2024款 指导价 44.01-59.98万。E260L 约44万，E300L 约52万。行政级轿车，后排豪华。竞品：宝马5系、奥迪A6L。', category: '车型', tags: ['E级', 'E260', 'E300', '轿车'], priority: 80 },
    { title: '奔驰S级 2024款', content: '奔驰S级 2024款 指导价 96.26-204.26万。S400L 约96万，S450L 约130万，S480L 约170万。旗舰轿车。迈巴赫S级 170-319万。', category: '车型', tags: ['S级', 'S400', 'S450', '迈巴赫'], priority: 85 },
    { title: '奔驰EQE 纯电', content: '奔驰EQE 47.8-53.43万，EQS 88.1-133.9万。EVA纯电平台，续航最高 770km，支持 128kW 快充。竞品：特斯拉Model S、宝马i7。', category: '车型', tags: ['EQE', 'EQS', '纯电', '新能源'], priority: 80 },
    { title: '奔驰AMG 性能系列', content: 'AMG C43/C63 性能版 60-100万，AMG GLE53/GLE63 高性能SUV 100-200万，AMG GT 四门跑车 100-230万。4.0T V8 双涡轮。', category: '车型', tags: ['AMG', 'C63', 'GLE63', '性能'], priority: 75 },
    { title: '奔驰金融分期方案', content: '奔驰金融最低首付 20%，可享 36/48/60 期分期。部分车型（C级/GLC/E级）可享免息或低息（2.99%）。需资质审核：身份证+收入证明+银行流水。', category: '金融', tags: ['金融', '分期', '首付', '贷款', '免息'], priority: 75 },
    { title: '奔驰老客户置换补贴', content: '奔驰老客户置换享额外补贴 5000-20000 元（视车型）。非奔驰品牌置换补贴 3000-10000 元。需提供旧车登记证+行驶证。', category: '金融', tags: ['置换', '补贴', '老客户', '二手车'], priority: 70 },
    { title: '奔驰保养周期与费用', content: '奔驰 A保约 1500-2000 元/1万公里，B保约 3000-4000 元/2万公里。星时享套餐更优惠。首保 5000 公里或 6 个月免费。', category: '保养', tags: ['保养', 'A保', 'B保', '费用'], priority: 75 },
    { title: '奔驰质保政策', content: '奔驰新车 3 年不限里程质保，电池 8 年 16 万公里（新能源）。免费道路救援 3 年。延保套餐可选 4/5 年。', category: '保养', tags: ['质保', '保修', '道路救援'], priority: 70 },
    { title: '试驾预约流程', content: '试驾需预约，带身份证+驾驶证。周末名额紧张建议提前 1-2 天预约。可安排上门试驾（限同城 30km 内）。试驾时长约 30 分钟。', category: '试驾', tags: ['试驾', '预约', '上门'], priority: 70 },
    { title: 'GLC vs 宝马X3', content: 'GLC 优势：内饰豪华、空间大、9AT 平顺；X3 优势：操控好、品牌运动感强。GLC 价格略低，性价比更高。', category: '竞品', tags: ['GLC', 'X3', '宝马', '对比'], priority: 65 },
    { title: 'E级 vs 宝马5系', content: 'E级 优势：后排豪华、行政气场、内饰设计领先；5系 优势：操控好、科技感强。E级商务属性更强。', category: '竞品', tags: ['E级', '5系', '宝马', '对比'], priority: 65 },
    { title: '现车与提车周期', content: '热门车型（C级/GLC/E级）通常有现车，当天可提。冷门配置或迈巴赫需预订 1-3 个月。可先交 5000 元意向金锁车。', category: 'FAQ', tags: ['现车', '提车', '预订'], priority: 70 },
    { title: '购车赠品清单', content: '常规赠品：脚垫、贴膜、行车记录仪、首保免费。可谈赠品：装潢、保养套餐、保险补贴。年底冲量赠品更丰厚。', category: 'FAQ', tags: ['赠品', '脚垫', '贴膜'], priority: 60 },
  ]
  let count = 0
  for (const seed of seeds) { await addDoc(seed); count++ }
  console.log(`[RAG] 已导入 ${count} 条种子知识`)
  return count
}
