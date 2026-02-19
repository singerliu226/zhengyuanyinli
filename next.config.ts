import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 使用 webpack 而非 Turbopack（避免中文路径的编码问题）
  // 允许 winston 等 Node.js 模块在服务端使用
  serverExternalPackages: ["winston"],
};

export default nextConfig;
