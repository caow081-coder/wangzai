'use client'

/**
 * 旺财 · SOP 引擎 — 可视化设计器
 *
 * 核心功能：
 *  - SVG 画布 + HTML 节点 div 叠加（SVG 画连线，div 渲染节点）
 *  - 6 种节点类型：trigger / skill / condition / wait / notify / end
 *  - 节点可拖拽（onMouseDown/onMouseMove/onMouseUp 更新 position）
 *  - 贝塞尔曲线连线（YES=绿 / NO=红 / default=灰）
 *  - 运行时高亮：当前节点闪烁动画 + 流动光效（stroke-dasharray 动画）
 *  - 顶部工具栏：保存 / 运行 / 暂停 / 恢复 / 终止 / 切换工具箱 / 缩放
 *  - Skill 工具箱拖拽入画布（HTML5 native drag-and-drop）
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Save, Play, Pause, Square, RotateCcw, ZoomIn, ZoomOut, Maximize2,
  Loader2, Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SopNodePalette } from './SopNodePalette'
import type {
  SopNode, SopEdge, SopDefinition, SopInstance, NodeType,
  SkillDefinition,
} from '@/lib/sop/types'

// ─── 节点样式元数据 ────────────────────────────────────────────
interface NodeStyle {
  w: number
  h: number
  bg: string         // 背景
  border: string     // 边框
  text: string       // 文字色
  icon: string       // emoji 图标
  label: string      // 类型标签
  rounded: string    // 圆角
  isDiamond?: boolean
}

const NODE_STYLE: Record<NodeType, NodeStyle> = {
  trigger:  { w: 120, h: 44, bg: 'bg-emerald-500/15 dark:bg-emerald-500/20', border: 'border-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', icon: '🟢', label: '触发', rounded: 'rounded-xl' },
  skill:    { w: 170, h: 64, bg: 'bg-sky-500/15 dark:bg-sky-500/20',         border: 'border-sky-500',     text: 'text-sky-700 dark:text-sky-300',         icon: '⚡', label: '技能', rounded: 'rounded-lg' },
  condition:{ w: 130, h: 90, bg: 'bg-amber-500/15 dark:bg-amber-500/20',     border: 'border-amber-500',   text: 'text-amber-700 dark:text-amber-300',     icon: '◆',  label: '条件', rounded: '', isDiamond: true },
  wait:     { w: 150, h: 50, bg: 'bg-purple-500/15 dark:bg-purple-500/20',   border: 'border-purple-500',  text: 'text-purple-700 dark:text-purple-300',   icon: '⏳', label: '等待', rounded: 'rounded-lg' },
  notify:   { w: 170, h: 60, bg: 'bg-yellow-500/15 dark:bg-yellow-500/20',   border: 'border-yellow-500',  text: 'text-yellow-700 dark:text-yellow-300',   icon: '🔔', label: '通知', rounded: 'rounded-lg' },
  end:      { w: 120, h: 44, bg: 'bg-rose-500/15 dark:bg-rose-500/20',       border: 'border-rose-500',    text: 'text-rose-700 dark:text-rose-300',       icon: '🟥', label: '结束', rounded: 'rounded-xl' },
}

// ─── 工具函数 ────────────────────────────────────────────────
function getAnchor(node: SopNode, side: 'top' | 'bottom' | 'left' | 'right') {
  const size = NODE_STYLE[node.type]
  const x = node.position?.x ?? 0
  const y = node.position?.y ?? 0
  switch (side) {
    case 'top':    return { x: x + size.w / 2, y }
    case 'bottom': return { x: x + size.w / 2, y: y + size.h }
    case 'left':   return { x, y: y + size.h / 2 }
    case 'right':  return { x: x + size.w, y: y + size.h / 2 }
  }
}

function pickSides(from: SopNode, to: SopNode): { from: 'bottom' | 'right' | 'left'; to: 'top' | 'left' | 'right' } {
  const f = from.position ?? { x: 0, y: 0 }
  const t = to.position ?? { x: 0, y: 0 }
  const fromSize = NODE_STYLE[from.type]
  const dx = (t.x + NODE_STYLE[to.type].w / 2) - (f.x + fromSize.w / 2)
  const dy = t.y - f.y
  // 如果目标在源的右侧（水平距离大于垂直距离）
  if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > fromSize.w * 0.8) {
    if (dx > 0) return { from: 'right', to: 'left' }
    return { from: 'left', to: 'right' }
  }
  return { from: 'bottom', to: 'top' }
}

function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dy = to.y - from.y
  // 控制点：垂直拉伸（如果是水平方向，控制点水平拉伸）
  const isVertical = Math.abs(dy) > Math.abs(to.x - from.x)
  if (isVertical) {
    const c1y = from.y + dy * 0.5
    const c2y = to.y - dy * 0.5
    return `M ${from.x} ${from.y} C ${from.x} ${c1y}, ${to.x} ${c2y}, ${to.x} ${to.y}`
  } else {
    const dx = to.x - from.x
    const c1x = from.x + dx * 0.5
    const c2x = to.x - dx * 0.5
    return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`
  }
}

function edgeColor(cond?: 'yes' | 'no' | 'default') {
  if (cond === 'yes') return { stroke: '#10b981', label: 'YES', labelColor: 'text-emerald-600' }
  if (cond === 'no') return { stroke: '#ef4444', label: 'NO', labelColor: 'text-rose-600' }
  return { stroke: '#94a3b8', label: '', labelColor: 'text-slate-500' }
}

// ─── 拖拽状态 ────────────────────────────────────────────────
interface DragState {
  nodeId: string
  offsetX: number  // 鼠标相对节点左上角的偏移
  offsetY: number
  currentX: number // 当前节点位置
  currentY: number
}

// ─── 组件 Props ────────────────────────────────────────────────
export interface SopDesignerProps {
  definition: SopDefinition | null
  nodes: SopNode[]
  edges: SopEdge[]
  selectedNodeId: string | null
  currentInstance: SopInstance | null   // 运行中的实例（用于高亮当前节点）
  isSaving?: boolean
  isRunning?: boolean
  isDirty?: boolean                      // 是否有未保存改动（由父组件控制）
  onSelectNode: (id: string | null) => void
  onNodesChange: (nodes: SopNode[]) => void
  onAddNode: (node: SopNode) => void
  onSave: () => void
  onRun: () => void
  onPause: () => void
  onResume: () => void
  onAbort: () => void
}

export function SopDesigner(props: SopDesignerProps) {
  const {
    definition, nodes, edges, selectedNodeId, currentInstance,
    isSaving, isRunning, isDirty = false,
    onSelectNode, onNodesChange, onAddNode,
    onSave, onRun, onPause, onResume, onAbort,
  } = props

  const canvasRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [showPalette, setShowPalette] = useState(true)
  const [zoom, setZoom] = useState(1)

  // ─── 节点拖拽 ────────────────────────────────────────────────
  const onNodeMouseDown = useCallback((e: React.MouseEvent, node: SopNode) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = node.position?.x ?? 0
    const py = node.position?.y ?? 0
    setDrag({
      nodeId: node.id,
      offsetX: (e.clientX - rect.left) / zoom - px,
      offsetY: (e.clientY - rect.top) / zoom - py,
      currentX: px,
      currentY: py,
    })
    onSelectNode(node.id)
  }, [zoom, onSelectNode])

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = (e.clientX - rect.left) / zoom - drag.offsetX
      const y = (e.clientY - rect.top) / zoom - drag.offsetY
      // 限制在画布内（最小 0,0；最大 2000,1500）
      const clampedX = Math.max(0, Math.min(2000, x))
      const clampedY = Math.max(0, Math.min(1500, y))
      setDrag({ ...drag, currentX: clampedX, currentY: clampedY })
    }
    const onUp = () => {
      // 提交最终位置到父组件
      const finalDrag = drag
      if (finalDrag) {
        onNodesChange(nodes.map(n =>
          n.id === finalDrag.nodeId
            ? { ...n, position: { x: finalDrag.currentX, y: finalDrag.currentY } }
            : n
        ))
        // isDirty 由父组件 onNodesChange 内部跟踪
      }
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, zoom, nodes, onNodesChange])

  // ─── Skill 工具箱拖入 ─────────────────────────────────────────
  const onCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const data = e.dataTransfer.getData('application/x-sop-skill')
    if (!data) return
    try {
      const skill: SkillDefinition = JSON.parse(data)
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = (e.clientX - rect.left) / zoom - NODE_STYLE.skill.w / 2
      const y = (e.clientY - rect.top) / zoom - NODE_STYLE.skill.h / 2
      const newNode: SopNode = {
        id: `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'skill',
        name: skill.name,
        skillName: skill.id,
        position: { x: Math.max(0, x), y: Math.max(0, y) },
      }
      onAddNode(newNode)
      onSelectNode(newNode.id)
    } catch (err) {
      console.error('[SopDesigner] drop parse failed:', err)
    }
  }, [zoom, onAddNode, onSelectNode])

  const handleAddSkillClick = useCallback((skill: SkillDefinition) => {
    // 点击添加：放在画布中间偏移位置
    const rect = canvasRef.current?.getBoundingClientRect()
    const cx = rect ? (rect.width / 2 - NODE_STYLE.skill.w / 2) / zoom : 200
    const cy = rect ? (rect.height / 2 - NODE_STYLE.skill.h / 2) / zoom : 200
    // 加随机偏移避免堆叠
    const offset = nodes.length * 20
    const newNode: SopNode = {
      id: `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'skill',
      name: skill.name,
      skillName: skill.id,
      position: { x: cx + offset, y: cy + offset },
    }
    onAddNode(newNode)
    onSelectNode(newNode.id)
  }, [zoom, nodes.length, onAddNode, onSelectNode])

  // ─── 画布空白点击取消选中 ────────────────────────────────────────
  const onCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onSelectNode(null)
    }
  }, [onSelectNode])

  // ─── 缩放 ────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = -e.deltaY * 0.002
      setZoom(z => Math.min(2, Math.max(0.4, z + delta)))
    }
  }, [])

  // ─── 计算高亮节点 ID ────────────────────────────────────────────
  const runningNodeId = currentInstance?.status === 'running' ? currentInstance.currentNodeId : null

  // ─── 渲染 ────────────────────────────────────────────────
  if (!definition) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/20 text-muted-foreground">
        <div className="text-center">
          <Workflow className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm">请从左侧选择一个 SOP 定义</div>
          <div className="text-xs mt-1 opacity-70">或点击「+ 新建SOP」创建</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* ─── 顶部工具栏 ──────────────────────────────────────────── */}
      <div className="shrink-0 h-12 border-b border-border bg-background/95 backdrop-blur px-3 flex items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Workflow className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="text-sm font-medium truncate" title={definition.name}>
            {definition.name}
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
            v{definition.version}
          </Badge>
          {isDirty && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/15 text-amber-700 dark:text-amber-300">
              未保存
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {nodes.length}节点 · {edges.length}连线
          </Badge>
        </div>

        <div className="flex-1" />

        {/* 缩放控制 */}
        <div className="flex items-center gap-0.5 mr-2 px-1 rounded-md border border-border">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[10px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(1)} title="重置缩放">
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* 工具箱切换 */}
        <Button
          variant={showPalette ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowPalette(s => !s)}
        >
          🧩 工具箱
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* 运行控制按钮组 */}
        <TooltipProvider delayDuration={300}>
          {!currentInstance || currentInstance.status !== 'running' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={onRun} disabled={isRunning}>
                  {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                  运行
                </Button>
              </TooltipTrigger>
              <TooltipContent>启动 SOP 实例</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onPause}>
                  <Pause className="w-3.5 h-3.5 mr-1" /> 暂停
                </Button>
              </TooltipTrigger>
              <TooltipContent>暂停当前实例</TooltipContent>
            </Tooltip>
          )}

          {currentInstance?.status === 'paused' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onResume}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> 恢复
                </Button>
              </TooltipTrigger>
              <TooltipContent>恢复暂停的实例</TooltipContent>
            </Tooltip>
          )}

          {currentInstance && (currentInstance.status === 'running' || currentInstance.status === 'paused') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={onAbort}>
                  <Square className="w-3.5 h-3.5 mr-1" /> 终止
                </Button>
              </TooltipTrigger>
              <TooltipContent>终止当前实例</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                onClick={onSave}
                disabled={isSaving || !isDirty}
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                保存
              </Button>
            </TooltipTrigger>
            <TooltipContent>保存 SOP 定义（{isDirty ? '有未保存改动' : '已保存'}）</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* ─── 主体：工具箱 + 画布 ──────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex">
        {/* 工具箱 */}
        {showPalette && (
          <div className="w-[220px] shrink-0 h-full">
            <SopNodePalette onAddSkill={handleAddSkillClick} />
          </div>
        )}

        {/* 画布 */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-auto bg-grid"
          onDrop={onCanvasDrop}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onClick={onCanvasClick}
          onWheel={onWheel}
          style={{
            backgroundColor: 'var(--grid-bg, hsl(var(--background)))',
            backgroundImage: `
              linear-gradient(hsl(var(--border) / 0.4) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--border) / 0.4) 1px, transparent 1px)
            `,
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          }}
        >
          <div
            className="relative"
            style={{
              width: 2000,
              height: 1500,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            {/* ─── SVG 连线层 ──────────────────────────────────────────── */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ overflow: 'visible' }}
            >
              <defs>
                {/* 通用箭头 */}
                <marker id="sop-arrow-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
                <marker id="sop-arrow-yes" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
                </marker>
                <marker id="sop-arrow-no" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                </marker>
              </defs>

              {edges.map(edge => {
                const fromNode = nodes.find(n => n.id === edge.from)
                const toNode = nodes.find(n => n.id === edge.to)
                if (!fromNode || !toNode) return null
                // 拖拽时跟随节点
                const fromResolved = drag?.nodeId === fromNode.id
                  ? { ...fromNode, position: { x: drag.currentX, y: drag.currentY } }
                  : fromNode
                const toResolved = drag?.nodeId === toNode.id
                  ? { ...toNode, position: { x: drag.currentX, y: drag.currentY } }
                  : toNode
                const sides = pickSides(fromResolved, toResolved)
                const fromPt = getAnchor(fromResolved, sides.from)
                const toPt = getAnchor(toResolved, sides.to)
                const path = bezierPath(fromPt, toPt)
                const color = edgeColor(edge.condition)
                const isFlowing = runningNodeId === edge.from // 当前节点流出边做流动动画
                return (
                  <g key={edge.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke={color.stroke}
                      strokeWidth={isFlowing ? 2.5 : 1.5}
                      strokeDasharray={isFlowing ? '6 4' : undefined}
                      markerEnd={`url(#sop-arrow-${edge.condition === 'yes' ? 'yes' : edge.condition === 'no' ? 'no' : 'default'})`}
                      style={isFlowing ? {
                        animation: 'sop-flow 0.8s linear infinite',
                      } : undefined}
                    />
                    {edge.label && (
                      <g>
                        <rect
                          x={(fromPt.x + toPt.x) / 2 - 16}
                          y={(fromPt.y + toPt.y) / 2 - 9}
                          width="32"
                          height="18"
                          rx="9"
                          fill="hsl(var(--background))"
                          stroke={color.stroke}
                          strokeWidth="1"
                        />
                        <text
                          x={(fromPt.x + toPt.x) / 2}
                          y={(fromPt.y + toPt.y) / 2 + 4}
                          textAnchor="middle"
                          className="text-[10px] font-semibold"
                          fill={color.stroke}
                        >
                          {edge.label}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}
            </svg>

            {/* ─── HTML 节点层 ──────────────────────────────────────────── */}
            {nodes.map(node => {
              const style = NODE_STYLE[node.type]
              // 拖拽时使用临时位置
              const pos = drag?.nodeId === node.id
                ? { x: drag.currentX, y: drag.currentY }
                : (node.position ?? { x: 0, y: 0 })
              const isSelected = selectedNodeId === node.id
              const isRunningHere = runningNodeId === node.id
              return (
                <NodeDiv
                  key={node.id}
                  node={node}
                  pos={pos}
                  style={style}
                  isSelected={isSelected}
                  isRunning={isRunningHere}
                  onMouseDown={onNodeMouseDown}
                />
              )
            })}
          </div>
        </div>
      </div>

    </div>
  )
}

// ─── 节点渲染 ────────────────────────────────────────────────
interface NodeDivProps {
  node: SopNode
  pos: { x: number; y: number }
  style: NodeStyle
  isSelected: boolean
  isRunning: boolean
  onMouseDown: (e: React.MouseEvent, node: SopNode) => void
}

function NodeDiv({ node, pos, style, isSelected, isRunning, onMouseDown }: NodeDivProps) {
  return (
    <div
      className={`absolute select-none ${style.text}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: style.w,
        height: style.h,
        cursor: 'grab',
        zIndex: isSelected ? 10 : 1,
      }}
      onMouseDown={(e) => onMouseDown(e, node)}
    >
      {/* 选中描边 */}
      {isSelected && (
        <motion.div
          className="absolute -inset-1 rounded-lg border-2 border-sky-500 pointer-events-none"
          initial={{ opacity: 0.8 }}
          animate={{ opacity: [0.8, 0.4, 0.8] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
        />
      )}

      {/* 运行时高亮：流动光环 */}
      {isRunning && (
        <motion.div
          className="absolute -inset-2 rounded-xl border-2 border-amber-400 pointer-events-none"
          initial={{ opacity: 0.4, scale: 0.95 }}
          animate={{ opacity: [0.4, 1, 0.4], scale: [0.95, 1.05, 0.95] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
          style={{ boxShadow: '0 0 16px 2px rgba(251, 191, 36, 0.6)' }}
        />
      )}

      {/* 形状背景：菱形用 SVG polygon，矩形用 div */}
      {style.isDiamond ? (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${style.w} ${style.h}`}>
          <polygon
            points={`${style.w / 2},2 ${style.w - 2},${style.h / 2} ${style.w / 2},${style.h - 2} 2,${style.h / 2}`}
            fill="currentColor"
            fillOpacity={0.15}
            stroke="currentColor"
            strokeWidth={2}
          />
        </svg>
      ) : (
        <div className={`absolute inset-0 ${style.bg} ${style.border} border-2 ${style.rounded}`} />
      )}

      {/* 内容 */}
      <div className="relative w-full h-full flex flex-col items-center justify-center px-2 text-center">
        <div className="flex items-center gap-1">
          <span className="text-[11px] leading-none">{style.icon}</span>
          <span className="text-[10px] font-medium leading-none truncate max-w-[120px]">{node.name}</span>
        </div>
        {node.skillName && (
          <div className="text-[9px] opacity-70 mt-0.5 truncate max-w-[140px]">
            ⚡ {node.skillName}
          </div>
        )}
        {node.type === 'wait' && node.waitMs && (
          <div className="text-[9px] opacity-70 mt-0.5">
            {formatDuration(node.waitMs)}
          </div>
        )}
        {node.type === 'notify' && node.notifyMessage && (
          <div className="text-[9px] opacity-70 mt-0.5 truncate max-w-[140px]">
            {node.notifyMessage}
          </div>
        )}
        {node.type === 'condition' && node.condition && (
          <div className="text-[9px] opacity-70 mt-0.5">
            {node.condition.field} {node.condition.operator} {String(node.condition.value)}
          </div>
        )}
      </div>

      {/* 类型标签（左上角小徽章） */}
      <div className="absolute -top-1.5 -left-1.5 px-1 py-0 text-[8px] font-semibold rounded bg-background border border-border opacity-70">
        {style.label}
      </div>
    </div>
  )
}

// ─── 工具：时长格式化 ────────────────────────────────────────────
function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}秒`
  if (ms < 3600000) return `${Math.round(ms / 60000)}分钟`
  if (ms < 86400000) return `${Math.round(ms / 3600000)}小时`
  return `${Math.round(ms / 86400000)}天`
}
