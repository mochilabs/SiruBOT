import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sirubot/prisma"],
  output: "standalone",
  allowedDevOrigins: ['derisively-gnarliest-samson.ngrok-free.dev', '*.local', '192.168.*.*', '10.*.*.*', '172.16.*.*'],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "i.scdn.co"
      },
      {
        protocol: "https",
        hostname: "*.sndcdn.com"
      },
      {
        protocol: "https",
        hostname: "api.dicebear.com"
      }
    ],
  }
};

export default nextConfig;
