import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sirubot/prisma"],
  // @sirubot/utils 번들이 embed 헬퍼로 discord.js를 런타임 import해요.
  // 번들 대상에서 빼지 않으면 @discordjs/ws의 옵셔널 네이티브 의존(zlib-sync)을
  // 정적 해석하려다 빌드가 깨져요 — 런타임에서는 lazy import + catch로 처리돼요.
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
