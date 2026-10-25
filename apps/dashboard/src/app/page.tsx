import type { Metadata } from "next";

import { CommandListSection } from "@/components/home/command-list-section";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";
import { InviteTicketSection } from "@/components/home/invite-ticket-section";

export const metadata: Metadata = {
  title: { absolute: "시루봇 | Discord 음악·AI·서버 관리 봇" },
  description: "음악 재생부터 AI 채팅, 서버 관리까지. 시루봇 하나로 Discord를 더 편리하게 즐겨보세요.",
};

export default function Home() {
	return (
		<div className="w-full relative min-h-[calc(100svh-var(--navbar-h))]">
			<HeroSection />

			<FeaturesSection />

			<CommandListSection />

			<InviteTicketSection />
		</div>
	);
}
