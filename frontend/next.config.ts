import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../"),
  
  // Suppress Next.js 15 dynamic API warnings
  // These are false positives from Next.js internals
  // Our code uses "use client" so doesn't trigger these
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

export default nextConfig;
