'use client'

/**
 * 旺财 · SOP 引擎 — 主面板（三栏 + 底部日志）
 *
 * 布局：
 *  ┌────────────┬───────────────────────┬──────────────┐
 *  │ 左 200px   │   中 自适应            │ 右 260px     │
 *  │ SOP 列表   │   SopDesigner 画布     │ 属性面板     │
 *  │            │                       │              │
 *  ├────────────┴───────────────────────┴──────────────┤
 *  │ 底部 SopRunLog（可折叠）                            │
 *  └────────────────────────────────────────────────────┘
 *
 * 状态管理：所有编辑状态（nodes/edges/selectedNodeId）由本组件持有，
 *           SopDesigner / PropertiesPanel 通过 props 受控。
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Plus, Trash2, Loader2, RefreshCw, Play,
  Settings2, Code2, AlertCircle,
  Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SopDesigner } from './SopDesigner'
import { SopRunLog } from './SopRunLog'
import type {
  SopDefinition, SopNode, SopEdge, SopInstance, NodeType, SkillDefinition,
} from '@/lib/sop/types'

// ─── 常量 ────────────────────────────────────────────────
const CATEGORIES = ['默认流程', '营销流程', '售后流程'] as const

const NODE_TYPE_ICON: Record<NodeType, string> = {
  trigger: '🟢', skill: '⚡', condition: '◆', wait: '⏳', notify: '🔔', end: '🟥',
}

// ─── 主组件 ────────────────────────────────────────────────
export function SopPanel() {
  // SOP 列表
  const [definitions, setDefinitions] = useState<SopDefinition[]>([])
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null)
  const [loadingDefs, setLoadingDefs] = useState(true)

  // 草稿状态（编辑中的 nodes/edges，未保存）
  const [draftNodes, setDraftNodes] = useState<SopNode[]>([])
  const [draftEdges, setDraftEdges] = useState<SopEdge[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  // 运行实例
  const [instances, setInstances] = useState<SopInstance[]>([])
  const [currentInstanceId, setCurrentInstanceId] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // 对话框
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showRunDialog, setShowRunDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SopDefinition | null>(null)

  // 可用 Skill 列表（用于属性面板选择）
  const [skills, setSkills] = useState<SkillDefinition[]>([])

  // ─── 选中 SOP 定义（derived） ────────────────────────────
  const selectedDef = useMemo(
    () => definitions.find(d => d.id === selectedDefId) || null,
    [definitions, selectedDefId]
  )

  const selectedNode = useMemo(
    () => draftNodes.find(n => n.id === selectedNodeId) || null,
    [draftNodes, selectedNodeId]
  )

  const currentInstance = useMemo(
    () => instances.find(i => i.id === currentInstanceId) || null,
    [instances, currentInstanceId]
  )

  // ─── 拉取 SOP 列表 ────────────────────────────────────────
  const refreshDefinitions = useCallback(async () => {
    setLoadingDefs(true)
    try {
      const res = await fetch('/api/waos/sop?view=definitions')
      const data = await res.json()
      if (data.definitions) {
        setDefinitions(data.definitions)
        // 如果还没有选中，自动选第一个
        if (!selectedDefId && data.definitions.length > 0) {
          setSelectedDefId(data.definitions[0].id)
        }
      }
    } catch (e) {
      toast.error('加载 SOP 列表失败', { description: e instanceof Error ? e.message : '' })
    } finally {
      setLoadingDefs(false)
    }
  }, [selectedDefId])

  // ─── 拉取 Skill 列表 ────────────────────────────────────────
  useEffect(() => {
    fetch('/api/waos/sop?view=skills')
      .then(r => r.json())
      .then(d => setSkills(d.skills || []))
      .catch(e => console.error('[SopPanel] load skills failed:', e))
  }, [])

  // ─── 拉取实例列表 ────────────────────────────────────────
  const refreshInstances = useCallback(async () => {
    try {
      const res = await fetch('/api/waos/sop?view=instances&limit=50')
      const data = await res.json()
      if (data.instances) {
        setInstances(data.instances)
        // 更新运行状态
        const cur = data.instances.find((i: SopInstance) => i.id === currentInstanceId)
        if (cur) {
          setIsRunning(cur.status === 'running')
          if (cur.status !== 'running' && cur.status !== 'paused') {
            toast.success(`SOP 实例已${cur.status === 'completed' ? '完成' : cur.status === 'failed' ? '失败' : '终止'}`)
          }
        }
      }
    } catch (e) {
      console.error('[SopPanel] refresh instances failed:', e)
    }
  }, [currentInstanceId])

  // 初次加载
  useEffect(() => { refreshDefinitions() }, [refreshDefinitions])
  useEffect(() => { refreshInstances() }, [refreshInstances])

  // 运行中自动刷新实例列表
  useEffect(() => {
    if (!isRunning) return
    const timer = setInterval(refreshInstances, 2000)
    return () => clearInterval(timer)
  }, [isRunning, refreshInstances])

  // ─── 切换 SOP 定义时同步草稿 ────────────────────────────────
  useEffect(() => {
    if (selectedDef) {
      setDraftNodes(selectedDef.nodes.map(n => ({ ...n })))
      setDraftEdges(selectedDef.edges.map(e => ({ ...e })))
      setSelectedNodeId(null)
      setIsDirty(false)
    } else {
      setDraftNodes([])
      setDraftEdges([])
    }
  }, [selectedDef?.id])

  // ─── 创建 SOP ────────────────────────────────────────────────
  const handleCreate = useCallback(async (data: {
    name: string
    description: string
    category: string
  }) => {
    try {
      // 创建一个最小 SOP：trigger → end
      const newNodes: SopNode[] = [
        { id: 'n1', type: 'trigger', name: '开始', position: { x: 250, y: 50 } },
        { id: 'n2', type: 'end', name: '结束', endStatus: 'success', position: { x: 250, y: 200 } },
      ]
      const newEdges: SopEdge[] = [
        { id: 'e1', from: 'n1', to: 'n2' },
      ]
      const res = await fetch('/api/waos/sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: data.name,
          description: data.description,
          category: data.category,
          triggerType: 'manual',
          nodes: newNodes,
          edges: newEdges,
        }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success(`SOP「${data.name}」已创建`)
        setShowCreateDialog(false)
        await refreshDefinitions()
        setSelectedDefId(result.definition.id)
      } else {
        toast.error('创建失败', { description: result.error })
      }
    } catch (e) {
      toast.error('创建失败', { description: e instanceof Error ? e.message : '' })
    }
  }, [refreshDefinitions])

  // ─── 保存 SOP ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedDef) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/waos/sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: selectedDef.id,
          name: selectedDef.name,
          description: selectedDef.description,
          nodes: draftNodes,
          edges: draftEdges,
          category: selectedDef.category,
          isActive: selectedDef.isActive,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('SOP 已保存')
        setIsDirty(false)
        await refreshDefinitions()
      } else {
        toast.error('保存失败', { description: data.error })
      }
    } catch (e) {
      toast.error('保存失败', { description: e instanceof Error ? e.message : '' })
    } finally {
      setIsSaving(false)
    }
  }, [selectedDef, draftNodes, draftEdges, refreshDefinitions])

  // ─── 删除 SOP ────────────────────────────────────────────────
  const handleDelete = useCallback(async (def: SopDefinition) => {
    try {
      const res = await fetch('/api/waos/sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: def.id }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`SOP「${def.name}」已删除`)
        if (selectedDefId === def.id) setSelectedDefId(null)
        setDeleteTarget(null)
        await refreshDefinitions()
      } else {
        toast.error('删除失败', { description: data.error })
      }
    } catch (e) {
      toast.error('删除失败', { description: e instanceof Error ? e.message : '' })
    }
  }, [selectedDefId, refreshDefinitions])

  // ─── 激活/停用 ────────────────────────────────────────────────
  const handleToggleActive = useCallback(async (def: SopDefinition, isActive: boolean) => {
    try {
      const res = await fetch('/api/waos/sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate', id: def.id, isActive }),
      })
      const data = await res.json()
      if (data.success) {
        setDefinitions(prev => prev.map(d => d.id === def.id ? { ...d, isActive } : d))
        toast.success(isActive ? `已激活「${def.name}」` : `已停用「${def.name}」`)
      }
    } catch (e) {
      toast.error('切换失败', { description: e instanceof Error ? e.message : '' })
    }
  }, [])

  // ─── 初始化预设模板 ────────────────────────────────────────
  const handleInitPresets = useCallback(async () => {
    try {
      const res = await fetch('/api/waos/sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init_presets' }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('预设模板已初始化')
        await refreshDefinitions()
      }
    } catch (e) {
      toast.error('初始化失败', { description: e instanceof Error ? e.message : '' })
    }
  }, [refreshDefinitions])

  // ─── 运行 SOP ────────────────────────────────────────────────
  const handleRun = useCallback(async (customerInfo: {
    customerId: string
    customerName: string
    message: string
  }) => {
    if (!selectedDef) return
    setShowRunDialog(false)
    try {
      const res = await fetch('/api/waos/sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run',
          sopDefinitionId: selectedDef.id,
          customerId: customerInfo.customerId,
          customerName: customerInfo.customerName,
          initialContext: customerInfo.message
            ? { message: customerInfo.message }
            : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`SOP「${selectedDef.name}」已启动`, {
          description: `实例 ${data.instance.id.slice(0, 12)}...`,
        })
        setCurrentInstanceId(data.instance.id)
        setIsRunning(true)
        await refreshInstances()
      } else {
        toast.error('启动失败', { description: data.error })
      }
    } catch (e) {
      toast.error('启动失败', { description: e instanceof Error ? e.message : '' })
    }
  }, [selectedDef, refreshInstances])

  // ─── 暂停/恢复/终止 ────────────────────────────────────────
  const handlePause = useCallback(async () => {
    if (!currentInstanceId) return
    try {
      await fetch('/api/waos/sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause', instanceId: currentInstanceId }),
      })
      toast.success('实例已暂停')
      await refreshInstances()
    } catch (e) { toast.error('暂停失败') }
  }, [currentInstanceId, refreshInstances])

  const handleResume = useCallback(async () => {
    if (!currentInstanceId) return
    try {
      await fetch('/api/waos/sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume', instanceId: currentInstanceId }),
      })
      toast.success('实例已恢复')
      setIsRunning(true)
      await refreshInstances()
    } catch (e) { toast.error('恢复失败') }
  }, [currentInstanceId, refreshInstances])

  const handleAbort = useCallback(async () => {
    if (!currentInstanceId) return
    try {
      await fetch('/api/waos/sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'abort', instanceId: currentInstanceId }),
      })
      toast.success('实例已终止')
      setIsRunning(false)
      await refreshInstances()
    } catch (e) { toast.error('终止失败') }
  }, [currentInstanceId, refreshInstances])

  // ─── 节点编辑 ────────────────────────────────────────────────
  const handleNodesChange = useCallback((newNodes: SopNode[]) => {
    setDraftNodes(newNodes)
    setIsDirty(true)
  }, [])

  const handleAddNode = useCallback((node: SopNode) => {
    setDraftNodes(prev => [...prev, node])
    setIsDirty(true)
  }, [])

  const handleUpdateNode = useCallback((id: string, partial: Partial<SopNode>) => {
    setDraftNodes(prev => prev.map(n => n.id === id ? { ...n, ...partial } : n))
    setIsDirty(true)
  }, [])

  const handleDeleteNode = useCallback((id: string) => {
    setDraftNodes(prev => prev.filter(n => n.id !== id))
    setDraftEdges(prev => prev.filter(e => e.from !== id && e.to !== id))
    if (selectedNodeId === id) setSelectedNodeId(null)
    setIsDirty(true)
  }, [selectedNodeId])

  // ─── 渲染 ────────────────────────────────────────────────
  return (
    <div className="h-full min-h-0 flex flex-col bg-background">
      {/* 顶部：左中右三栏 */}
      <div className="flex-1 min-h-0 flex">
        {/* ─── 左栏：SOP 列表 ──────────────────────────────────────────── */}
        <div className="w-[200px] shrink-0 border-r border-border bg-muted/20 flex flex-col">
          <div className="shrink-0 px-3 py-2 border-b border-border bg-background flex items-center justify-between">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Workflow className="w-3.5 h-3.5" />
              SOP 列表
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={refreshDefinitions}
              disabled={loadingDefs}
              title="刷新"
            >
              <RefreshCw className={`w-3 h-3 ${loadingDefs ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {loadingDefs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : definitions.length === 0 ? (
              <div className="p-3 text-center">
                <p className="text-xs text-muted-foreground mb-2">暂无 SOP</p>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleInitPresets}>
                  初始化预设模板
                </Button>
              </div>
            ) : (
              <div className="p-2 space-y-3">
                {CATEGORIES.map(cat => {
                  const defsInCat = definitions.filter(d => d.category === cat)
                  if (defsInCat.length === 0) return null
                  return (
                    <div key={cat}>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1.5">
                        {cat} · {defsInCat.length}
                      </div>
                      <div className="space-y-1">
                        {defsInCat.map(def => (
                          <SopListItem
                            key={def.id}
                            def={def}
                            selected={selectedDefId === def.id}
                            onSelect={() => setSelectedDefId(def.id)}
                            onToggleActive={(v) => handleToggleActive(def, v)}
                            onDelete={() => setDeleteTarget(def)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                {/* 其他分类 */}
                {definitions.filter(d => !CATEGORIES.includes(d.category as typeof CATEGORIES[number])).length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1.5">
                      其他
                    </div>
                    <div className="space-y-1">
                      {definitions.filter(d => !CATEGORIES.includes(d.category as typeof CATEGORIES[number])).map(def => (
                        <SopListItem
                          key={def.id}
                          def={def}
                          selected={selectedDefId === def.id}
                          onSelect={() => setSelectedDefId(def.id)}
                          onToggleActive={(v) => handleToggleActive(def, v)}
                          onDelete={() => setDeleteTarget(def)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* 底部新建按钮 */}
          <div className="shrink-0 p-2 border-t border-border bg-background">
            <Button
              className="w-full h-8 text-xs"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> 新建 SOP
            </Button>
          </div>
        </div>

        {/* ─── 中栏：设计器 ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <SopDesigner
            definition={selectedDef}
            nodes={draftNodes}
            edges={draftEdges}
            selectedNodeId={selectedNodeId}
            currentInstance={currentInstance}
            isSaving={isSaving}
            isRunning={isRunning}
            isDirty={isDirty}
            onSelectNode={setSelectedNodeId}
            onNodesChange={handleNodesChange}
            onAddNode={handleAddNode}
            onSave={handleSave}
            onRun={() => setShowRunDialog(true)}
            onPause={handlePause}
            onResume={handleResume}
            onAbort={handleAbort}
          />
        </div>

        {/* ─── 右栏：属性面板 ──────────────────────────────────────────── */}
        <div className="w-[260px] shrink-0 border-l border-border bg-muted/20">
          <PropertiesPanel
            node={selectedNode}
            skills={skills}
            onUpdate={handleUpdateNode}
            onDelete={handleDeleteNode}
          />
        </div>
      </div>

      {/* ─── 底部：运行日志 ──────────────────────────────────────────── */}
      <SopRunLog
        instanceId={currentInstanceId}
        instances={instances}
        isRunning={isRunning}
      />

      {/* ─── 对话框 ──────────────────────────────────────────── */}
      <CreateSopDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={handleCreate}
      />
      <RunSopDialog
        open={showRunDialog}
        onOpenChange={setShowRunDialog}
        def={selectedDef}
        onRun={handleRun}
      />
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除 SOP</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除「{deleteTarget?.name}」，此操作不可撤销。
              所有运行中的实例也会被终止。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-rose-600 hover:bg-rose-700"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── 左栏：SOP 列表项 ────────────────────────────────────────────
function SopListItem({ def, selected, onSelect, onToggleActive, onDelete }: {
  def: SopDefinition
  selected: boolean
  onSelect: () => void
  onToggleActive: (v: boolean) => void
  onDelete: () => void
}) {
  return (
    <motion.div
      layout
      whileHover={{ x: 1 }}
      className={`group relative rounded-md border cursor-pointer transition-all ${
        selected
          ? 'bg-background border-sky-500 shadow-sm'
          : 'bg-background/60 border-border hover:bg-background hover:border-border/80'
      }`}
      onClick={onSelect}
    >
      <div className="p-2">
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium truncate">{def.name}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
              {def.description || '无描述'}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                {def.triggerType === 'auto_event' ? '🔄 事件' :
                 def.triggerType === 'auto_schedule' ? '⏰ 定时' : '👆 手动'}
              </Badge>
              <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                {def.nodes.length} 节点
              </Badge>
              <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                v{def.version}
              </Badge>
            </div>
          </div>
        </div>

        {/* 激活开关 */}
        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Switch
              checked={def.isActive}
              onCheckedChange={onToggleActive}
              className="scale-75 origin-left"
              onClick={(e) => e.stopPropagation()}
            />
            <span className={`text-[10px] ${def.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
              {def.isActive ? '已激活' : '已停用'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title="删除"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── 右栏：属性面板 ────────────────────────────────────────────
function PropertiesPanel({ node, skills, onUpdate, onDelete }: {
  node: SopNode | null
  skills: SkillDefinition[]
  onUpdate: (id: string, partial: Partial<SopNode>) => void
  onDelete: (id: string) => void
}) {
  if (!node) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
        <Settings2 className="w-10 h-10 mb-3 opacity-30" />
        <div className="text-sm">未选中节点</div>
        <div className="text-xs mt-1 opacity-70">点击画布上的节点编辑属性</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-border bg-background flex items-center gap-2">
        <span className="text-base">{NODE_TYPE_ICON[node.type]}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{node.name}</div>
          <div className="text-[10px] text-muted-foreground">节点 ID: {node.id}</div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* 名称 */}
          <div>
            <Label className="text-[11px] font-medium">节点名称</Label>
            <Input
              value={node.name}
              onChange={(e) => onUpdate(node.id, { name: e.target.value })}
              className="h-8 mt-1 text-xs"
            />
          </div>

          {/* 类型徽章 */}
          <div className="flex items-center gap-2">
            <Label className="text-[11px] font-medium">类型</Label>
            <Badge variant="outline" className="text-[10px]">
              {NODE_TYPE_ICON[node.type]} {node.type}
            </Badge>
          </div>

          {/* 根据类型显示不同的属性编辑器 */}
          {node.type === 'skill' && (
            <SkillNodeEditor
              key={node.id + '_' + JSON.stringify(node.skillParams || {})}
              node={node}
              skills={skills}
              onUpdate={onUpdate}
            />
          )}
          {node.type === 'condition' && (
            <ConditionNodeEditor node={node} onUpdate={onUpdate} />
          )}
          {node.type === 'wait' && (
            <WaitNodeEditor node={node} onUpdate={onUpdate} />
          )}
          {node.type === 'notify' && (
            <NotifyNodeEditor node={node} onUpdate={onUpdate} />
          )}
          {node.type === 'end' && (
            <EndNodeEditor node={node} onUpdate={onUpdate} />
          )}

          {/* 位置信息（只读） */}
          <div className="pt-2 border-t border-border">
            <Label className="text-[11px] font-medium text-muted-foreground">位置</Label>
            <div className="text-[10px] font-mono text-muted-foreground mt-1">
              X: {Math.round(node.position?.x ?? 0)}, Y: {Math.round(node.position?.y ?? 0)}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* 删除按钮 */}
      <div className="shrink-0 p-3 border-t border-border bg-background">
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
          onClick={() => onDelete(node.id)}
          disabled={node.type === 'trigger'}  // trigger 不允许删除
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          {node.type === 'trigger' ? '触发节点不可删除' : '删除此节点'}
        </Button>
      </div>
    </div>
  )
}

