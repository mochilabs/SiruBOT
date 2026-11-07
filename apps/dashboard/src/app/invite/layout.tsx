import type { ReactNode } from "react";
import type { Metadata } from "next";

import { DiscordEmbedLink } from "@/components/discord-embed";

export const metadata: Metadata = {
  title: "봇 초대하기",
  description: "시루봇을 내 Discord 서버에 초대해요.",
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
