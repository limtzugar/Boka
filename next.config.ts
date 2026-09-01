import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // TODO: 54 TS errors remaining (mostly Prisma 'never' types from missing @relation in schema)
    // Fix incrementally: temporal-diff/route.ts (23), soul-service.ts (6), vision/snapshot (3)
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    '21.0.19.70',
  ],
};

export default nextConfig;
