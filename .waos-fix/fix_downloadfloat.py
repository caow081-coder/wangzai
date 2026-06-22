#!/usr/bin/env python3
# FIX-FE-PERF · DownloadFloat.tsx
# P1-3 深色模式：硬编码 bg-zinc-900 text-white 按钮 → 设计 token
#   - 收起态 FAB → bg-foreground text-background（主题反相，浅深皆可读）
#   - 下载 PDF CTA → bg-primary text-primary-foreground（品牌主色，主题自适应）
import sys

PATH = "/tmp/my-project/src/components/waos/DownloadFloat.tsx"

with open(PATH, "r", encoding="utf-8") as f:
    src = f.read()

def repl(old, new):
    global src
    cnt = src.count(old)
    if cnt != 1:
        print(f"  !! repl 期望1 实际{cnt}: {old[:70]!r}")
        sys.exit(1)
    src = src.replace(old, new)
    print(f"  ok: {old[:50]!r}")

# 收起态 FAB
repl(
'className="fixed bottom-4 right-4 z-[60] h-10 w-10 rounded-full bg-zinc-900 text-white shadow-lg hover:scale-105 transition flex items-center justify-center"',
'className="fixed bottom-4 right-4 z-[60] h-10 w-10 rounded-full bg-foreground text-background shadow-lg hover:scale-105 transition flex items-center justify-center"')

# 下载 PDF CTA
repl(
'className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg bg-zinc-900 text-white text-[11px] font-medium hover:bg-zinc-800 transition"',
'className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition"')

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("DownloadFloat.tsx 写入完成")
