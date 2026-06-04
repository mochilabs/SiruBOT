"use client";

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

	useEffect(() => {
		setMounted(true);
	}, []);

    if (!mounted) return null;

	return (
		<div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none flex items-center justify-center">
			<div 
				className="absolute bg-primary rounded-full blur-[120px]"
				style={{
					width: primarySize,
					height: primarySize,
                    opacity: primaryOpacity,
					willChange: "opacity",
                    transform: "translateZ(0)",
				}}
			/>
			<div 
				className="absolute bg-secondary rounded-full blur-[100px]"
				style={{
					width: secondarySize * 0.66,
					height: secondarySize * 0.66,
                    opacity: secondaryOpacity,
					willChange: "opacity",
                    transform: "translate(20%, 10%) translateZ(0)",
				}}
			/>
		</div>
	);
}
