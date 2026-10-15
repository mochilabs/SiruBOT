import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sirubot/prisma"],
  // Turbopack 빌드가 sourcemap 생성 단계에서 패닉해요 (generate_source_map was canceled, Next 16.4).
  // webpack 빌드(--webpack)는 정상이라 Turbopack 이슈로 보고 sourcemap 생성 자체를 꺼서 우회해요.
  // 두 플래그를 함께 꺼야 하고, 빌드 산출물에는 sourcemap이 없어요 (디버그는 webpack 빌드로).
  experimental: { turbopackSourceMaps: false, turbopackInputSourceMaps: false },
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
