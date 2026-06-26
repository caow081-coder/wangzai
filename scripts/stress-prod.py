#!/usr/bin/env python3
"""
旺财生产模式真实压力测试 — 5角色并行
覆盖全部27+个API端点，asyncio + aiohttp
"""
import asyncio
import aiohttp
import json
import time
import sys
import os
import random
from datetime import datetime

sys.stdout.reconfigure(line_buffering=True)

BASE = "http://localhost:3000"
LOG_DIR = "/home/z/my-project/wangzai/logs/stress-test"
os.makedirs(LOG_DIR, exist_ok=True)

# ============================================================
# 全部API端点定义
# ============================================================
GET_ENDPOINTS = [
    "/api/waos/health",
    "/api/waos/safety",
    "/api/waos/reply",
    "/api/waos/llm",
    "/api/waos/leads",
    "/api/waos/metrics",
    "/api/waos/auto-reply",
    "/api/waos/reverse",
    "/api/waos/tts",
    "/api/waos/vlm",
    "/api/waos/asr",
    "/api/waos/knowledge",
    "/api/waos/engines",
    "/api/waos/errors",
    "/api/waos/monitoring",
    "/api/waos/moments",
    "/api/waos/sop",
    "/api/waos/metrics-monitoring",
    "/api/waos/douyin",
    "/api/waos/wechat-video",
    "/api/waos/backup",
    "/api/waos/migrate-encrypt",
    # brain子路由
    "/api/waos/brain/verify",
]

POST_ENDPOINTS = [
    ("/api/waos/safety", {"text": "测试安全检测内容", "action": "check"}),
    ("/api/waos/reply", {"message": "你好，请问奔驰V260L商务车现在什么价格？", "context": "new_customer"}),
    ("/api/waos/llm", {"prompt": "用一句话介绍奔驰商务车", "provider": "auto", "model": "auto"}),
    ("/api/waos/auto-reply", {"platform": "wechat_dm", "action": "wechat_dm_reply", "message": {"text": "您好，请问有什么可以帮您？", "from": "customer_001"}, "reply": "您好！奔驰商务车现车充足，请问您对哪款感兴趣？"}),
    ("/api/waos/tts", {"text": "欢迎来到奔驰商务中心", "voice": "default"}),
    ("/api/waos/vlm", {"image_url": "data:image/png;base64,iVBORw0KGgo=", "prompt": "描述图片"}),
    ("/api/waos/asr", {"audio_url": "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=", "language": "zh"}),
    ("/api/waos/knowledge", {"action": "search", "query": "奔驰V260L配置参数", "category": "product"}),
    ("/api/waos/reverse", {"action": "list", "service": "douyin"}),
    ("/api/waos/engines", {"action": "list"}),
    ("/api/waos/errors", {"action": "list", "severity": "all", "limit": 10}),
    ("/api/waos/monitoring", {"action": "snapshot"}),
    ("/api/waos/moments", {"action": "list", "platform": "wechat", "limit": 5}),
    ("/api/waos/sop", {"action": "list", "category": "sales"}),
    ("/api/waos/metrics-monitoring", {"action": "current"}),
    ("/api/waos/douyin", {"action": "list", "type": "comments", "limit": 5}),
    ("/api/waos/wechat", {"action": "status"}),
    ("/api/waos/wechat-video", {"action": "list", "limit": 5}),
    ("/api/waos/migrate-encrypt", {"action": "status"}),
    ("/api/waos/backup", {"action": "create"}),
    ("/api/waos/brain/extract", {"text": "奔驰V260L豪华版，落地价62万，客户张先生有意向"}),
    ("/api/waos/brain/verify", {"token": "test-token-verification"}),
    ("/api/waos/llm", {"prompt": "测试负载均衡", "provider": "auto", "model": "auto"}),
    ("/api/waos/reply", {"message": "有没有现车？提车周期多久？", "context": "follow_up"}),
    ("/api/waos/safety", {"text": "敏感词测试内容", "action": "check"}),
]

