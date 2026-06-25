'use client'

/**
 * 旺财 · RAG 知识库管理面板
 *
 * 三栏布局（Dialog 全屏弹窗）：
 *  ┌──────────┬───────────────────────────────┬──────────────┐
 *  │ 左 180px │   中 自适应                     │ 右 280px     │
 *  │ 分类树    │   搜索测试 + 文档表格           │ 文档详情编辑  │
 *  └──────────┴───────────────────────────────┴──────────────┘
 *
 * API:
 *  GET  /api/waos/knowledge?view=list&category=...    列出
 *  GET  /api/waos/knowledge?view=search&q=...          检索测试
 *  GET  /api/waos/knowledge?view=stats                 统计
 *  POST /api/waos/knowledge { action: 'add'            新增（编辑=删后加）
 *                            | 'delete' | 'init_seed' }
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  BookOpen, Plus, Upload, Sparkles, Search, Trash2, Save, X,
  Loader2, FileText, Hash, TrendingUp, Clock, Layers, RefreshCw,
  AlertCircle, ChevronRight, FileSearch, Inbox,
} from 'lucide-react'
import { useOpsStore } from '@/store/useOpsStore'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { NoKnowledgeEmpty } from './EmptyStates'

// ─── 常量 ─────────────────────────────────────────────────
/** 知识库分类列表（与种子数据 schema 对齐） */
const CATEGORIES = [
  '全部', '车型', '配置', '价格', '金融', '保养', '试驾', '竞品', 'FAQ',
] as const
type Category = typeof CATEGORIES[number]

/** 分类图标（用 emoji 占位，避免额外依赖） */
const CATEGORY_ICON: Record<Category, string> = {
  '全部': '📚',
  '车型': '🚗',
  '配置': '⚙️',
  '价格': '💰',
  '金融': '🏦',
  '保养': '🔧',
  '试驾': '🛣️',
  '竞品': '⚔️',
  'FAQ': '❓',
}

/** 优先级颜色阈值 */
function priorityColor(p: number): string {
  if (p >= 80) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  if (p >= 50) return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  if (p >= 20) return 'bg-sky-500/15 text-sky-300 border-sky-500/30'
  return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
}

// ─── 类型 ─────────────────────────────────────────────────
/** 文档列表项（与 API list 响应对齐） */
interface KnowledgeDoc {
  id: string
  title: string
  content: string
  category: string
  tags: string        // JSON 字符串
  priority: number
  hitCount: number
  updatedAt: string
}

/** 检索结果项（与 API search 响应对齐） */
interface SearchResultItem {
  doc: {
    id: string
    title: string
    content: string
    category: string
    tags: string[]
    priority: number
  }
  score: number
  matchedKeywords: string[]
}

/** 统计数据 */
interface Stats {
  total: number
  byCategory: Record<string, number>
  totalHits: number
}

/** 添加文档表单 */
interface DocForm {
  title: string
  content: string
  category: string
  tags: string
  priority: number
}

const EMPTY_FORM: DocForm = {
  title: '', content: '', category: '车型', tags: '', priority: 50,
}

