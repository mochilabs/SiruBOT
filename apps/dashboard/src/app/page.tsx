import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";

export default function Home() {
	return (
		<div className="w-full relative min-h-screen">
			<HeroSection />

			<FeaturesSection />
		</div>
	);
}
