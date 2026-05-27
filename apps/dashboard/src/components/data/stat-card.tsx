import { ArrowDown, ArrowUp, Minus } from "lucide-react";

/* ─────────────────────────── types ─────────────────────────── */

type Trend = "up" | "down" | "neutral";

interface StatCardProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: string;
	sub?: string;
	trend?: Trend;
	trendValue?: string;
	className?: string;
}

/* ─────────────────────────── styles ─────────────────────────── */

const trendConfig: Record<Trend, { color: string; Icon: React.ComponentType<{ className?: string }> }> = {
	up: { color: "text-emerald-500", Icon: ArrowUp },
	down: { color: "text-rose-500", Icon: ArrowDown },
	neutral: { color: "text-muted-foreground/40", Icon: Minus },
};

/* ─────────────────────────── component ─────────────────────────── */

export function StatCard({
	icon: Icon,
	label,
	value,
	sub,
	trend,
	trendValue,
	className = "",
}: StatCardProps) {
	const t = trend ? trendConfig[trend] : null;

	return (
		<div className={`glass-panel p-4 sm:p-6 space-y-4 hover:border-primary/40 transition-all group ${className}`}>
			<div className="flex items-center justify-between">
				<div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all">
					<Icon className="h-6 w-6" />
				</div>
				<div className="text-right">
					<p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/40">
						{label}
					</p>
					{t && trendValue && (
						<div className={`flex items-center gap-1 justify-end mt-1 ${t.color}`}>
							<t.Icon className="h-3 w-3" />
							<span className="text-xs font-bold">{trendValue}</span>
						</div>
					)}
				</div>
			</div>
			<div className="space-y-1">
				<p className="text-3xl font-black tracking-tighter text-foreground tabular-nums">
					{value}
				</p>
				{sub && (
					<p className="text-sm font-medium text-muted-foreground/60">{sub}</p>
				)}
			</div>
		</div>
	);
}
