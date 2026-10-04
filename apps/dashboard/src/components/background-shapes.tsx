"use client";

import { m } from "framer-motion";

export function BackgroundShapes() {
	const shapes = [
		{ className: "left-[3%] top-[6%] h-28 w-28 rounded-3xl bg-primary/8 rotate-12", duration: 16, delay: 0 },
		{ className: "right-[6%] top-[10%] h-24 w-24 rounded-full bg-secondary/12", duration: 20, delay: 1 },
		{ className: "left-[8%] top-[38%] h-20 w-20 rounded-2xl bg-primary/10 -rotate-6", duration: 18, delay: 2 },
		{ className: "right-[4%] top-[34%] h-32 w-32 rounded-3xl bg-secondary/8 rotate-45", duration: 22, delay: 0.5 },
		{ className: "left-[42%] top-[3%] h-16 w-16 rounded-2xl bg-primary/10 rotate-6", duration: 15, delay: 1.5 },
		{ className: "right-[28%] top-[58%] h-20 w-20 rounded-full bg-primary/8", duration: 19, delay: 0.8 },
		{ className: "left-[5%] top-[68%] h-24 w-24 rounded-3xl bg-secondary/10 rotate-12", duration: 17, delay: 2.5 },
		{ className: "right-[10%] top-[78%] h-16 w-16 rounded-2xl bg-primary/10 -rotate-12", duration: 21, delay: 1.2 },
		{ className: "left-[30%] top-[88%] h-20 w-20 rounded-full bg-secondary/8", duration: 16, delay: 0.3 },
	] as const;

	return (
		<div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
			{shapes.map((shape, index) => (
				<m.div
					key={index}
					className={`absolute hidden md:block dark:opacity-60 ${shape.className}`}
					animate={{ y: [0, -16, 0], rotate: [0, 10, 0], opacity: [0.6, 1, 0.6] }}
					transition={{ duration: shape.duration, delay: shape.delay, repeat: Infinity, ease: "easeInOut" }}
				/>
			))}
		</div>
	);
}