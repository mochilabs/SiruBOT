import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "시루봇",
    short_name: "시루봇",
    description: "음악 재생부터 AI 채팅, 서버 관리까지. 시루봇 하나로 Discord를 더 편리하게 즐겨보세요.",
    start_url: "/",
    display: "standalone",
    background_color: "#17111b",
    theme_color: "#17111b",
    icons: [
      {
        src: "/images/siru-profile-hand.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
