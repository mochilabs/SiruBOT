"use client";

import { m } from "framer-motion";

/**
 * 전역 body 배경 — 랜딩 CTA 카드의 저채도 도형(라운드 사각 + 원)을 사이트 전체에 확장.
 * fixed 레이어라 스크롤 내내 유지되고, reduced-motion 시 정지해요.
 */
export function BackgroundShapes() {
	const shapes = [
		{ className: "left-[3%] top-[6%] h-28 w-28 rounded-3xl bg-primary/5 rotate-12", duration: 16, delay: 0 },
		{ className: "right-[6%] top-[10%] h-24 w-24 rounded-full bg-secondary/8", duration: 20, delay: 1 },
		{ className: "left-[8%] top-[38%] h-20 w-20 rounded-2xl bg-primary/6 -rotate-6", duration: 18, delay: 2 },
		{ className: "right-[4%] top-[34%] h-32 w-32 rounded-3xl bg-secondary/5 rotate-45", duration: 22, delay: 0.5 },
		{ className: "left-[42%] top-[3%] h-16 w-16 rounded-2xl bg-primary/6 rotate-6", duration: 15, delay: 1.5 },
		{ className: "right-[28%] top-[58%] h-20 w-20 rounded-full bg-primary/5", duration: 19, delay: 0.8 },
		{ className: "left-[5%] top-[68%] h-24 w-24 rounded-3xl bg-secondary/6 rotate-12", duration: 17, delay: 2.5 },
		{ className: "right-[10%] top-[78%] h-16 w-16 rounded-2xl bg-primary/6 -rotate-12", duration: 21, delay: 1.2 },
		{ className: "left-[30%] top-[88%] h-20 w-20 rounded-full bg-secondary/5", duration: 16, delay: 0.3 },
	] as const;

	return (
		<div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
			{shapes.map((shape, index) => (
				<m.div
					key={index}
					className={`absolute hidden md:block ${shape.className}`}
					animate={{ y: [0, -16, 0], rotate: [0, 10, 0], opacity: [0.6, 1, 0.6] }}
					transition={{ duration: shape.duration, delay: shape.delay, repeat: Infinity, ease: "easeInOut" }}
				/>
			))}
		</div>
	);
}