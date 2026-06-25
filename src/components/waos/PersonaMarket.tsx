'use client'

/**
 * WAOS 人设模板市场 — 导入 / 导出 / 分享 / 应用预设
 *
 * 设计目标：
 *  - 提供 8 个内置预设人设模板（5 镜像 + 3 新增：新能源/性能车/二手车）
 *  - 支持把任意人设导出为 JSON 文件（含 business/contact/skillConfig/styleExtends 全字段）
 *  - 支持上传 JSON 文件导入新人设
 *  - 支持生成 base64 短分享码，可粘贴分享 / 从分享码导入
 *  - 支持基于现有人设复制（duplicatePersona）
 *
 * UI：
 *  - Dialog 全屏弹窗，3 列卡片布局展示模板
 *  - 每个卡片：头像 + 名称 + 角色徽章 + 车型标签 + 价格区间 + 核心技能（前 3 个）+ 应用/导出按钮
 *  - 顶部工具条：导入 JSON / 复制当前 / 分享码输入区
 */

import { useOpsStore, PERSONA_TEMPLATES, type PersonaTemplate } from '@/store/useOpsStore'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Download, Upload, Copy, Share2, Check, Sparkles, X, FileJson, ClipboardPaste,
  Car, Tag, Zap, Trophy,
} from 'lucide-react'
import { toast } from 'sonner'
import { useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// 角色徽章颜色映射（不使用 indigo/blue 主色）
const ROLE_BADGE_CLASS: Record<PersonaTemplate['role'], string> = {
  sales:     'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  service:   'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  expert:    'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  lifestyle: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  marketing: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  bd:        'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  custom:    'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
}

const ROLE_LABEL: Record<PersonaTemplate['role'], string> = {
  sales: '销售', service: '售后', expert: '专家', lifestyle: '生活方式',
  marketing: '营销', bd: '商务', custom: '自定义',
}

const CATEGORY_LABEL: Record<PersonaTemplate['category'], string> = {
  '销售': '销售', '售后': '售后', '运营': '运营', '市场': '市场',
  '新能源': '新能源', '性能车': '性能车', '二手车': '二手车',
}

export function PersonaMarket() {
  const open = useOpsStore(s => s.personaMarketOpen)
  const close = useOpsStore(s => s.closePersonaMarket)
  const personas = useOpsStore(s => s.personas)
  const applyPersonaTemplate = useOpsStore(s => s.applyPersonaTemplate)
  const exportPersona = useOpsStore(s => s.exportPersona)
  const importPersona = useOpsStore(s => s.importPersona)
  const duplicatePersona = useOpsStore(s => s.duplicatePersona)
  const generateShareCode = useOpsStore(s => s.generateShareCode)
  const importFromShareCode = useOpsStore(s => s.importFromShareCode)
  const openPersonaEditor = useOpsStore(s => s.openPersonaEditor)

  // 分享码相关状态
  const [shareCodeOut, setShareCodeOut] = useState('')
  const [shareCodeIn, setShareCodeIn] = useState('')
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('')

  // 分类过滤
  const [activeCategory, setActiveCategory] = useState<string>('全部')

  // 文件上传引用
  const fileInputRef = useRef<HTMLInputElement>(null)

  const categories = useMemo(() => {
    const set = new Set<string>(['全部'])
    PERSONA_TEMPLATES.forEach(t => set.add(t.category))
    return Array.from(set)
  }, [])

  const filteredTemplates = useMemo(() => {
    if (activeCategory === '全部') return PERSONA_TEMPLATES
    return PERSONA_TEMPLATES.filter(t => t.category === activeCategory)
  }, [activeCategory])

  // ─── 应用预设模板 ───
  const handleApplyTemplate = (tpl: PersonaTemplate) => {
    const newId = applyPersonaTemplate(tpl.templateId)
    if (newId) {
      toast.success(`已应用模板：${tpl.name}`, { description: '可在人设编辑器中继续微调' })
      close()
      // 打开新人设的编辑器
      setTimeout(() => openPersonaEditor(newId), 200)
    } else {
      toast.error('应用模板失败')
    }
  }

  // ─── 导出人设为 JSON 文件 ───
  const handleExportPersona = (personaId: string, personaName: string) => {
    const json = exportPersona(personaId)
    if (!json) {
      toast.error('导出失败：人设不存在')
      return
    }
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeName = personaName.replace(/[^\w\u4e00-\u9fa5]/g, '_')
    a.href = url
    a.download = `waos-persona-${safeName}-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`已导出人设：${personaName}`)
  }

  // ─── 导出模板为 JSON（与导出人设类似，但来自 PERSONA_TEMPLATES）───
  const handleExportTemplate = (tpl: PersonaTemplate) => {
    const json = JSON.stringify({
      __type: 'waos-persona-v1',
      exportedAt: new Date().toISOString(),
      persona: {
        name: tpl.name,
        shortName: tpl.shortName,
        avatar: tpl.avatar,
        color: tpl.color,
        gradient: tpl.gradient,
        description: tpl.description,
        role: tpl.role,
        cvr: tpl.cvr,
        capacity: tpl.capacity,
        systemPrompt: tpl.systemPrompt,
        skills: tpl.skills,
        specialties: tpl.specialties,
        business: tpl.business,
        contact: tpl.contact,
        skillConfig: tpl.skillConfig,
        styleExtends: tpl.styleExtends,
      },
    }, null, 2)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `waos-template-${tpl.templateId}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`已导出模板：${tpl.name}`)
  }

  // ─── 导入 JSON 文件 ───
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      const newId = importPersona(text)
      if (newId) {
        toast.success(`已导入人设：${file.name}`)
        close()
        setTimeout(() => openPersonaEditor(newId), 200)
      } else {
        toast.error('导入失败：JSON 格式不正确')
      }
    }
    reader.onerror = () => toast.error('读取文件失败')
    reader.readAsText(file, 'utf-8')
    // 清空 input，方便重复导入同一个文件
    e.target.value = ''
  }

  // ─── 复制人设 ───
  const handleDuplicate = (personaId: string, personaName: string) => {
    duplicatePersona(personaId)
    toast.success(`已复制人设：${personaName}`)
  }

  // ─── 生成分享码 ───
  const handleGenerateShareCode = (personaId: string) => {
    const code = generateShareCode(personaId)
    if (!code) {
      toast.error('生成分享码失败')
      return
    }
    setShareCodeOut(code)
    setSelectedPersonaId(personaId)
    // 自动复制到剪贴板
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(
        () => toast.success('分享码已复制到剪贴板'),
        () => toast.info('分享码已生成，请手动复制')
      )
    } else {
      toast.info('分享码已生成，请手动复制')
    }
  }

  // ─── 从分享码导入 ───
  const handleImportFromCode = () => {
    if (!shareCodeIn.trim()) {
      toast.error('请输入分享码')
      return
    }
    const newId = importFromShareCode(shareCodeIn.trim())
    if (newId) {
      toast.success('已从分享码导入人设')
      setShareCodeIn('')
      close()
      setTimeout(() => openPersonaEditor(newId), 200)
    } else {
      toast.error('分享码无效或已损坏')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* ─── Header ─── */}
        <DialogHeader className="px-5 py-4 border-b border-border/60 bg-card/60 shrink-0">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            人设模板市场
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {PERSONA_TEMPLATES.length} 个预设模板
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            一键应用预设模板 / 导入导出 JSON / 生成分享码。所有操作实时同步到本地存储。
          </DialogDescription>
        </DialogHeader>

        {/* ─── 顶部工具条：导入 / 分享码 ─── */}
        <div className="px-5 py-3 border-b border-border/60 bg-muted/30 shrink-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* 隐藏的文件上传 input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-3.5 h-3.5 mr-1" /> 导入 JSON
            </Button>
            <div className="flex items-center gap-1.5 ml-auto">
              <Input
                value={shareCodeIn}
                onChange={e => setShareCodeIn(e.target.value)}
                placeholder="粘贴分享码…"
                className="h-8 w-56 text-[11px] font-mono"
              />
              <Button size="sm" variant="outline" onClick={handleImportFromCode} disabled={!shareCodeIn.trim()}>
                <ClipboardPaste className="w-3.5 h-3.5 mr-1" /> 导入分享码
              </Button>
            </div>
          </div>

          {/* 分享码输出区（生成后展示） */}
          <AnimatePresence>
            {shareCodeOut && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                      <Share2 className="w-3 h-3" />
                      人设分享码（可粘贴给同事 / 跨设备导入）
                    </Label>
                    <button
                      onClick={() => setShareCodeOut('')}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={shareCodeOut}
                    onClick={e => (e.target as HTMLTextAreaElement).select()}
                    className="w-full h-12 text-[10px] font-mono bg-background/60 border border-border/60 rounded p-1.5 resize-none break-all leading-tight waos-scrollbar"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 分类筛选 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">分类：</span>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all ${
                  activeCategory === cat
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:bg-muted border border-transparent'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* ─── 模板卡片网格（可滚动） ─── */}
        <div className="flex-1 overflow-y-auto waos-scrollbar p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredTemplates.map((tpl, idx) => (
              <TemplateCard
                key={tpl.templateId}
                template={tpl}
                index={idx}
                onApply={() => handleApplyTemplate(tpl)}
                onExport={() => handleExportTemplate(tpl)}
              />
            ))}
          </div>

          {/* ─── 现有人设的导出/复制/分享区 ─── */}
          <div className="mt-6 pt-4 border-t border-border/60">
            <div className="flex items-center gap-1.5 mb-3">
              <FileJson className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[12px] font-semibold">我的人设（{personas.length}）</span>
              <span className="text-[10px] text-muted-foreground">— 可导出 / 复制 / 生成分享码</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {personas.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/40 border border-border/60 hover:bg-muted transition-colors"
                >
                  <span className="text-xl shrink-0">{p.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold truncate">{p.name}</span>
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${ROLE_BADGE_CLASS[p.role]}`}>
                        {ROLE_LABEL[p.role]}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {p.business.carModels.slice(0, 3).join('、') || '未配置车型'}
                      {p.business.carModels.length > 3 && ` +${p.business.carModels.length - 3}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => handleExportPersona(p.id, p.name)}
                      title="导出 JSON"
                      className="p-1.5 rounded hover:bg-muted-foreground/15 text-muted-foreground hover:text-foreground"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(p.id, p.name)}
                      title="复制人设"
                      className="p-1.5 rounded hover:bg-muted-foreground/15 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleGenerateShareCode(p.id)}
                      title="生成分享码"
                      className="p-1.5 rounded hover:bg-muted-foreground/15 text-muted-foreground hover:text-foreground"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Footer ─── */}
        <DialogFooter className="px-5 py-3 border-t border-border/60 bg-card/60 flex-row justify-between items-center shrink-0">
          <span className="text-[10px] text-muted-foreground">
            💡 模板应用后会在人设列表末尾追加，不会覆盖现有人设
          </span>
          <Button size="sm" variant="outline" onClick={close}>
            <X className="w-3.5 h-3.5 mr-1" /> 关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 模板卡片 — 展示头像/名称/角色徽章/车型标签/价格/核心技能/操作按钮