// ─── Skill 节点编辑器 ────────────────────────────────────────────
function SkillNodeEditor({ node, skills, onUpdate }: {
  node: SopNode
  skills: SkillDefinition[]
  onUpdate: (id: string, partial: Partial<SopNode>) => void
}) {
  const paramsJson = node.skillParams ? JSON.stringify(node.skillParams, null, 2) : '{}'
  const [paramText, setParamText] = useState(paramsJson)
  const [paramError, setParamError] = useState<string | null>(null)

  const applyParams = () => {
    try {
      const parsed = JSON.parse(paramText)
      onUpdate(node.id, { skillParams: parsed })
      setParamError(null)
      toast.success('参数已应用')
    } catch (e) {
      setParamError(e instanceof Error ? e.message : 'JSON 解析失败')
      toast.error('参数 JSON 解析失败')
    }
  }

  return (
    <>
      <div>
        <Label className="text-[11px] font-medium">Skill 选择</Label>
        <Select
          value={node.skillName || ''}
          onValueChange={(v) => {
            const skill = skills.find(s => s.id === v)
            onUpdate(node.id, {
              skillName: v,
              name: skill?.name || node.name,
            })
          }}
        >
          <SelectTrigger className="h-8 mt-1 text-xs">
            <SelectValue placeholder="选择 Skill" />
          </SelectTrigger>
          <SelectContent>
            {skills.map(s => (
              <SelectItem key={s.id} value={s.id}>
                <span className="text-xs">{s.name}</span>
                <span className="text-[10px] text-muted-foreground ml-1">({s.category})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {node.skillName && (
          <div className="text-[10px] text-muted-foreground mt-1">
            {skills.find(s => s.id === node.skillName)?.description}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium flex items-center gap-1">
            <Code2 className="w-3 h-3" />
            Skill 参数 (JSON)
          </Label>
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2" onClick={applyParams}>
            应用
          </Button>
        </div>
        <Textarea
          value={paramText}
          onChange={(e) => setParamText(e.target.value)}
          className="font-mono text-[10px] mt-1 min-h-[100px]"
          spellCheck={false}
        />
        {paramError && (
          <div className="text-[10px] text-rose-500 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {paramError}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Condition 节点编辑器 ────────────────────────────────────────────
function ConditionNodeEditor({ node, onUpdate }: {
  node: SopNode
  onUpdate: (id: string, partial: Partial<SopNode>) => void
}) {
  const cond = node.condition || { field: '', operator: '==' as const, value: '' }
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
        ◆ 条件配置
      </div>
      <div>
        <Label className="text-[10px]">字段 (context 中的字段)</Label>
        <Input
          value={cond.field}
          onChange={(e) => onUpdate(node.id, {
            condition: { ...cond, field: e.target.value },
          })}
          placeholder="如 valueScore 或 identity.emotion"
          className="h-7 text-[11px] mt-0.5"
        />
      </div>
      <div>
        <Label className="text-[10px]">操作符</Label>
        <Select
          value={cond.operator}
          onValueChange={(v) => onUpdate(node.id, {
            condition: { ...cond, operator: v as typeof cond.operator },
          })}
        >
          <SelectTrigger className="h-7 text-[11px] mt-0.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['==', '!=', '>=', '<=', '>', '<', 'contains'].map(op => (
              <SelectItem key={op} value={op}>{op}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[10px]">值（自动推断类型）</Label>
        <Input
          value={String(cond.value ?? '')}
          onChange={(e) => {
            const raw = e.target.value
            // 自动推断 number / boolean / null / string
            let parsed: unknown = raw
            if (raw === 'null') parsed = null
            else if (raw === 'true') parsed = true
            else if (raw === 'false') parsed = false
            else if (/^-?\d+(\.\d+)?$/.test(raw)) parsed = Number(raw)
            onUpdate(node.id, { condition: { ...cond, value: parsed } })
          }}
          placeholder="如 80 或 PRICE 或 null"
          className="h-7 text-[11px] mt-0.5"
        />
        <div className="text-[9px] text-muted-foreground mt-0.5">
          数字 / true / false / null / 字符串
        </div>
      </div>
      <div className="p-2 rounded bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
        💡 出边需配置 YES / NO 条件标签
      </div>
    </div>
  )
}

// ─── Wait 节点编辑器 ────────────────────────────────────────────
function WaitNodeEditor({ node, onUpdate }: {
  node: SopNode
  onUpdate: (id: string, partial: Partial<SopNode>) => void
}) {
  const ms = node.waitMs ?? 0
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
        ⏳ 等待时长
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: '30分钟', ms: 30 * 60 * 1000 },
          { label: '1小时', ms: 60 * 60 * 1000 },
          { label: '3小时', ms: 3 * 60 * 60 * 1000 },
          { label: '1天', ms: 86400000 },
          { label: '3天', ms: 3 * 86400000 },
          { label: '7天', ms: 7 * 86400000 },
        ].map(preset => (
          <Button
            key={preset.ms}
            variant={ms === preset.ms ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-[10px]"
            onClick={() => onUpdate(node.id, { waitMs: preset.ms })}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div>
        <Label className="text-[10px]">自定义 (毫秒)</Label>
        <Input
          type="number"
          value={ms}
          onChange={(e) => onUpdate(node.id, { waitMs: Number(e.target.value) || 0 })}
          className="h-7 text-[11px] mt-0.5"
        />
      </div>
    </div>
  )
}

// ─── Notify 节点编辑器 ────────────────────────────────────────────
function NotifyNodeEditor({ node, onUpdate }: {
  node: SopNode
  onUpdate: (id: string, partial: Partial<SopNode>) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-yellow-600 dark:text-yellow-400">
        🔔 通知配置
      </div>
      <div>
        <Label className="text-[10px]">级别</Label>
        <Select
          value={node.notifyLevel || 'info'}
          onValueChange={(v) => onUpdate(node.id, { notifyLevel: v as 'info' | 'warn' | 'error' })}
        >
          <SelectTrigger className="h-7 text-[11px] mt-0.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="info">ℹ️ 信息</SelectItem>
            <SelectItem value="warn">⚠️ 警告</SelectItem>
            <SelectItem value="error">🚨 紧急</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[10px]">通知内容</Label>
        <Textarea
          value={node.notifyMessage || ''}
          onChange={(e) => onUpdate(node.id, { notifyMessage: e.target.value })}
          placeholder="通知发送给销售/运营的消息内容"
          className="text-[11px] mt-0.5 min-h-[80px]"
        />
      </div>
    </div>
  )
}

// ─── End 节点编辑器 ────────────────────────────────────────────
function EndNodeEditor({ node, onUpdate }: {
  node: SopNode
  onUpdate: (id: string, partial: Partial<SopNode>) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
        🟥 结束状态
      </div>
      <Select
        value={node.endStatus || 'success'}
        onValueChange={(v) => onUpdate(node.id, { endStatus: v as 'success' | 'failed' | 'human_handoff' })}
      >
        <SelectTrigger className="h-7 text-[11px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="success">✅ 成功完成</SelectItem>
          <SelectItem value="failed">❌ 失败</SelectItem>
          <SelectItem value="human_handoff">🤝 转人工</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

// ─── 创建 SOP 对话框 ────────────────────────────────────────────
function CreateSopDialog({ open, onOpenChange, onCreate }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreate: (data: { name: string; description: string; category: string }) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>('默认流程')

  const handleSubmit = () => {
    if (!name.trim()) { toast.error('请输入 SOP 名称'); return }
    onCreate({ name: name.trim(), description: description.trim(), category })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> 新建 SOP
          </DialogTitle>
          <DialogDescription>
            创建后将自动包含「开始」和「结束」两个节点，可在画布上添加更多节点。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">名称 *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：高意向客户跟进 SOP"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs">描述</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述这个 SOP 的目的和触发场景"
              className="mt-1 min-h-[60px]"
            />
          </div>
          <div>
            <Label className="text-xs">分类</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── 运行 SOP 对话框 ────────────────────────────────────────────
function RunSopDialog({ open, onOpenChange, def, onRun }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  def: SopDefinition | null
  onRun: (info: { customerId: string; customerName: string; message: string }) => void
}) {
  const [customerId, setCustomerId] = useState('test_001')
  const [customerName, setCustomerName] = useState('测试客户')
  const [message, setMessage] = useState('奔驰C级多少钱？')

  const handleSubmit = () => {
    if (!customerId.trim()) { toast.error('请输入客户 ID'); return }
    onRun({ customerId: customerId.trim(), customerName: customerName.trim(), message: message.trim() })
  }

  if (!def) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-600" />
            运行 SOP
          </DialogTitle>
          <DialogDescription>
            将创建一个 SOP 执行实例并立即开始运行。可在底部日志面板查看执行过程。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="p-2 rounded-md bg-muted/50 border border-border">
            <div className="text-xs font-medium">{def.name}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{def.description}</div>
            <div className="flex items-center gap-1 mt-1">
              <Badge variant="outline" className="text-[9px] h-4 px-1">{def.nodes.length} 节点</Badge>
              <Badge variant="outline" className="text-[9px] h-4 px-1">v{def.version}</Badge>
              <Badge variant="outline" className="text-[9px] h-4 px-1">
                {def.triggerType === 'auto_event' ? '事件触发' : def.triggerType === 'auto_schedule' ? '定时触发' : '手动触发'}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">客户 ID *</Label>
              <Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">客户名称</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">客户消息（可选，作为初始上下文）</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 min-h-[60px]"
              placeholder="如：奔驰GLC价格是多少？"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-700">
            <Play className="w-3.5 h-3.5 mr-1" /> 启动 SOP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
