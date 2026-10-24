"use client";

export interface CommitWeek {
	week: number;
	days: number[];
}

/** 커밋 수 → 히트맵 농도 5단계(0~4). GitHub 잔디 관례를 따라요 */
function heatLevel(commits: number): 0 | 1 | 2 | 3 | 4 {
	if (commits <= 0) return 0;
	if (commits <= 2) return 1;
	if (commits <= 5) return 2;
	if (commits <= 10) return 3;
	return 4;
}

const HEAT_CLASSES = ["bg-surface-2", "bg-primary/25", "bg-primary/50", "bg-primary/75", "bg-primary-control"] as const;

/**
 * 주간 커밋 히트맵 그리드 — 오래된 주 → 최신 주 순서로 열이 늘어서요.
 * 좁은 화면(모바일)에서는 컨테이너가 최신 주 쪽 끝으로 초기 스크롤돼요:
 * 첫 화면에 "가장 최근 활동"이 보이게 하기 위해서고, 왼쪽으로 밀면 과거를 볼 수 있어요.
 */
export function CommitHeatmapGrid({ weeks }: { weeks: CommitWeek[] }) {
	return (
		<div
			role="img"
			aria-label="지난 1년간 주간 커밋 히트맵"
			className="mt-4 overflow-x-auto pb-2 scrollbar-none"
			ref={(el) => {
				if (el) el.scrollLeft = el.scrollWidth;
			}}
		>
			<div className="flex w-max gap-[3px]">
				{weeks.map((week) => (
					<div key={week.week} className="flex flex-col gap-[3px]">
						{week.days.map((commits, dayIndex) => (
							<span
								key={dayIndex}
								title={`${new Date((week.week + dayIndex * 86400) * 1000).toLocaleDateString("ko-KR")} · ${commits}커밋`}
								className={`size-[10px] rounded-[2px] ${HEAT_CLASSES[heatLevel(commits)]}`}
							/>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

/** 범례 — 색만으로 상태를 전달하지 않게 텍스트를 병행해요 */
export function CommitHeatmapLegend() {
	return (
		<>
			{HEAT_CLASSES.map((cls) => (
				<span key={cls} className={`size-[10px] rounded-[2px] ${cls}`} aria-hidden />
			))}
		</>
	);
}