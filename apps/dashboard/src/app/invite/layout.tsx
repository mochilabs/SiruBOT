import type { ReactNode } from "react";
import type { Metadata } from "next";

import { DiscordEmbedLink } from "@/components/discord-embed";
import { OG_IMAGES, socialMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "봇 초대하기",
  description: "시루봇을 내 Discord 서버에 초대해요.",
  ...socialMetadata({ title: "내 서버에 시루봇을 초대해요", description: "음악 신청과 대기열 관리, 웹 플레이어까지 초대 한 번으로 바로 쓸 수 있어요.", path: "/invite", image: OG_IMAGES.invite }),
  robots: { index: false },
};

export default function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DiscordEmbedLink name="invite" />
      {children}
    </>
  );
}
