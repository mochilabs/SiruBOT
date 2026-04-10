"use client";

import { InteractiveGlow } from "@/components/interactive-glow";
import { HeroSection } from "@/components/home/hero-section";
import { FeaturesSection } from "@/components/home/features-section";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.15,
			delayChildren: 0.2,
		},
	},
} as const;

const itemVariants = {
	hidden: { opacity: 0, y: 30 },
	visible: {
		opacity: 1,
		y: 0,
		transition: {
			type: "spring",
			stiffness: 100,
			damping: 20,
		},
	},
} as const;

export default function Home() {
	return (
		<div className="w-full relative bg-background min-h-screen">
			<InteractiveGlow />
			<div className="relative">
				<HeroSection 
					containerVariants={containerVariants} 
					itemVariants={itemVariants} 
				/>

				<FeaturesSection />
			</div>
		</div>
	);
}