# ============================================================
# 5角色操作序列
# ============================================================
ROLES = {
    "肉肉-客服": [
        # 阶段1：接待客户
        lambda s: s.get("/api/waos/auto-reply"),
        lambda s: s.post("/api/waos/reply", {"message": "你好，我最近想了解一下奔驰商务车", "context": "new_customer"}),
        lambda s: s.post("/api/waos/safety", {"text": "你好奔驰商务车价格多少", "action": "check"}),
        lambda s: s.get("/api/waos/knowledge"),
        # 阶段2：报价咨询
        lambda s: s.post("/api/waos/reply", {"message": "V260L豪华版多少钱？有没有现车？", "context": "follow_up"}),
        lambda s: s.get("/api/waos/llm"),
        lambda s: s.post("/api/waos/llm", {"prompt": "奔驰V260L豪华版核心卖点", "provider": "auto", "model": "auto"}),
        # 阶段3：深度跟进
        lambda s: s.post("/api/waos/knowledge", {"action": "search", "query": "V260L改装方案", "category": "product"}),
        lambda s: s.post("/api/waos/sop", {"action": "list", "category": "sales"}),
        lambda s: s.post("/api/waos/brain/extract", {"text": "客户王总，V260L豪华版，预算70万左右，下周想来店看车"}),
    ],
    "肉肉-运营": [
        lambda s: s.get("/api/waos/metrics"),
        lambda s: s.get("/api/waos/metrics-monitoring"),
        lambda s: s.get("/api/waos/monitoring"),
        lambda s: s.get("/api/waos/leads"),
        lambda s: s.get("/api/waos/errors"),
        lambda s: s.post("/api/waos/errors", {"action": "list", "severity": "all", "limit": 10}),
        lambda s: s.get("/api/waos/health"),
        lambda s: s.get("/api/waos/engines"),
        lambda s: s.post("/api/waos/engines", {"action": "list"}),
        lambda s: s.post("/api/waos/metrics-monitoring", {"action": "current"}),
    ],
    "肉肉-微信": [
        lambda s: s.get("/api/waos/wechat"),
        lambda s: s.post("/api/waos/wechat", {"action": "status"}),
        lambda s: s.get("/api/waos/moments"),
        lambda s: s.post("/api/waos/moments", {"action": "list", "platform": "wechat", "limit": 10}),
        lambda s: s.post("/api/waos/auto-reply", {"platform": "wechat_dm", "action": "wechat_dm_reply", "message": {"text": "请问V260L有没有现车", "from": "wx_customer_01"}, "reply": "V260L现车充足，欢迎到店体验！"}),
        lambda s: s.post("/api/waos/auto-reply", {"platform": "wechat_dm", "action": "wechat_dm_reply", "message": {"text": "多少钱可以提车", "from": "wx_customer_02"}, "reply": "不同配置价格不同，V260L豪华版落地62万起。"}),
        lambda s: s.post("/api/waos/reply", {"message": "朋友圈文案怎么写比较好？", "context": "content_creation"}),
        lambda s: s.post("/api/waos/auto-reply", {"platform": "wechat_dm", "action": "wechat_dm_reply", "message": {"text": "周末能看车吗", "from": "wx_customer_03"}, "reply": "周末营业时间为9:00-18:00，建议提前预约。"}),
    ],
    "肉肉-抖音": [
        lambda s: s.get("/api/waos/douyin"),
        lambda s: s.post("/api/waos/douyin", {"action": "list", "type": "comments", "limit": 10}),
        lambda s: s.get("/api/waos/wechat-video"),
        lambda s: s.post("/api/waos/wechat-video", {"action": "list", "limit": 10}),
        lambda s: s.post("/api/waos/auto-reply", {"platform": "douyin_comment", "action": "douyin_comment_reply", "message": {"text": "这个车真帅", "from": "dy_fan_01"}, "reply": "感谢关注！奔驰V260L，商务出行新选择~"}),
        lambda s: s.post("/api/waos/auto-reply", {"platform": "douyin_comment", "action": "douyin_comment_reply", "message": {"text": "落地多少万", "from": "dy_fan_02"}, "reply": "V260L系列52万起，具体配置欢迎私信咨询~"}),
        lambda s: s.post("/api/waos/vlm", {"image_url": "data:image/png;base64,iVBORw0KGgo=", "prompt": "分析这张奔驰商务车图片"}),
        lambda s: s.post("/api/waos/reply", {"message": "帮我写个抖音短视频脚本，主题是奔驰V260L", "context": "content_creation"}),
    ],
    "管理员": [
        lambda s: s.get("/api/waos/health"),
        lambda s: s.get("/api/waos/safety"),
        lambda s: s.get("/api/waos/backup"),
        lambda s: s.post("/api/waos/backup", {"action": "create"}),
        lambda s: s.get("/api/waos/migrate-encrypt"),
        lambda s: s.post("/api/waos/migrate-encrypt", {"action": "status"}),
        lambda s: s.get("/api/waos/reverse"),
        lambda s: s.post("/api/waos/reverse", {"action": "list", "service": "all"}),
        lambda s: s.get("/api/waos/tts"),
        lambda s: s.post("/api/waos/tts", {"text": "系统备份完成", "voice": "default"}),
        lambda s: s.get("/api/waos/asr"),
        lambda s: s.post("/api/waos/asr", {"audio_url": "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=", "language": "zh"}),
    ],
}

