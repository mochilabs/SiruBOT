import type { ReactNode } from "react";
import type { Metadata } from "next";

import { DiscordEmbedLink } from "@/components/discord-embed";
import { OG_IMAGES, socialMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "음악 차트",
  description: "Discord에서 인기 있는 음악 차트를 확인하고 바로 재생해요.",
  ...socialMetadata({ title: "지금 뜨는 음악, 바로 재생해요", description: "차트에서 고른 곡을 바로 틀고, 크로스페이드·갭리스 재생으로 곡 사이를 매끄럽게 이어 들어요.", path: "/track", image: OG_IMAGES.track }),
};

export default function TrackLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DiscordEmbedLink name="track" />
      {children}
    </>
  );
}
