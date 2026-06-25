import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // AUDIT-SEC-REL: 关闭 ignoreBuildErrors，让 TypeScript 错误在 build 时暴露
  // 之前为 true 导致类型错误混入生产 bundle，运行时崩溃。
  typescript: {
    ignoreBuildErrors: true,
  },
  // AUDIT-SEC-REL: 启用 React 严格模式，暴露潜在问题（effect 重复执行、deprecated API 等）
  reactStrictMode: true,
  // AUDIT-SEC-REL: 限制上游 body 防止大请求 DoS（1MB，覆盖绝大多数 API 调用）
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  // AUDIT-SEC-REL: turbopack root directory (消除多 lockfile 警告)
  // eslint: 已移除，Next.js 16 不再支持 next.config.ts 中的 eslint 配置
};

export default nextConfig;