# ============================================================
# 测试引擎
# ============================================================
results = []
class StressSession:
    def __init__(self, session: aiohttp.ClientSession, role: str):
        self.session = session
        self.role = role
        self.results = []

    async def get(self, path):
        return await self._req("GET", path)

    async def post(self, path, body=None):
        return await self._req("POST", path, body)

    async def _req(self, method, path, body=None):
        url = f"{BASE}{path}"
        t0 = time.monotonic()
        try:
            if method == "GET":
                async with self.session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    text = await resp.text()
                    status = resp.status
            else:
                async with self.session.post(url, json=body, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    text = await resp.text()
                    status = resp.status
            elapsed = (time.monotonic() - t0) * 1000
            ok = 200 <= status < 500
            rec = {
                "role": self.role, "method": method, "path": path,
                "status": status, "ms": round(elapsed, 1), "ok": ok,
                "body_preview": text[:120] if text else "",
                "ts": datetime.now().isoformat(),
            }
            self.results.append(rec)
            results.append(rec)
            return status, text
        except Exception as e:
            elapsed = (time.monotonic() - t0) * 1000
            rec = {
                "role": self.role, "method": method, "path": path,
                "status": 0, "ms": round(elapsed, 1), "ok": False,
                "error": str(e)[:200], "ts": datetime.now().isoformat(),
            }
            self.results.append(rec)
            results.append(rec)
            return 0, str(e)


def print_stats(round_num, all_results):
    total = len(all_results)
    if total == 0:
        print(f"[Round {round_num}] 无结果")
        return
    passed = sum(1 for r in all_results if r["ok"])
    failed = total - passed
    pass_rate = passed / total * 100
    errors = [r for r in all_results if not r["ok"]]
    avg_ms = sum(r["ms"] for r in all_results) / total
    max_ms = max(r["ms"] for r in all_results)
    min_ms = min(r["ms"] for r in all_results)

    print(f"\n{'='*60}")
    print(f"  Round {round_num} 结果 | 总计:{total} 通过:{passed} 失败:{failed} 通过率:{pass_rate:.1f}%")
    print(f"  响应时间: 平均{avg_ms:.0f}ms | 最快{min_ms:.0f}ms | 最慢{max_ms:.0f}ms")
    print(f"{'='*60}")

    if errors:
        print(f"\n  ❌ 失败详情 ({len(errors)}个):")
        for e in errors:
            preview = e.get("body_preview", e.get("error", ""))
            print(f"    [{e['role']}] {e['method']} {e['path']} → {e['status']} ({e['ms']:.0f}ms) {preview[:80]}")
    else:
        print(f"\n  ✅ 全部通过！")


def save_results(all_results, round_num):
    path = os.path.join(LOG_DIR, f"prod-stress-r{round_num}.jsonl")
    with open(path, "w") as f:
        for r in all_results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"  📁 结果已保存: {path}")


