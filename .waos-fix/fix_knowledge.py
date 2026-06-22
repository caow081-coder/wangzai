#!/usr/bin/env python3
# FIX-FE-PERF · KnowledgePanel.tsx
# P1-1 长列表分页：文档表格每页 20 条，客户端分页（避免一次渲染全部文档）
# P2-2 加载骨架：列表加载时用 Skeleton 行替代单一 Loader2
# P2-1 aria-label：删除按钮补 aria-label
import sys

PATH = "/tmp/my-project/src/components/waos/KnowledgePanel.tsx"

with open(PATH, "r", encoding="utf-8") as f:
    src = f.read()

def repl(old, new):
    global src
    cnt = src.count(old)
    if cnt != 1:
        print(f"  !! 替换失败（期望 1 处，实际 {cnt} 处）:\n     {old[:60]!r}")
        sys.exit(1)
    src = src.replace(old, new)
    print(f"  ok: {old[:50]!r}")

# 1) 引入 Skeleton 组件
repl(
"import { ScrollArea } from '@/components/ui/scroll-area'",
"""import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'""")

# 2) 新增分页状态（P1-1）
repl(
'''  const [loadingList, setLoadingList] = useState(false)''',
'''  const [loadingList, setLoadingList] = useState(false)
  // P1-1 长列表分页：每页 20 条，避免一次渲染全部文档导致卡顿
  const DOC_PAGE_SIZE = 20
  const [docPage, setDocPage] = useState(1)''')

# 3) 切换分类时回到第一页（避免空页）
repl(
'''  useEffect(() => {
    if (!open) return
    refreshList(activeCategory)
  }, [open, activeCategory, refreshList])''',
'''  useEffect(() => {
    if (!open) return
    refreshList(activeCategory)
    setDocPage(1)
  }, [open, activeCategory, refreshList])''')

# 4) 加载态：Skeleton 行替代单 Loader2（P2-2）
repl(
'''              {loadingList ? (
                <div className="flex items-center justify-center h-full py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : docs.length === 0 ? (''',
'''              {loadingList ? (
                <div className="px-3 py-2 space-y-2">
                  {/* P2-2 加载骨架：模拟表格行 */}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <Skeleton className="h-3.5 w-[40%]" />
                      <Skeleton className="h-3.5 w-16" />
                      <Skeleton className="h-3.5 w-10 ml-auto" />
                      <Skeleton className="h-3.5 w-16" />
                      <Skeleton className="h-3.5 w-8" />
                    </div>
                  ))}
                </div>
              ) : docs.length === 0 ? (''')

# 5) 表格渲染：分页 slice + 底部分页控件（P1-1）
repl(
'''                  <TableBody>
                    {docs.map(doc => {''',
'''                  <TableBody>
                    {docs.slice((docPage - 1) * DOC_PAGE_SIZE, docPage * DOC_PAGE_SIZE).map(doc => {''')

# 6) 在 </Table> 后插入分页控件
repl(
'''                </Table>
              )}
            </ScrollArea>''',
'''                </Table>
                {/* P1-1 分页控件 */}
                {docs.length > DOC_PAGE_SIZE && (
                  <div className="flex items-center justify-between px-3 py-2 border-t border-border/60 text-[11px] text-muted-foreground">
                    <span>
                      第 {docPage}/{Math.max(1, Math.ceil(docs.length / DOC_PAGE_SIZE))} 页 · 共 {docs.length} 条
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setDocPage(p => Math.max(1, p - 1))}
                        disabled={docPage <= 1}
                        aria-label="上一页"
                        className="px-2 py-0.5 rounded border border-border/60 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed apple-btn"
                      >
                        上一页
                      </button>
                      <span className="tabular-nums px-1">{docPage}</span>
                      <button
                        onClick={() => setDocPage(p => Math.min(Math.ceil(docs.length / DOC_PAGE_SIZE), p + 1))}
                        disabled={docPage >= Math.ceil(docs.length / DOC_PAGE_SIZE)}
                        aria-label="下一页"
                        className="px-2 py-0.5 rounded border border-border/60 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed apple-btn"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                )}
              )}
            </ScrollArea>''')

# 7) 删除按钮 aria-label（P2-1）
repl(
'''                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(doc.id) }}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>''',
'''                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(doc.id) }}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="删除"
                              aria-label={`删除文档 ${doc.title}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>''')

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("KnowledgePanel.tsx 写入完成")
