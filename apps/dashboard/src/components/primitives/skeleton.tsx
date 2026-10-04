import { Card } from "@/components/primitives/card";
import { cn } from "@/lib/utils";

/* ─────────────────────────── types ─────────────────────────── */

interface SkeletonLineProps {
	width?: string;
	height?: string;
	className?: string;
}

interface SkeletonCircleProps {
	size?: string;
	className?: string;
}

interface SkeletonCardProps {
	lines?: number;
	avatar?: boolean;
	className?: string;
}

/* ─────────────────────────── base ─────────────────────────── */

const pulseBase = "animate-pulse rounded-md bg-muted";

/* ─────────────────────────── components ─────────────────────────── */

export function SkeletonLine({ width = "100%", height = "h-4", className }: SkeletonLineProps) {
	return <div className={cn(pulseBase, height, className)} style={{ width }} aria-hidden />;
}

export function SkeletonCircle({ size = "h-10 w-10", className }: SkeletonCircleProps) {
	return <div className={cn(pulseBase, "rounded-full", size, className)} aria-hidden />;
}

export function SkeletonCard({ lines = 3, avatar = true, className }: SkeletonCardProps) {
	return (
		<Card role="status" aria-label="로딩 중" className={className}>
			{avatar && (
				<div className="flex items-center gap-4">
					<SkeletonCircle size="h-12 w-12" />
					<div className="flex-1 space-y-2">
						<SkeletonLine width="60%" height="h-4" />
						<SkeletonLine width="40%" height="h-3" />
					</div>
				</div>
			)}
			<div className="space-y-3">
				{Array.from({ length: lines }, (_, i) => (
					<SkeletonLine key={i} width={i === lines - 1 ? "70%" : "100%"} height="h-3" />
				))}
			</div>
		</Card>
	);
}

/** Convenience namespace */
export const Skeleton = {
	Line: SkeletonLine,
	Circle: SkeletonCircle,
	Card: SkeletonCard,
};
