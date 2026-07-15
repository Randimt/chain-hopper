import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // VPS punya RAM kecil — skip TS check di build, run separately
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Security headers — blocks clickjacking + reduces XSS surface
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js needs unsafe-eval
              "style-src 'self' 'unsafe-inline'", // Tailwind needs unsafe-inline
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.circle.com https://*.alchemy.com https://*.infura.io https://*.publicnode.com wss://*.publicnode.com",
              "frame-ancestors 'none'", // Prevents iframe embedding (anti-clickjacking)
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY", // Blocks iframe embedding completely
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff", // Prevents MIME-type sniffing attacks
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
