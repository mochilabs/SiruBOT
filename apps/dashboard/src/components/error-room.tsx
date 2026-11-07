/**
 * 오류 일러스트 — 고장 난 시루. 404의 방과 같은 카드·토큰 색·브랜드 도형 언어를 쓰고,
 * 게임 속 시루(둥근 네모)가 눈이 X가 된 채 어질어질해 하고 있어요. 점검 표지판과 꼬깔, 바닥의 렌치가 상황을 말해줘요.
 * 깜빡임은 motion-safe일 때만 움직여요.
 */
export function ErrorRoom({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 480 380" role="img" aria-label="눈이 X가 된 채 어질어질해 하는 시루와 점검 중 표지판 일러스트" className={className}>
			{/* 벽과 바닥 */}
			<rect x="0" y="0" width="480" height="380" rx="28" className="fill-surface-1" />
			<path d="M0 330 H480 V352 a28 28 0 0 1 -28 28 H28 a28 28 0 0 1 -28 -28 Z" className="fill-surface-2" />

			{/* 말풍선 */}
			<rect x="44" y="52" width="104" height="46" rx="23" className="fill-surface-3" />
			<path d="M108 96 l10 18 l8 -18 Z" className="fill-surface-3" />
			<text x="96" y="83" textAnchor="middle" fontSize="20" fontWeight="800" className="fill-foreground/70">
				삐빅…
			</text>

			{/* 그림자와 다리 */}
			<ellipse cx="200" cy="334" rx="76" ry="8" className="fill-foreground/10" />
			<rect x="160" y="296" width="20" height="36" rx="7" className="fill-primary-control-hover" />
			<rect x="222" y="296" width="20" height="36" rx="7" className="fill-primary-control-hover" />

			{/* 팔 — 축 늘어져 있어요 */}
			<rect x="104" y="214" width="22" height="50" rx="11" className="fill-primary-control-hover" />
			<rect x="274" y="214" width="22" height="50" rx="11" className="fill-primary-control-hover" />

			{/* 몸통 */}
			<rect x="126" y="166" width="148" height="140" rx="38" className="fill-primary-control" />
			<rect x="146" y="194" width="108" height="66" rx="20" className="fill-background" />
			{/* X 눈과 일그러진 입 */}
			<path d="M170 218 l16 16 m0 -16 l-16 16 M214 218 l16 16 m0 -16 l-16 16" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-primary-control" />
			<path d="M188 250 q6 -7 12 0 t12 0" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-foreground/50" />

			{/* 안테나 — 전구가 깜빡여요 */}
			<rect x="197.5" y="130" width="5" height="40" rx="2.5" className="fill-foreground/35" />
			<circle cx="200" cy="122" r="10" className="fill-warning motion-safe:animate-pulse" />

			{/* 반창고 */}
			<g transform="rotate(-18 242 170)">
				<rect x="220" y="162" width="46" height="16" rx="6" className="fill-primary" />
				<circle cx="238" cy="170" r="1.8" className="fill-primary-control" />
				<circle cx="246" cy="170" r="1.8" className="fill-primary-control" />
				<circle cx="254" cy="170" r="1.8" className="fill-primary-control" />
			</g>

			{/* 어질어질 별 */}
			<g className="fill-warning motion-safe:animate-pulse">
				<path d="M0 -9 L2.7 -2.7 L9 0 L2.7 2.7 L0 9 L-2.7 2.7 L-9 0 L-2.7 -2.7 Z" transform="translate(132 142)" />
				<path d="M0 -9 L2.7 -2.7 L9 0 L2.7 2.7 L0 9 L-2.7 2.7 L-9 0 L-2.7 -2.7 Z" transform="translate(270 138) scale(0.8)" />
				<path d="M0 -9 L2.7 -2.7 L9 0 L2.7 2.7 L0 9 L-2.7 2.7 L-9 0 L-2.7 -2.7 Z" transform="translate(240 108) scale(0.6)" />
			</g>

			{/* 점검 중 표지판 */}
			<rect x="374" y="204" width="7" height="126" rx="3.5" className="fill-surface-3" />
			<rect x="326" y="140" width="104" height="66" rx="12" className="fill-surface-3" />
			<rect x="334" y="148" width="88" height="50" rx="7" className="fill-background" />
			<text x="378" y="180" textAnchor="middle" fontSize="22" fontWeight="900" className="fill-warning">
				점검 중
			</text>

			{/* 꼬깔 */}
			<rect x="402" y="318" width="52" height="12" rx="4" className="fill-surface-3" />
			<path d="M412 318 L428 246 L444 318 Z" className="fill-warning" />
			<path d="M418 292 L438 292 L435 276 L421 276 Z" className="fill-surface-1" />

			{/* 바닥의 렌치 */}
			<rect x="290" y="338" width="62" height="9" rx="4.5" className="fill-foreground/40" />
			<circle cx="290" cy="342.5" r="10" className="fill-foreground/40" />
			<circle cx="283" cy="342.5" r="5" className="fill-surface-2" />
		</svg>
	);
}