// ─── 主组件 ─────────────────────────────────────────────────
export function KnowledgePanel() {
  const open = useOpsStore(s => s.knowledgePanelOpen)
  const close = useOpsStore(s => s.closeKnowledgePanel)

  // 列表与筛选
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [activeCategory, setActiveCategory] = useState<Category>('全部')
  const [stats, setStats] = useState<Stats>({ total: 0, byCategory: {}, totalHits: 0 })

  // 选中编辑
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<DocForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [dirty, setDirty] = useState(false)

  // 搜索测试
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [searching, setSearching] = useState(false)

  // 添加对话框
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addForm, setAddForm] = useState<DocForm>(EMPTY_FORM)
  const [adding, setAdding] = useState(false)

  // 删除确认
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // 批量导入
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  // 初始化种子按钮 loading
  const [seeding, setSeeding] = useState(false)

  // ─── 拉取文档列表 ────────────────────────────────────────
  const refreshList = useCallback(async (category: Category) => {
    setLoadingList(true)
    try {
      const url = category === '全部'
        ? '/api/waos/knowledge?view=list'
        : `/api/waos/knowledge?view=list&category=${encodeURIComponent(category)}`
      const res = await fetch(url)
      const data = await res.json()
      setDocs(data.docs || [])
    } catch (e) {
      toast.error('加载文档列表失败', { description: e instanceof Error ? e.message : '' })
    } finally {
      setLoadingList(false)
    }
  }, [])

  // ─── 拉取统计 ────────────────────────────────────────────
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch('/api/waos/knowledge?view=stats')
      const data = await res.json()
      setStats({
        total: data.total || 0,
        byCategory: data.byCategory || {},
        totalHits: data.totalHits || 0,
      })
    } catch {
      // 静默失败，不打扰用户
    }
  }, [])

  // ─── 打开时 / 切换分类时拉取 ──────────────────────────────
  useEffect(() => {
    if (!open) return
    refreshList(activeCategory)
  }, [open, activeCategory, refreshList])

  // ─── 打开时拉取统计（独立于分类切换） ──────────────────────
  useEffect(() => {
    if (!open) return
    refreshStats()
  }, [open, refreshStats])

  // ─── 选中文档：填充编辑表单 ──────────────────────────────
  const selectedDoc = useMemo(
    () => docs.find(d => d.id === selectedId) || null,
    [docs, selectedId],
  )

  useEffect(() => {
    if (selectedDoc) {
      let tags: string[] = []
      try { tags = JSON.parse(selectedDoc.tags || '[]') } catch { tags = [] }
      setEditForm({
        title: selectedDoc.title,
        content: selectedDoc.content,
        category: selectedDoc.category,
        tags: tags.join(', '),
        priority: selectedDoc.priority,
      })
      setDirty(false)
    } else {
      setEditForm(EMPTY_FORM)
      setDirty(false)
    }
  }, [selectedDoc])

  // ─── 编辑表单变更 ────────────────────────────────────────
  const updateEditField = <K extends keyof DocForm>(key: K, value: DocForm[K]) => {
    setEditForm(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  // ─── 保存编辑（删后加，因为后端没有 update action） ──────
  const handleSave = async () => {
    if (!selectedDoc) return
    if (!editForm.title.trim() || !editForm.content.trim()) {
      toast.error('标题和内容不能为空')
      return
    }
    setSaving(true)
    try {
      // 1. 删旧
      const delRes = await fetch('/api/waos/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: selectedDoc.id }),
      })
      if (!delRes.ok) throw new Error('删除旧文档失败')

      // 2. 加新
      const tagsArray = editForm.tags
        .split(/[,，]/)
        .map(t => t.trim())
        .filter(Boolean)
      const addRes = await fetch('/api/waos/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          title: editForm.title.trim(),
          content: editForm.content.trim(),
          category: editForm.category,
          tags: tagsArray,
          priority: editForm.priority,
        }),
      })
      if (!addRes.ok) throw new Error('保存新文档失败')

      toast.success('已保存', { description: 'RAG 索引已重建' })
      setDirty(false)
      await refreshList(activeCategory)
      await refreshStats()
    } catch (e) {
      toast.error('保存失败', { description: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  // ─── 删除文档 ────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      const res = await fetch('/api/waos/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      })
      if (!res.ok) throw new Error('删除失败')
      toast.success('已删除')
      if (selectedId === id) setSelectedId(null)
      setDeleteConfirmId(null)
      await refreshList(activeCategory)
      await refreshStats()
    } catch (e) {
      toast.error('删除失败', { description: e instanceof Error ? e.message : '' })
    } finally {
      setDeleting(false)
    }
  }

  // ─── 添加文档 ────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addForm.title.trim() || !addForm.content.trim()) {
      toast.error('标题和内容不能为空')
      return
    }
    setAdding(true)
    try {
      const tagsArray = addForm.tags
        .split(/[,，]/)
        .map(t => t.trim())
        .filter(Boolean)
      const res = await fetch('/api/waos/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          title: addForm.title.trim(),
          content: addForm.content.trim(),
          category: addForm.category,
          tags: tagsArray,
          priority: addForm.priority,
        }),
      })
      if (!res.ok) throw new Error('添加失败')
      const data = await res.json()
      toast.success('已添加', { description: `ID: ${data.id?.slice(0, 8)}…` })
      setShowAddDialog(false)
      setAddForm(EMPTY_FORM)
      await refreshList(activeCategory)
      await refreshStats()
    } catch (e) {
      toast.error('添加失败', { description: e instanceof Error ? e.message : '' })
    } finally {
      setAdding(false)
    }
  }

  // ─── 初始化种子 ──────────────────────────────────────────
  const handleInitSeed = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/waos/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init_seed' }),
      })
      if (!res.ok) throw new Error('初始化失败')
      const data = await res.json()
      if (data.count > 0) {
        toast.success(`已导入 ${data.count} 条种子知识`)
      } else {
        toast.info('已有数据，跳过初始化')
      }
      await refreshList(activeCategory)
      await refreshStats()
    } catch (e) {
      toast.error('初始化失败', { description: e instanceof Error ? e.message : '' })
    } finally {
      setSeeding(false)
    }
  }

  // ─── 批量导入 JSON ──────────────────────────────────────
  const handleImportFile = async (file: File) => {
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) {
        throw new Error('JSON 顶层必须是数组')
      }
      let success = 0, failed = 0
      for (const item of parsed) {
        if (!item.title || !item.content) { failed++; continue }
        try {
          const tags = Array.isArray(item.tags) ? item.tags : []
          const res = await fetch('/api/waos/knowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'add',
              title: String(item.title),
              content: String(item.content),
              category: item.category || 'FAQ',
              tags,
              priority: typeof item.priority === 'number' ? item.priority : 50,
            }),
          })
          if (res.ok) success++; else failed++
        } catch {
          failed++
        }
      }
      toast.success(`导入完成`, { description: `成功 ${success} 条 · 失败 ${failed} 条` })
      await refreshList(activeCategory)
      await refreshStats()
    } catch (e) {
      toast.error('导入失败', { description: e instanceof Error ? e.message : 'JSON 解析错误' })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ─── 搜索测试：防抖 350ms ─────────────────────────────────
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/waos/knowledge?view=search&q=${encodeURIComponent(query)}&topK=5`)
        const data = await res.json()
        setSearchResults(data.results || [])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  // ─── 分类计数 ────────────────────────────────────────────
  const categoryCount = (cat: Category): number => {
    if (cat === '全部') return stats.total
    return stats.byCategory[cat] || 0
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[90vh] bg-background border-border p-0 overflow-hidden flex flex-col gap-0"
        showCloseButton={false}
      >
        {/* ─── 顶部标题栏 ─── */}
        <DialogHeader className="px-5 py-3 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center border border-emerald-500/30">
              <BookOpen className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                知识库管理
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                  RAG · TF-IDF
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-[11px] mt-0.5">
                共 {stats.total} 条文档 · 累计命中 {stats.totalHits} 次
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={close}
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
              <span className="sr-only">关闭</span>
            </Button>
          </div>
        </DialogHeader>

        {/* ─── 三栏主体 ─── */}
        <div className="flex-1 min-h-0 flex">
          {/* ── 左栏：分类树 ── */}
          <aside className="w-[180px] shrink-0 border-r border-border bg-muted/20 flex flex-col">
            <div className="px-3 py-2 border-b border-border/60">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Layers className="w-3 h-3" />
                分类
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {CATEGORIES.map(cat => {
                  const active = activeCategory === cat
                  const count = categoryCount(cat)
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] transition-colors group ${
                        active
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'text-foreground/80 hover:bg-muted'
                      }`}
                    >
                      <span className="text-[13px] leading-none">{CATEGORY_ICON[cat]}</span>
                      <span className="flex-1 text-left truncate">{cat}</span>
                      <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                        active
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
            {/* 底部统计摘要 */}
            <div className="px-3 py-2 border-t border-border/60 text-[10px] font-mono text-muted-foreground space-y-0.5">
              <div className="flex justify-between">
                <span>总文档</span>
                <span className="tabular-nums text-foreground/80">{stats.total}</span>
              </div>
              <div className="flex justify-between">
                <span>总命中</span>
                <span className="tabular-nums text-foreground/80">{stats.totalHits}</span>
              </div>
            </div>
          </aside>

          {/* ── 中栏：搜索测试 + 文档表格 ── */}
          <section className="flex-1 min-w-0 flex flex-col bg-background">
            {/* 搜索测试框 */}
            <div className="p-3 border-b border-border bg-muted/10">
              <div className="flex items-center gap-2 mb-1.5">
                <FileSearch className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[11px] font-semibold text-foreground">RAG 检索测试</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  实时返回 Top5 · 相似度分数 · 关键词高亮
                </span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="输入查询，如：GLC多少钱 / C级保养 / 试驾预约"
                  className="pl-8 h-8 text-[12px] bg-background"
                />
                {searching && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
                {query && !searching && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
                  >
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}
              </div>
              {/* 搜索结果 */}
              <AnimatePresence>
                {query.trim() && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto waos-scrollbar pr-1">
                      {searchResults.length === 0 && !searching && (
                        <div className="text-[11px] text-muted-foreground text-center py-3 flex items-center justify-center gap-1.5">
                          <AlertCircle className="w-3 h-3" />
                          无匹配文档（相似度阈值 0.05）
                        </div>
                      )}
                      {searchResults.map((r, i) => (
                        <motion.div
                          key={r.doc.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="p-2 rounded-md border border-border/60 bg-background hover:border-emerald-500/40 transition-colors cursor-pointer"
                          onClick={() => {
                            // 跳转到对应文档（如果在当前列表中）
                            const found = docs.find(d => d.id === r.doc.id)
                            if (found) setSelectedId(r.doc.id)
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${priorityColor(r.doc.priority)}`}>
                              #{i + 1}
                            </Badge>
                            <span className="text-[12px] font-medium text-foreground truncate flex-1">
                              {r.doc.title}
                            </span>
                            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                              {(r.score * 100).toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                            <HighlightedText
                              text={r.doc.content}
                              keywords={r.matchedKeywords}
                            />
                          </p>
                          {r.matchedKeywords.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <Hash className="w-2.5 h-2.5 text-muted-foreground" />
                              {r.matchedKeywords.slice(0, 6).map(k => (
                                <span
                                  key={k}
                                  className="text-[9px] font-mono px-1 py-0 rounded bg-yellow-200/80 dark:bg-yellow-500/20 text-yellow-900 dark:text-yellow-300"
                                >
                                  {k}
                                </span>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 工具栏 */}
            <div className="px-3 py-2 border-b border-border flex items-center gap-1.5 flex-wrap">
              <Button
                size="sm"
                onClick={() => { setAddForm(EMPTY_FORM); setShowAddDialog(true) }}
                className="h-7 text-[11px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30"
              >
                <Plus className="w-3 h-3 mr-1" />
                添加文档
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="h-7 text-[11px]"
              >
                {importing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                批量导入
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleImportFile(f)
                }}
              />
              {stats.total === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleInitSeed}
                  disabled={seeding}
                  className="h-7 text-[11px] border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                >
                  {seeding ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                  初始化种子
                </Button>
              )}
              <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="font-mono">
                  {activeCategory} · {docs.length} 条
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { refreshList(activeCategory); refreshStats() }}
                  className="h-7 px-2"
                  title="刷新"
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* 文档表格 */}
            <ScrollArea className="flex-1 min-h-0">
              {loadingList ? (
                <div className="flex items-center justify-center h-full py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : docs.length === 0 ? (
                stats.total === 0 ? (
                  // 全库为空 → 使用 NoKnowledgeEmpty + 导入种子知识 CTA
                  <NoKnowledgeEmpty
                    onImportSeed={handleInitSeed}
                    importing={seeding}
                    className="h-full"
                  />
                ) : (
                  // 仅当前分类为空 → 简单提示
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                    <Inbox className="w-10 h-10 text-muted-foreground/40 mb-2" />
                    <p className="text-[12px] text-muted-foreground mb-3">
                      {activeCategory === '全部' ? '知识库为空' : `「${activeCategory}」分类暂无文档`}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveCategory('全部')}
                      className="h-7 text-[11px]"
                    >
                      查看全部知识
                    </Button>
                  </div>
                )
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/60">
                      <TableHead className="h-8 text-[10px] uppercase tracking-wider text-muted-foreground w-[40%]">标题</TableHead>
                      <TableHead className="h-8 text-[10px] uppercase tracking-wider text-muted-foreground">分类</TableHead>
                      <TableHead className="h-8 text-[10px] uppercase tracking-wider text-muted-foreground text-right">优先级</TableHead>
                      <TableHead className="h-8 text-[10px] uppercase tracking-wider text-muted-foreground text-right">命中</TableHead>
                      <TableHead className="h-8 text-[10px] uppercase tracking-wider text-muted-foreground">更新时间</TableHead>
                      <TableHead className="h-8 text-[10px] uppercase tracking-wider text-muted-foreground text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docs.map(doc => {
                      const active = doc.id === selectedId
                      return (
                        <TableRow
                          key={doc.id}
                          onClick={() => setSelectedId(doc.id)}
                          className={`cursor-pointer border-border/40 transition-colors ${
                            active ? 'bg-emerald-500/10' : 'hover:bg-muted/50'
                          }`}
                        >
                          <TableCell className="py-2 px-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                              <span className="text-[12px] font-medium text-foreground truncate">
                                {doc.title}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2 px-3">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                              {CATEGORY_ICON[doc.category as Category] || '📄'} {doc.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 px-3 text-right">
                            <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded border ${priorityColor(doc.priority)}`}>
                              {doc.priority}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 px-3 text-right">
                            <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                              {doc.hitCount}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 px-3">
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {formatTime(doc.updatedAt)}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 px-3 text-right">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(doc.id) }}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </section>

          {/* ── 右栏：选中文档详情 ── */}
          <aside className="w-[280px] shrink-0 border-l border-border bg-muted/20 flex flex-col">
            <div className="px-3 py-2 border-b border-border/60 flex items-center gap-1.5">
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                文档详情
              </span>
              {dirty && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 ml-auto border-amber-500/40 text-amber-600 dark:text-amber-400">
                  未保存
                </Badge>
              )}
            </div>

            {selectedDoc ? (
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">
                  {/* 标题 */}
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                      标题
                    </Label>
                    <Input
                      value={editForm.title}
                      onChange={e => updateEditField('title', e.target.value)}
                      className="h-8 text-[12px] bg-background"
                    />
                  </div>

                  {/* 内容 */}
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                      内容
                    </Label>
                    <Textarea
                      value={editForm.content}
                      onChange={e => updateEditField('content', e.target.value)}
                      rows={6}
                      className="text-[12px] bg-background resize-y min-h-[120px]"
                    />
                  </div>

                  {/* 分类 */}
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                      分类
                    </Label>
                    <Select
                      value={editForm.category}
                      onValueChange={v => updateEditField('category', v)}
                    >
                      <SelectTrigger className="h-8 text-[12px] bg-background w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.filter(c => c !== '全部').map(c => (
                          <SelectItem key={c} value={c} className="text-[12px]">
                            {CATEGORY_ICON[c]} {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 标签 */}
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                      标签（逗号分隔）
                    </Label>
                    <Input
                      value={editForm.tags}
                      onChange={e => updateEditField('tags', e.target.value)}
                      placeholder="C级, 轿车, 33万起"
                      className="h-8 text-[12px] bg-background"
                    />
                  </div>

                  {/* 优先级 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        优先级
                      </Label>
                      <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded border ${priorityColor(editForm.priority)}`}>
                        {editForm.priority}
                      </span>
                    </div>
                    <Slider
                      value={[editForm.priority]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={v => updateEditField('priority', v[0])}
                      className="[&_[role=slider]]:bg-emerald-500 [&_[role=slider]]:border-emerald-400 [&_[role=slider]]:w-3.5 [&_[role=slider]]:h-3.5"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-muted-foreground mt-1">
                      <span>低</span>
                      <span>高</span>
                    </div>
                  </div>

                  {/* 元数据 */}
                  <div className="pt-2 border-t border-border/40 space-y-1 text-[10px] font-mono text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Hash className="w-2.5 h-2.5" />
                      <span className="truncate">{selectedDoc.id}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-2.5 h-2.5" />
                      <span>命中 {selectedDoc.hitCount} 次</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{formatTime(selectedDoc.updatedAt)}</span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="pt-2 space-y-2">
                    <Button
                      onClick={handleSave}
                      disabled={saving || !dirty}
                      className="w-full h-8 text-[12px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 disabled:opacity-40"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                      保存
                    </Button>
                    <Button
                      onClick={() => setDeleteConfirmId(selectedDoc.id)}
                      disabled={deleting}
                      variant="outline"
                      className="w-full h-8 text-[12px] border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      删除
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <FileText className="w-10 h-10 text-muted-foreground/30 mb-2" />
                <p className="text-[11px] text-muted-foreground">
                  点击左侧表格选择文档<br />查看与编辑详情
                </p>
              </div>
            )}
          </aside>
        </div>

        {/* ─── 添加文档 Dialog ─── */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-md bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-500" />
                添加文档
              </DialogTitle>
              <DialogDescription className="text-[11px]">
                填写后点击「添加」即可，RAG 索引自动重建
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                  标题 *
                </Label>
                <Input
                  value={addForm.title}
                  onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="如：奔驰C级 2024款"
                  className="h-8 text-[12px]"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                  内容 *
                </Label>
                <Textarea
                  value={addForm.content}
                  onChange={e => setAddForm(p => ({ ...p, content: e.target.value }))}
                  placeholder="如：奔驰C级 2024款 指导价 33.23-37.99万..."
                  rows={5}
                  className="text-[12px] resize-y min-h-[100px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                    分类
                  </Label>
                  <Select
                    value={addForm.category}
                    onValueChange={v => setAddForm(p => ({ ...p, category: v }))}
                  >
                    <SelectTrigger className="h-8 text-[12px] w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter(c => c !== '全部').map(c => (
                        <SelectItem key={c} value={c} className="text-[12px]">
                          {CATEGORY_ICON[c]} {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                    优先级
                  </Label>
                  <div className="flex items-center gap-2 h-8">
                    <Slider
                      value={[addForm.priority]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={v => setAddForm(p => ({ ...p, priority: v[0] }))}
                      className="flex-1"
                    />
                    <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded border ${priorityColor(addForm.priority)}`}>
                      {addForm.priority}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                  标签（逗号分隔）
                </Label>
                <Input
                  value={addForm.tags}
                  onChange={e => setAddForm(p => ({ ...p, tags: e.target.value }))}
                  placeholder="C级, 轿车, 33万起"
                  className="h-8 text-[12px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddDialog(false)}
                className="h-8 text-[12px]"
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={adding}
                className="h-8 text-[12px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30"
              >
                {adding ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                添加
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── 删除确认 Dialog ─── */}
        <Dialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
          <DialogContent className="max-w-sm bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                确认删除
              </DialogTitle>
              <DialogDescription className="text-[12px]">
                删除后无法恢复，RAG 索引将自动重建。是否继续？
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
                className="h-8 text-[12px]"
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                disabled={deleting}
                className="h-8 text-[12px] bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/30"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}

// ─── 子组件：关键词高亮文本 ─────────────────────────────────
/**
 * 将匹配关键词用 <mark> 包裹，用于检索结果展示
 * 仅做字符串子串匹配，按关键词长度降序避免短词覆盖长词
 */
function HighlightedText({ text, keywords }: { text: string; keywords: string[] }) {
  const sortedKws = useMemo(
    () => [...keywords].filter(Boolean).sort((a, b) => b.length - a.length),
    [keywords],
  )
  if (sortedKws.length === 0) return <>{text}</>

  // 构造正则：转义特殊字符
  const escaped = sortedKws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'g')
  const parts = text.split(re)

  return (
    <>
      {parts.map((part, i) => (
        sortedKws.includes(part)
          ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/30 text-inherit rounded px-0.5">{part}</mark>
          : <span key={i}>{part}</span>
      ))}
    </>
  )
}

// ─── 工具：时间格式化 ───────────────────────────────────────
function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin}分钟前`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour}小时前`
    const diffDay = Math.floor(diffHour / 24)
    if (diffDay < 30) return `${diffDay}天前`
    // 超过 30 天显示日期
    return `${d.getMonth() + 1}/${d.getDate()}`
  } catch {
    return iso?.slice(0, 10) || '-'
  }
}
