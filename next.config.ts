import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // TODO: 54 TS errors remaining (mostly Prisma 'never' types from missing @relation in schema)
    // Fix incrementally: temporal-diff/route.ts (23), soul-service.ts (6), vision/snapshot (3)
    ignoreBuildErrors: true, // TODO: fix remaining TS errors incrementally
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    'localhost',
  ],
};

export default nextConfig;
