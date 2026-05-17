import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // VPS punya RAM kecil — skip TS check di build, run separately
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
