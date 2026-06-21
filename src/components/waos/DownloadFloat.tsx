'use client'

import { useState } from 'react'
import { FileText, X, Download, Eye, ChevronUp } from 'lucide-react'

export function DownloadFloat() {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        className="fixed bottom-4 right-4 z-[60] h-10 w-10 rounded-full bg-zinc-900 text-white shadow-lg hover:scale-105 transition flex items-center justify-center"
        aria-label="显示下载面板"
      >
        <FileText className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[280px] rounded-2xl bg-background/95 backdrop-blur-xl border border-border shadow-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-secondary/50 transition"
      >
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center text-white">
          <FileText className="h-4 w-4" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-[13px] font-semibold leading-tight">UI 设计文档</div>
          <div className="text-[11px] text-muted-foreground leading-tight">WAOS 全功能设计 PDF</div>
        </div>
        <ChevronUp className={`h-4 w-4 text-muted-foreground transition ${open ? '' : 'rotate-180'}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2 border-t border-border/60">
          <p className="text-[11px] text-muted-foreground leading-relaxed pt-2">
            全功能 UI 设计稿（含布局、组件、配色、交互流），供你深度优化产品界面。
          </p>
          <div className="grid grid-cols-2 gap-2">
            <a
              href="/WAOS-UI-Design.pdf"
              download
              className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg bg-zinc-900 text-white text-[11px] font-medium hover:bg-zinc-800 transition"
            >
              <Download className="h-3.5 w-3.5" />
              下载 PDF
              <span className="text-[9px] opacity-70">2.2 MB</span>
            </a>
            <a
              href="/WAOS-UI-Design.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg bg-secondary text-foreground text-[11px] font-medium hover:bg-secondary/70 transition"
            >
              <Eye className="h-3.5 w-3.5" />
              在线预览
              <span className="text-[9px] opacity-70">新标签页</span>
            </a>
          </div>
          <a
            href="/WAOS-UI-Design-preview.png"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-[10px] text-muted-foreground hover:text-foreground transition pt-1"
          >
            查看预览图 (PNG) →
          </a>
          <button
            onClick={() => {
              setDismissed(true)
              setOpen(false)
            }}
            className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition pt-1"
          >
            <X className="h-3 w-3" /> 收起
          </button>
        </div>
      )}
    </div>
  )
}
