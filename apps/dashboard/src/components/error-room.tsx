/**
 * 오류 일러스트 — 책상에 커피를 엎은 장면. 404의 방(NotFoundRoom)과 같은 방·같은 토큰 색을 쓰고,
 * 쓰러진 머그컵에서 커피가 책상을 타고 흘러내려 바닥에 고여 있어요. 모니터에는 경고가 떠 있어요.
 * 커피색만 테마 토큰에 없어 고정 갈색을 써요. 깜빡임은 motion-safe일 때만 움직여요.
 */
export function ErrorRoom({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 480 380" role="img" aria-label="책상 위에 커피를 엎질러 커피가 흘러내리는 시루의 방 일러스트" className={className}>
			{/* 벽과 바닥 */}
			<rect x="0" y="0" width="480" height="380" rx="28" className="fill-surface-1" />
			<path d="M0 330 H480 V352 a28 28 0 0 1 -28 28 H28 a28 28 0 0 1 -28 -28 Z" className="fill-surface-2" />

			{/* 창문 */}
			<rect x="44" y="44" width="124" height="116" rx="14" className="fill-surface-3" />
			<rect x="52" y="52" width="108" height="100" rx="9" className="fill-background" />
			<circle cx="122" cy="88" r="15" className="fill-primary" />
			<circle cx="129" cy="83" r="13" className="fill-background" />
			<circle cx="82" cy="72" r="2" className="fill-foreground/60" />
			<circle cx="98" cy="118" r="2.5" className="fill-foreground/50" />
			<circle cx="136" cy="126" r="1.8" className="fill-foreground/60" />
			<rect x="104" y="52" width="4" height="100" className="fill-surface-3" />
			<rect x="52" y="98" width="108" height="4" className="fill-surface-3" />

			{/* 선반 */}
			<rect x="296" y="138" width="148" height="8" rx="4" className="fill-surface-3" />
			<rect x="308" y="110" width="14" height="28" rx="3" className="fill-primary-control" />
			<rect x="324" y="116" width="12" height="22" rx="3" className="fill-foreground/25" />
			<rect x="338" y="106" width="14" height="32" rx="3" className="fill-primary" />
			<path d="M392 138 h30 l-4 -22 h-22 Z" className="fill-primary-control" />
			<circle cx="407" cy="100" r="10" className="fill-success" />
			<circle cx="397" cy="108" r="8" className="fill-success/80" />
			<circle cx="417" cy="108" r="8" className="fill-success/80" />

			{/* 바닥에 고인 커피 */}
			<ellipse cx="322" cy="348" rx="48" ry="9" className="fill-[#7a4e3a]" />
			<ellipse cx="310" cy="346" rx="18" ry="3" className="fill-[#9a6a52]" />

			{/* 책상 */}
			<rect x="34" y="284" width="412" height="18" rx="7" className="fill-surface-3" />
			<rect x="64" y="302" width="16" height="42" rx="4" className="fill-surface-3" />
			<rect x="400" y="302" width="16" height="42" rx="4" className="fill-surface-3" />

			{/* 책상 위로 번진 커피와 흘러내리는 줄기 */}
			<path d="M358 289 L258 289 C 258 279, 280 277, 304 279 C 326 281, 342 277, 358 281 Z" className="fill-[#7a4e3a]" />
			<path d="M310 288 H330 C 330 306, 326 322, 323 344 H316 C 313 322, 310 306, 310 288 Z" className="fill-[#7a4e3a]" />
			<circle cx="346" cy="318" r="3.4" className="fill-[#7a4e3a] motion-safe:animate-pulse" />

			{/* 모니터 — 경고 */}
			<rect x="228" y="270" width="24" height="14" className="fill-surface-3" />
			<rect x="208" y="280" width="64" height="6" rx="3" className="fill-surface-3" />
			<rect x="160" y="176" width="160" height="100" rx="12" className="fill-surface-3" />
			<rect x="168" y="184" width="144" height="84" rx="7" className="fill-background" />
			<path d="M200 206 L222 244 H178 Z" strokeWidth="7" strokeLinejoin="round" className="fill-destructive/25 stroke-destructive" />
			<rect x="197.5" y="217" width="5" height="13" rx="2.5" className="fill-destructive" />
			<circle cx="200" cy="236" r="3" className="fill-destructive" />
			<rect x="236" y="212" width="58" height="5" rx="2.5" className="fill-foreground/25" />
			<rect x="236" y="224" width="40" height="5" rx="2.5" className="fill-foreground/15" />
			<rect x="236" y="236" width="48" height="5" rx="2.5" className="fill-foreground/15" />

			{/* 스탠드 조명 */}
			<ellipse cx="86" cy="282" rx="22" ry="5" className="fill-surface-2" />
			<path d="M86 280 V226 L112 196" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="stroke-foreground/40" />
			<path d="M96 188 a20 20 0 0 1 32 16 Z" className="fill-primary-control" />

			{/* 쓰러진 머그컵 */}
			<g transform="rotate(-14 372 272)">
				<rect x="356" y="262" width="38" height="24" rx="8" className="fill-primary" />
				<ellipse cx="356" cy="274" rx="5" ry="11" className="fill-[#7a4e3a]" />
				<path d="M370 262 c0 -12 22 -12 22 0" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-primary" />
			</g>
			{/* 튄 방울과 놀람 표시 */}
			<g className="fill-[#7a4e3a]">
				<circle cx="344" cy="262" r="3" />
				<circle cx="332" cy="270" r="2.2" />
				<circle cx="352" cy="250" r="2" />
			</g>
			<g className="stroke-destructive motion-safe:animate-pulse" strokeWidth="4" strokeLinecap="round">
				<path d="M396 236 v-14" />
				<path d="M396 246 v0.5" />
				<path d="M410 240 l10 -10" />
				<path d="M380 238 l-10 -10" />
			</g>
		</svg>
	);
}
