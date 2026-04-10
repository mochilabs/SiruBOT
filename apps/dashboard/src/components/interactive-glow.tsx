"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useState } from "react";

interface InteractiveGlowProps {
    primarySize?: number;
    secondarySize?: number;
    primaryOpacity?: number;
    secondaryOpacity?: number;
}

export function InteractiveGlow({
    primarySize = 600,
    secondarySize = 400,
    primaryOpacity = 0.15,
    secondaryOpacity = 0.1,
}: InteractiveGlowProps) {
	const [mounted, setMounted] = useState(false);
	
	// Mouse tracking for interactive glow
	const mouseX = useMotionValue(0);
	const mouseY = useMotionValue(0);

	// Smooth springs for a premium feel
	const springConfig = { damping: 30, stiffness: 80 };
	const glowX = useSpring(mouseX, springConfig);
	const glowY = useSpring(mouseY, springConfig);

	useEffect(() => {
		setMounted(true);
		
        // Initialize position to center or some default
        mouseX.set(window.innerWidth / 2);
        mouseY.set(window.innerHeight / 2);

		const handleMouseMove = (e: MouseEvent) => {
			mouseX.set(e.clientX);
			mouseY.set(e.clientY);
		};

		window.addEventListener("mousemove", handleMouseMove);
		return () => window.removeEventListener("mousemove", handleMouseMove);
	}, [mouseX, mouseY]);

    if (!mounted) return null;

	return (
		<div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
			<motion.div 
				className="absolute bg-primary rounded-full blur-[120px]"
				style={{
					width: primarySize,
					height: primarySize,
					left: glowX,
					top: glowY,
					translateX: "-50%",
					translateY: "-50%",
                    opacity: primaryOpacity,
				}}
			/>
			<motion.div 
				className="absolute bg-secondary rounded-full blur-[100px]"
				style={{
					width: secondarySize,
					height: secondarySize,
					left: glowX,
					top: glowY,
					translateX: "20%",
					translateY: "10%",
                    opacity: secondaryOpacity,
				}}
			/>
		</div>
	);
}
