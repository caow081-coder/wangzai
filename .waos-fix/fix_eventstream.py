#!/usr/bin/env python3
# FIX-FE-PERF · EventStream.tsx
# P1-1 长列表虚拟化：只渲染最近 100 条日志
# P2-1 aria-label：补全筛选/滚动/暂停/清空 图标按钮的无障碍标签
import sys

PATH = "/tmp/my-project/src/components/waos/EventStream.tsx"

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

# 1) 新增 visibleLogs 切片逻辑（P1-1）
repl(
'''  const filtered = filter === 'all'
    ? snapshot
    : snapshot.filter(l => {
        if (filter === 'error') return l.level === 'error' || l.level === 'critical'
        if (filter === 'warn') return l.level === 'warn'
        if (filter === 'system') return l.level === 'system'
        return true
      })''',
'''  const filtered = filter === 'all'
    ? snapshot
    : snapshot.filter(l => {
        if (filter === 'error') return l.level === 'error' || l.level === 'critical'
        if (filter === 'warn') return l.level === 'warn'
        if (filter === 'system') return l.level === 'system'
        return true
      })

  // P1-1 长列表虚拟化：日志可能无限增长，仅渲染最近 100 条，避免 DOM 节点爆炸。
  // 日志按"最新在前"排列（autoScroll 滚到顶），取前 100 条即可保留最新内容。
  const MAX_RENDER_LOGS = 100
  const truncated = filtered.length > MAX_RENDER_LOGS
  const visibleLogs = truncated ? filtered.slice(0, MAX_RENDER_LOGS) : filtered''')

# 2) 筛选 chips 加 aria-label / aria-pressed（P2-1）
repl(
'''          {(['all', 'system', 'warn', 'error'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors uppercase
                ${filter === f ? 'bg-emerald-500/15 text-emerald-300' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f}
            </button>
          ))}''',
'''          {(['all', 'system', 'warn', 'error'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              aria-label={`筛选：${f === 'all' ? '全部' : f === 'warn' ? '警告' : f === 'error' ? '错误' : '系统'}日志`}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors uppercase
                ${filter === f ? 'bg-emerald-500/15 text-emerald-300' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f}
            </button>
          ))}''')

# 3) autoScroll 按钮 aria-label / aria-pressed
repl(
'''          <button
            onClick={() => setAutoScroll(s => !s)}
            className={`p-1 rounded hover:bg-secondary ${autoScroll ? 'text-emerald-400' : 'text-muted-foreground'}`}
            title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
          >
            {autoScroll ? <ChevronDown className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>''',
'''          <button
            onClick={() => setAutoScroll(s => !s)}
            aria-pressed={autoScroll}
            aria-label={autoScroll ? '关闭自动滚动' : '开启自动滚动'}
            className={`p-1 rounded hover:bg-secondary ${autoScroll ? 'text-emerald-400' : 'text-muted-foreground'}`}
            title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
          >
            {autoScroll ? <ChevronDown className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>''')

# 4) 暂停按钮 aria-label / aria-pressed
repl(
'''          <button
            onClick={handlePauseToggle}
            className={`p-1 rounded hover:bg-secondary ${paused ? 'text-amber-400' : 'text-muted-foreground'}`}
            title={paused ? 'Paused' : 'Live'}
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>''',
'''          <button
            onClick={handlePauseToggle}
            aria-pressed={paused}
            aria-label={paused ? '继续实时流' : '暂停实时流'}
            className={`p-1 rounded hover:bg-secondary ${paused ? 'text-amber-400' : 'text-muted-foreground'}`}
            title={paused ? 'Paused' : 'Live'}
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>''')

# 5) 清空按钮 aria-label
repl(
'''          <button
            onClick={clearLogs}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-rose-400"
            title="Clear logs (L)"
          >
            <Trash2 className="w-3 h-3" />
          </button>''',
'''          <button
            onClick={clearLogs}
            aria-label="清空日志"
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-rose-400"
            title="Clear logs (L)"
          >
            <Trash2 className="w-3 h-3" />
          </button>''')

# 6) 空状态判断 + 渲染改用 visibleLogs，并加截断提示
repl(
'''        {filtered.length === 0 ? (
          <div className="text-muted-foreground/70 italic">stream is empty…</div>
        ) : (
          filtered.map((line, i) => {''',
'''        {visibleLogs.length === 0 ? (
          <div className="text-muted-foreground/70 italic">stream is empty…</div>
        ) : (
          <>
          {truncated && (
            <div className="text-[9px] font-mono text-amber-400/80 py-0.5 px-1 -mx-1 mb-0.5 bg-amber-500/5 rounded">
              仅显示最近 {MAX_RENDER_LOGS} 条 / 共 {filtered.length} 条
            </div>
          )}
          {visibleLogs.map((line, i) => {''')

# 7) 关闭 map 的括号（在末尾多加一个 </> 闭合）
repl(
'''              </div>
            )
          })
        )}
      </div>
    </div>
  )
}''',
'''              </div>
            )
          })}
          </>
        )}
      </div>
    </div>
  )
}''')

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("EventStream.tsx 写入完成")
