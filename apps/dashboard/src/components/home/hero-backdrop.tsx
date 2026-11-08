"use client";

import { m, useReducedMotion } from "framer-motion";

const DOT_COLUMNS = 7;
const DOT_ROWS = 5;
const DOT_GAP = 26;

/**
 * 히어로 배경 장식 — 데모 카드 뒤에 놓이는 큰 원, 가는 원 하나, 기울어진 둥근 사각형, 점 격자.
 * 선을 가로질러 흩뿌리지 않고 소수의 면을 카드 주변에만 배치해요(초대 카드 장식과 같은 문법).
 * 전부 단색 저대비라 텍스트 가독성을 해치지 않고, 처음 한 번만 서서히 나타나요.
 */
export function HeroBackdrop() {
	const shouldReduce = useReducedMotion();
	const fade = (delay: number) =>
		shouldReduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.9, delay, ease: "easeOut" as const } };

	return (
		<svg
			aria-hidden
			viewBox="0 0 1200 800"
			preserveAspectRatio="xMaxYMid slice"
			className="pointer-events-none absolute inset-0 h-full w-full text-primary-control"
			fill="none"
		>
			<m.circle cx={940} cy={360} r={250} fill="currentColor" fillOpacity={0.08} {...fade(0)} />
			<m.circle cx={940} cy={360} r={330} stroke="currentColor" strokeOpacity={0.22} strokeWidth={1.5} {...fade(0.15)} />
			<m.rect x={640} y={560} width={190} height={190} rx={44} transform="rotate(14 735 655)" fill="currentColor" fillOpacity={0.07} {...fade(0.3)} />
			<m.g fill="currentColor" fillOpacity={0.3} {...fade(0.45)}>
				{Array.from({ length: DOT_COLUMNS * DOT_ROWS }, (_, index) => (
					<circle key={index} cx={1010 + (index % DOT_COLUMNS) * DOT_GAP} cy={90 + Math.floor(index / DOT_COLUMNS) * DOT_GAP} r={2.5} />
				))}
			</m.g>
		</svg>
	);
}
