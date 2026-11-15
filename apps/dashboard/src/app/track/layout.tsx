import type { ReactNode } from "react";
import type { Metadata } from "next";

import { DiscordEmbedLink } from "@/components/discord-embed";
import { OG_IMAGES, socialMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "음악 차트",
  description: "Discord에서 인기 있는 음악 차트를 확인하고 바로 재생해요.",
  ...socialMetadata({ title: "지금 뜨는 음악, 바로 재생해요", description: "Discord에서 많이 듣는 음악 차트를 확인하고 버튼 한 번으로 내 서버에서 틀어보세요.", path: "/track", image: OG_IMAGES.track }),
};

export default function TrackLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DiscordEmbedLink name="track" />
      {children}
    </>
  );
}
