"use client";

import { m } from "framer-motion";

/**
 * 페이지 전체 배경 장식 shape — 브랜드 아이덴티티 모티프(분홍/카멜 부유 블록).
 * 사유(R-01/R-19): 브랜드 팔레트 인용의 배경 아이덴티티 모티프로, 콘텐츠 없는 여백의 재질감을 준다.
 * 용량 한도: 도형 3개로 제한(9 → 3), 모바일(md 미만)에선 렌더하지 않는다.
 * 모션: 매우 느린 부유 루프(duration 16~22s)로 화면을 복잡하게 하지 않는 강도이며,
 * reduced-motion 환경에서는 Providers의 MotionConfig(reducedMotion="user")가 애니메이션을 정지시킨다.
 */
export function BackgroundShapes() {
	const shapes = [
		{ className: "left-[6%] top-[8%] h-28 w-28 rounded-3xl bg-primary/8 rotate-12", duration: 16, delay: 0 },
		{ className: "right-[5%] top-[30%] h-32 w-32 rounded-3xl bg-secondary/8 rotate-45", duration: 22, delay: 0.5 },
		{ className: "left-[10%] top-[65%] h-24 w-24 rounded-full bg-secondary/10", duration: 17, delay: 2.5 },
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