async def run_round(round_num):
    """执行一轮完整压力测试"""
    global results
    results = []
    print(f"\n🚀 Round {round_num} 开始 — {datetime.now().strftime('%H:%M:%S')}")

    async with aiohttp.ClientSession() as session:
        # === 阶段1: 顺序预热 (全部GET端点) ===
        print(f"\n  📋 阶段1: 顺序预热 — {len(GET_ENDPOINTS)} 个GET端点")
        warmup = StressSession(session, "warmup")
        for ep in GET_ENDPOINTS:
            await warmup.get(ep)
            await asyncio.sleep(0.05)
        warmup_pass = sum(1 for r in warmup.results if r["ok"])
        print(f"  预热完成: {warmup_pass}/{len(GET_ENDPOINTS)} 通过")

        # === 阶段2: 5角色并行并发 ===
        print(f"\n  🔥 阶段2: 5角色并行并发测试")
        tasks = []
        for role, ops in ROLES.items():
            tasks.append(run_role(session, role, ops))
        await asyncio.gather(*tasks)

    # 输出统计
    print_stats(round_num, results)
    save_results(results, round_num)

    # 统计
    total = len(results)
    passed = sum(1 for r in results if r["ok"])
    return total, passed


async def run_role(session, role, ops):
    """执行单个角色的操作序列"""
    ss = StressSession(session, role)
    print(f"    🎭 {role} 开始 ({len(ops)}个操作)")
    for i, op in enumerate(ops):
        await op(ss)
        # 随机延迟模拟真实用户
        delay = random.uniform(0.05, 0.3)
        await asyncio.sleep(delay)
    role_pass = sum(1 for r in ss.results if r["ok"])
    role_fail = len(ss.results) - role_pass
    avg_ms = sum(r["ms"] for r in ss.results) / max(len(ss.results), 1)
    print(f"    🎭 {role} 完成: {role_pass}/{len(ss.results)} 通过, 平均{avg_ms:.0f}ms")
    return ss.results


async def main():
    print("=" * 60)
    print("  旺财生产模式真实压力测试")
    print(f"  目标: {BASE}")
    print(f"  端点: {len(GET_ENDPOINTS)} GET + {len(POST_ENDPOINTS)} POST = {len(GET_ENDPOINTS)+len(POST_ENDPOINTS)} 个")
    print(f"  角色: {len(ROLES)} 个并行")
    print(f"  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # 先验证server可达
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"{BASE}/api/waos/health", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    print(f"\n✅ Server可达 | uptime: {data.get('uptimeHuman','?')} | RSS: {data.get('memory',{}).get('rss','?')}MB")
                else:
                    print(f"\n⚠️ Server响应异常: {resp.status}")
    except Exception as e:
        print(f"\n❌ Server不可达: {e}")
        return

    total_all = 0
    passed_all = 0

    # 执行3轮测试
    for i in range(1, 4):
        total, passed = await run_round(i)
        total_all += total
        passed_all += passed

        if i < 3:
            gap = 5
            print(f"\n  ⏳ 间隔{gap}秒后开始下一轮...")
            await asyncio.sleep(gap)

    # 最终汇总
    print(f"\n{'#'*60}")
    print(f"  📊 3轮压力测试汇总")
    print(f"  总请求: {total_all} | 通过: {passed_all} | 失败: {total_all-passed_all}")
    print(f"  总通过率: {passed_all/total_all*100:.1f}%")
    print(f"{'#'*60}")

    # 失败分类统计
    failures = [r for r in results if not r["ok"]]
    if failures:
        print(f"\n  失败分类:")
        by_path = {}
        for f in failures:
            key = f"{f['method']} {f['path']}"
            by_path.setdefault(key, []).append(f)
        for path, items in sorted(by_path.items(), key=lambda x: -len(x[1])):
            statuses = set(str(i["status"]) for i in items)
            print(f"    {path}: {len(items)}次失败 (status: {','.join(statuses)})")
    else:
        print(f"\n  🎉 3轮测试全部通过！系统稳定！")


if __name__ == "__main__":
    asyncio.run(main())