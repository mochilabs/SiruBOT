import { CommandMarquee } from "@/components/home/command-marquee";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";

export default function Home() {
	return (
		<div className="w-full relative min-h-screen">
			<HeroSection />

			{/* 슬래시 커맨드 마키 — 히어로와 기능 섹션 사이의 장식 스트립 */}
			<CommandMarquee />

			<FeaturesSection />
		</div>
	);
}
