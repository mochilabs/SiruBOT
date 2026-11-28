import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sirubot/prisma"],
  // Next 16.4 Turbopack sourcemap 생성 패닉 우회 (두 플래그 모두 비활성화 필요)
  experimental: { turbopackSourceMaps: false, turbopackInputSourceMaps: false, agentUpgrade: "security" },
  // @sirubot/utils의 런타임 discord.js import 시 @discordjs/ws의 옵셔널 네이티브 의존(zlib-sync) 정적 해석 방지
  serverExternalPackages: ["discord.js", "@discordjs/ws"],
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
        hostname: "avatars.githubusercontent.com",
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
