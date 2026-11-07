import type { ReactNode } from "react";
import type { Metadata } from "next";

import { DiscordEmbed } from "@/components/discord-embed";
import { getAppBaseUrl } from "@/lib/discord-embed";

export const metadata: Metadata = {
  title: "봇 초대하기",
  description: "시루봇을 내 Discord 서버에 초대해요.",
  robots: { index: false },
};

export default function InviteLayout({ children }: { children: ReactNode }) {
	const base = getAppBaseUrl();
	return (
		<>
			<DiscordEmbed
				title="시루봇 초대하기"
				description="시루봇을 내 Discord 서버에 초대해요. 음악 신청과 대기열 관리, 웹 플레이어까지 한 번에 쓸 수 있어요."
				url={`${base}/invite`}
				imageUrl={`${base}/images/og-image.png`}
				imageAlt="시루봇"
				buttons={[
				{ label: "봇 초대하기", url: `${base}/invite` },
				{ label: "대시보드 가기", url: `${base}/servers` }
				]}
			/>
			{children}
		</>
	);
}
