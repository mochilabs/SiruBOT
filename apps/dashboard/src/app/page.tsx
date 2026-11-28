import type { Metadata } from "next";

import { DiscordEmbedLink } from "@/components/discord-embed";
import { CommandListSection } from "@/components/home/command-list-section";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";
import { InviteTicketSection } from "@/components/home/invite-ticket-section";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
};

export default function Home() {
	return (
		<div className="w-full relative isolate min-h-[calc(100svh-var(--navbar-h))]">
			<DiscordEmbedLink name="home" />
			<div aria-hidden className="hero-backdrop pointer-events-none absolute inset-x-0 bottom-0 -top-[var(--navbar-h)] -z-10" />
			<HeroSection />

			<FeaturesSection />

			<CommandListSection />

			<InviteTicketSection />
		</div>
	);
}
