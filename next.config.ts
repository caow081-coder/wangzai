import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // AUDIT-SEC-REL: 关闭 ignoreBuildErrors，让 TypeScript 错误在 build 时暴露
  // 之前为 true 导致类型错误混入生产 bundle，运行时崩溃。
  typescript: {
    ignoreBuildErrors: false,
  },
  // AUDIT-SEC-REL: 启用 React 严格模式，暴露潜在问题（effect 重复执行、deprecated API 等）
  reactStrictMode: true,
  // AUDIT-SEC-REL: 限制上游 body 防止大请求 DoS（1MB，覆盖绝大多数 API 调用）
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  // AUDIT-SEC-REL: eslint 配置不在 NextConfig 类型中，但 Next.js 仍会读取
  // 通过类型断言绕过 TS 检查，运行时仍然生效
  ...({ eslint: { ignoreDuringBuilds: false } } as object),
};

export default nextConfig;
