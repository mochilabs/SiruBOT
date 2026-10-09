// 슬래시 커맨드 무한 마키 — 히어로와 기능 섹션 사이에 배치되는 얇은 장식 스트립.
// 순수 CSS 애니메이션(animate-marquee + @keyframes marquee)으로 동작하므로 서버 컴포넌트로 충분하다.
// prefers-reduced-motion: reduce 환경에서는 globals.css의 전역 블록이 모든 애니메이션을 정지시킨다(별도 처리 불필요).

const COMMANDS = [
	'/재생',
	'/검색',
	'/현재곡',
	'/대기열',
	'/볼륨',
	'/셔플',
	'/일시정지',
	'/가사',
	'/플레이리스트',
	'/즐겨찾기',
	'/날씨',
	'/택배',
	'/운세',
	'/임시채널',
	'/가위바위보',
	'/주사위'
] as const;

// 리스트 2회 렌더 + translateX(-50%) 키프레임 = 끊김 없는 무한 루프 1주기
const LOOP_ITEMS = [...COMMANDS, ...COMMANDS];

export function CommandMarquee() {
	return (
		// 장식 요소 — 스크린 리더에 노출하지 않는다. hover 시 애니메이션만 일시정지(드래그 등 인터랙션 없음)
		<div
			aria-hidden="true"
			className="group overflow-hidden border-y border-border-subtle bg-surface-2 py-3 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] sm:py-4"
		>
			{/* hover 정지는 wrapper(group) hover를 트랙 애니메이션에 전달하기 위해 group-hover로 연결한다 */}
			<div className="animate-marquee group-hover:[animation-play-state:paused] flex w-max">
				{LOOP_ITEMS.map((command, index) => (
					<span
						key={`${command}-${index}`}
						className="flex shrink-0 items-center gap-2 pl-2 text-xs font-bold tracking-tight text-muted-foreground sm:text-sm"
					>
						<code className="border-border-subtle bg-surface-1 rounded-control border px-2 py-1">{command}</code>
						{/* 항목 사이 도트 구분자 — 다음 항목과의 간격 역할 (마지막 항목 뒤 도트가 루프 시작점 간격이 된다) */}
						<span className="bg-primary/50 h-1 w-1 shrink-0 rounded-full" />
					</span>
				))}
			</div>
		</div>
	);
}