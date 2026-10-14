/**
 * 히어로 전용 정적 패턴 배경 — WebGL 셰이더 배경(GPU 상시 100% 부하)을 대체한 가벼운 CSS 패턴이에요.
 * 사유(브랜드 아이덴티티): 셰이더가 그리던 M3 모티프(헤어라인 그리드·스포트라이트·토큰)를
 * 도트 그리드 + 정적 글로우 + 스퀄클 외곽선으로 저비용 재현해요. 애니메이션/루프 없음(rAF·컴포지터 0).
 * 히어로 섹션의 첫 자식으로 렌더해 DOM 순서 그리기 규칙으로 이후 형제(콘텐츠 그리드·스크롤 힌트)보다
 * 뒤에 깔려요 — 별도 z-index 없음. 히어로와 함께 스크롤되며 아래로 내려가요.
 * 색은 토큰(--color-primary/--color-secondary)만 써 다크·라이트가 자동 스왑돼요.
 */
export function HeroPattern() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
			{/* 도트 그리드 — 셰이더 인터섹션 마이크로 닷 모티프, 하단으로 페이드아웃 */}
			<div className="absolute inset-0 opacity-70 [background-image:radial-gradient(var(--color-primary)_1px,transparent_1.5px)] [background-size:26px_26px] [mask-image:linear-gradient(to_bottom,black_10%,transparent_88%)]" />

			{/* 스포트라이트 글로우 — 우측(턴테이블 자리) + 좌상단 풀, 정적 */}
			<div className="absolute top-1/4 -right-40 h-104 w-104 rounded-full bg-primary/10 blur-3xl" />
			<div className="absolute -top-24 -left-32 h-72 w-72 rounded-full bg-secondary/20 blur-3xl" />

			{/* M3 토큰 — 정적 스퀄클 외곽선 (모션 없음) */}
			<div className="absolute top-[18%] right-[8%] hidden h-44 w-44 rotate-12 rounded-[3rem] border border-primary/15 sm:block" />
			<div className="absolute bottom-[16%] left-[6%] hidden h-28 w-28 rotate-6 rounded-[2rem] border border-primary/10 sm:block" />
		</div>
	);
}