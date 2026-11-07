"use client";

import { useState } from "react";

import { NotFoundGame } from "@/components/not-found-game";

/**
 * 404 일러스트 — 시루의 방. 모니터에 404가 떠 있는 책상 장면이에요.
 * 색은 전부 디자인 토큰 클래스(fill·stroke)라 라이트·다크 테마를 자동으로 따라가요.
 * 모니터 화면을 누르면 미니게임이 켜져요(이스터에그, 힌트는 두지 않아요).
 * 도형은 브랜드 모티프(원·둥근 사각형·반원)만 써요. 장식용이라 대체 텍스트는 한 줄로 둬요.
 */
export function NotFoundRoom({ className }: { className?: string }) {
	const [playing, setPlaying] = useState(false);

	return (
		<div className={`relative ${className ?? ""}`}>
		<svg viewBox="0 0 480 380" role="img" aria-label="모니터에 404가 떠 있는 시루의 방 일러스트" className="block h-auto w-full">
			{/* 벽과 바닥 */}
			<rect x="0" y="0" width="480" height="380" rx="28" className="fill-surface-1" />
			<path d="M0 330 H480 V352 a28 28 0 0 1 -28 28 H28 a28 28 0 0 1 -28 -28 Z" className="fill-surface-2" />

			{/* 창문 — 밤하늘과 달 */}
			<rect x="44" y="44" width="124" height="116" rx="14" className="fill-surface-3" />
			<rect x="52" y="52" width="108" height="100" rx="9" className="fill-background" />
			<circle cx="122" cy="88" r="15" className="fill-primary" />
			<circle cx="129" cy="83" r="13" className="fill-background" />
			<circle cx="82" cy="72" r="2" className="fill-foreground/60" />
			<circle cx="98" cy="118" r="2.5" className="fill-foreground/50" />
			<circle cx="136" cy="126" r="1.8" className="fill-foreground/60" />
			<rect x="104" y="52" width="4" height="100" className="fill-surface-3" />
			<rect x="52" y="98" width="108" height="4" className="fill-surface-3" />

			{/* 선반 — 책과 화분 */}
			<rect x="296" y="178" width="148" height="8" rx="4" className="fill-surface-3" />
			<rect x="308" y="150" width="14" height="28" rx="3" className="fill-primary-control" />
			<rect x="324" y="156" width="12" height="22" rx="3" className="fill-foreground/25" />
			<rect x="338" y="146" width="14" height="32" rx="3" className="fill-primary" />
			<path d="M392 178 h30 l-4 -22 h-22 Z" className="fill-primary-control" />
			<circle cx="407" cy="140" r="10" className="fill-success" />
			<circle cx="397" cy="148" r="8" className="fill-success/80" />
			<circle cx="417" cy="148" r="8" className="fill-success/80" />

			{/* 책상 */}
			<rect x="34" y="284" width="412" height="18" rx="7" className="fill-surface-3" />
			<rect x="64" y="302" width="16" height="42" rx="4" className="fill-surface-3" />
			<rect x="400" y="302" width="16" height="42" rx="4" className="fill-surface-3" />

			{/* 모니터 */}
			<rect x="228" y="270" width="24" height="14" className="fill-surface-3" />
			<rect x="208" y="280" width="64" height="6" rx="3" className="fill-surface-3" />
			<rect x="140" y="176" width="200" height="100" rx="12" className="fill-surface-3" />
			<rect x="148" y="184" width="184" height="84" rx="7" className="fill-background" />
			<text x="240" y="244" textAnchor="middle" fontSize="44" fontWeight="900" letterSpacing="-2" className="fill-primary-control">
				404
			</text>
			{/* 깜빡이는 커서 — 모션 줄이기 설정에서는 멈춰요 */}
			<rect x="268" y="204" width="8" height="3" rx="1.5" className="fill-foreground/70 motion-safe:animate-pulse" />
			<rect x="164" y="200" width="56" height="4" rx="2" className="fill-foreground/20" />
			<rect x="164" y="210" width="36" height="4" rx="2" className="fill-foreground/15" />

			{/* 스탠드 조명 */}
			<ellipse cx="86" cy="282" rx="22" ry="5" className="fill-surface-2" />
			<path d="M86 280 V226 L112 196" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="stroke-foreground/40" />
			<path d="M96 188 a20 20 0 0 1 32 16 Z" className="fill-primary-control" />

			{/* 머그컵 */}
			<rect x="368" y="258" width="30" height="26" rx="7" className="fill-primary" />
			<path d="M398 265 h5 a7 7 0 0 1 0 14 h-5" fill="none" strokeWidth="4" className="stroke-primary" />
			<path d="M376 250 q-4 -8 0 -14 M388 250 q-4 -8 0 -14" fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-foreground/30" />

			{/* 음표 */}
			<g className="fill-primary-control" opacity="0.7">
				<circle cx="196" cy="128" r="6" />
				<rect x="200" y="106" width="3" height="23" rx="1.5" />
				<circle cx="238" cy="104" r="5" />
				<rect x="242" y="86" width="3" height="19" rx="1.5" />
			</g>
		</svg>

		{/* 모니터 화면 위치(viewBox 148,184 · 184×84)에 맞춘 오버레이 */}
		<div className="absolute" style={{ left: "30.83%", top: "48.42%", width: "38.33%", height: "22.11%" }}>
			{playing ? (
				<NotFoundGame onExit={() => setPlaying(false)} />
			) : (
				<button type="button" onClick={() => setPlaying(true)} aria-label="모니터 화면 켜기" className="h-full w-full cursor-pointer rounded-[7px]" />
			)}
		</div>
		</div>
	);
}
