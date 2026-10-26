import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  ...(process.env.PRONTO_LOW_MEMORY_BUILD === "1" ? { experimental: { webpackMemoryOptimizations: true, cpus: 1 } } : {}),
};

export default nextConfig;