// ═══════════════════════════════════════════════════════════════════
function TemplateCard({
  template, index, onApply, onExport,
}: {
  template: PersonaTemplate
  index: number
  onApply: () => void
  onExport: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      className="flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all"
    >
      {/* ─── 头部：头像 + 名称 + 角色徽章 ─── */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <div
          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${template.gradient} flex items-center justify-center text-2xl shadow-sm shrink-0`}
        >
          {template.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold truncate">{template.name}</span>
          </div>
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">{template.description}</div>
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${ROLE_BADGE_CLASS[template.role]}`}>
              {ROLE_LABEL[template.role]}
            </Badge>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-zinc-500/30 text-zinc-600 dark:text-zinc-300">
              {CATEGORY_LABEL[template.category]}
            </Badge>
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Trophy className="w-2.5 h-2.5" />
              成交率 {(template.cvr * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* ─── 车型标签 ─── */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-1 mb-1">
          <Car className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground">销售车型</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {template.business.carModels.slice(0, 5).map(m => (
            <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              {m}
            </span>
          ))}
          {template.business.carModels.length > 5 && (
            <span className="text-[10px] text-muted-foreground">+{template.business.carModels.length - 5}</span>
          )}
          {template.business.primaryModel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 flex items-center gap-0.5">
              <Tag className="w-2.5 h-2.5" />主推 {template.business.primaryModel}
            </span>
          )}
        </div>
      </div>

      {/* ─── 价格区间 ─── */}
      <div className="px-4 pb-2 flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">价格区间</span>
        <span className="text-[11px] font-mono font-semibold text-amber-700 dark:text-amber-400">
          {template.business.priceRange.min} - {template.business.priceRange.max} 万
        </span>
      </div>

      {/* ─── 核心技能（前 3 个） ─── */}
      <div className="px-4 pb-3 flex-1">
        <div className="flex items-center gap-1 mb-1">
          <Zap className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground">核心技能</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {template.skills.slice(0, 3).map(skill => (
            <span key={skill} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground/80">
              {skill}
            </span>
          ))}
          {template.skills.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{template.skills.length - 3}</span>
          )}
        </div>
      </div>

      {/* ─── 操作按钮 ─── */}
      <div className="px-4 pb-4 pt-1 flex gap-2 border-t border-border/40 bg-muted/20">
        <Button size="sm" className="flex-1 h-7 text-[11px]" onClick={onApply}>
          <Check className="w-3 h-3 mr-1" /> 应用此模板
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={onExport} title="导出为 JSON">
          <Download className="w-3 h-3" />
        </Button>
      </div>
    </motion.div>
  )
}
