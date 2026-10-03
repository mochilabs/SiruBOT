import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { toneStyles } from "@/components/primitives/badge";
import { Card } from "@/components/primitives/card";
import { cn } from "@/lib/utils";

/* ─────────────────────────── types ─────────────────────────── */

type Trend = "up" | "down" | "neutral";

interface StatCardProps {
	icon?: React.ComponentType<{ className?: string }>;
	label: string;
	value: string;
	sub?: string;
	trend?: Trend;
	trendValue?: string;
	className?: string;
}

/* ─────────────────────────── styles ─────────────────────────── */

const trendConfig: Record<Trend, { color: string; Icon: React.ComponentType<{ className?: string }> }> = {
	up: { color: toneStyles.success.text, Icon: ArrowUp },
	down: { color: toneStyles.destructive.text, Icon: ArrowDown },
	neutral: { color: "text-muted-foreground", Icon: Minus },
};

/* ─────────────────────────── component ─────────────────────────── */

export function StatCard({ icon: Icon, label, value, sub, trend, trendValue, className }: StatCardProps) {
	const t = trend ? trendConfig[trend] : null;

	return (
		<Card className={cn("gap-3", className)}>
			<div className="flex items-start justify-between gap-3">
				<p className="text-xs font-medium text-muted-foreground">{label}</p>
				{Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />}
			</div>
			<div className="space-y-1">
				<div className="flex items-baseline gap-2">
					<p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
					{t && trendValue && (
						<span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", t.color)}>
							<t.Icon className="h-3 w-3" aria-hidden />
							{trendValue}
						</span>
					)}
				</div>
				{sub && <p className="text-sm text-muted-foreground">{sub}</p>}
			</div>
		</Card>
	);
}
