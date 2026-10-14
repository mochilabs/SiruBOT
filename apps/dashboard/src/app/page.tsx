import { CommandWallSection } from "@/components/home/command-wall-section";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";

export default function Home() {
	return (
		<div className="w-full relative min-h-[calc(100svh-var(--navbar-h))]">
			<HeroSection />

			<CommandWallSection />

			<FeaturesSection />
		</div>
	);
}
