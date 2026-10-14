import { CommandListSection } from "@/components/home/command-list-section";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";
import { InviteTicketSection } from "@/components/home/invite-ticket-section";

export default function Home() {
	return (
		<div className="w-full relative min-h-[calc(100svh-var(--navbar-h))]">
			<HeroSection />

			<CommandListSection />

			<FeaturesSection />

			<InviteTicketSection />
		</div>
	);
}
