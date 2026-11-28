"use client";

export interface CommitWeek {
	week: number;
	days: number[];
}

function heatLevel(commits: number): 0 | 1 | 2 | 3 | 4 {
	if (commits <= 0) return 0;
	if (commits <= 2) return 1;
	if (commits <= 5) return 2;
	if (commits <= 10) return 3;
	return 4;
}

const HEAT_CLASSES = ["bg-surface-2", "bg-primary/25", "bg-primary/50", "bg-primary/75", "bg-primary-control"] as const;

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
			<div className="flex min-w-[690px] gap-[3px]">
				{weeks.map((week) => (
					<div key={week.week} className="flex min-w-0 flex-1 flex-col gap-[3px]">
						{week.days.map((commits, dayIndex) => (
							<span
								key={dayIndex}
								title={`${new Date((week.week + dayIndex * 86400) * 1000).toLocaleDateString("ko-KR")} · ${commits}커밋`}
								className={`aspect-square w-full rounded-[2px] ${HEAT_CLASSES[heatLevel(commits)]}`}
							/>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

export function CommitHeatmapLegend() {
	return (
		<>
			{HEAT_CLASSES.map((cls) => (
				<span key={cls} className={`size-[10px] rounded-[2px] ${cls}`} aria-hidden />
			))}
		</>
	);
}