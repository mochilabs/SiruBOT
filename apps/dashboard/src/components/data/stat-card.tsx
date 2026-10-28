"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";

type Trend = "up" | "down" | "neutral";

export interface StatCardProps {
	icon?: React.ComponentType<{ className?: string }>;
	label: string;
	/** 표시할 값. 숫자면 카운트업, 문자열은 그대로 렌더 */
	value: string | number;
	sub?: string;
	trend?: Trend;
	trendValue?: string;
	className?: string;
}

const trendConfig: Record<Trend, { color: string; Icon: React.ComponentType<{ className?: string }> }> = {
	up: { color: "text-success", Icon: ArrowUp },
	down: { color: "text-destructive", Icon: ArrowDown },
	neutral: { color: "text-muted-foreground", Icon: Minus },
};

/**
 * 숫자 값이면 뷰포트 진입 시 카운트업. 문자열(예: "28K+", "7일")은 그대로 렌더한다.
 */
function StatValue({ value }: { value: string | number }) {
	const isNumber = typeof value === "number" && Number.isFinite(value);
	const { ref, value: display } = useCountUp({ end: isNumber ? (value as number) : 0 });

	if (!isNumber) return <>{value}</>;
	return (
		<span ref={ref} className="tabular-nums">
			{Math.round(display).toLocaleString("ko-KR")}
		</span>
	);
}

export function StatCard({ icon: Icon, label, value, sub, trend, trendValue, className }: StatCardProps) {
	const t = trend ? trendConfig[trend] : null;

	return (
		<Card className={cn("gap-3 rounded-card border-0 p-4 sm:p-5 text-foreground ring-0", className)}>
			<div className="flex items-start justify-between gap-3">
				<p className="text-xs font-medium text-muted-foreground">{label}</p>
				{Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
			</div>
			<div className="space-y-1">
				<div className="flex items-baseline gap-2">
					<p className="text-2xl font-black tabular-nums text-primary-text">
						<StatValue value={value} />
					</p>
					{t && trendValue && (
						<span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", t.color)}>
							<t.Icon className="h-3 w-3" aria-hidden />
							{trendValue}
						</span>
					)}
				</div>
				{sub && <p className="text-xs sm:text-sm text-muted-foreground break-keep leading-snug">{sub}</p>}
			</div>
		</Card>
	);
}
