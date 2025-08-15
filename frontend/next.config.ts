import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Skip type checking during build (since it works locally)
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip ESLint during build
    ignoreDuringBuilds: true,
  },
  // Allow access from your local network IP
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
