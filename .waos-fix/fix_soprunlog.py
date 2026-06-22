#!/usr/bin/env python3
# FIX-FE-PERF · sop/SopRunLog.tsx
# P1-1 长列表懒加载：默认渲染 30 条，"加载更多"每次 +30，硬上限 100
# P2-1 aria-label：刷新 / 展开-收起 按钮
import sys

PATH = "/tmp/my-project/src/components/waos/sop/SopRunLog.tsx"

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

# 1) 新增 visibleCount 状态（P1-1 懒加载）
repl(
'''  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set())
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)''',
'''  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set())
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  // P1-1 长列表懒加载：默认渲染 30 条，点击"加载更多"每次 +30，硬上限 100 条
  const PAGE_SIZE = 30
  const HARD_CAP = 100
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)''')

# 2) 刷新按钮 aria-label（P2-1）
repl(
'''        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); fetchLogs() }}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>''',
'''        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); fetchLogs() }}
          disabled={loading}
          aria-label="刷新运行日志"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>''')

# 3) 展开/收起按钮：补 aria-label / aria-expanded / 显式 onClick（P2-1）
repl(
'''        {/* 展开/收起 */}
        <Button variant="ghost" size="icon" className="h-7 w-7">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </Button>''',
'''        {/* 展开/收起 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-expanded={expanded}
          aria-label={expanded ? '收起运行日志' : '展开运行日志'}
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </Button>''')

# 4) 列表渲染：slice + 加载更多按钮（P1-1）
repl(
'''            <ScrollArea className="flex-1 waos-scrollbar">
              {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                  <Activity className="w-8 h-8 mb-2 opacity-30" />
                  <div className="text-xs">
                    {logs.length === 0 ? '暂无日志，运行 SOP 后将显示执行记录' : '无匹配日志'}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {filteredLogs.map((log, idx) => (
                    <LogItem
                      key={log.id}
                      log={log}
                      index={idx}
                      expanded={expandedLogIds.has(log.id)}
                      onToggle={() => toggleLog(log.id)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>''',
'''            <ScrollArea className="flex-1 waos-scrollbar">
              {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                  <Activity className="w-8 h-8 mb-2 opacity-30" />
                  <div className="text-xs">
                    {logs.length === 0 ? '暂无日志，运行 SOP 后将显示执行记录' : '无匹配日志'}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {/* P1-1 懒加载：仅渲染前 visibleCount 条（硬上限 HARD_CAP） */}
                  {filteredLogs.slice(0, Math.min(visibleCount, HARD_CAP)).map((log, idx) => (
                    <LogItem
                      key={log.id}
                      log={log}
                      index={idx}
                      expanded={expandedLogIds.has(log.id)}
                      onToggle={() => toggleLog(log.id)}
                    />
                  ))}
                  {filteredLogs.length > Math.min(visibleCount, HARD_CAP) && (
                    <button
                      onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, HARD_CAP))}
                      className="w-full py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors apple-btn"
                    >
                      加载更多（剩余 {Math.max(0, Math.min(filteredLogs.length, HARD_CAP) - Math.min(visibleCount, HARD_CAP))} 条
                      {filteredLogs.length > HARD_CAP ? `，已截断至 ${HARD_CAP}/${filteredLogs.length}` : ''}）
                    </button>
                  )}
                </div>
              )}
            </ScrollArea>''')

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("SopRunLog.tsx 写入完成")
