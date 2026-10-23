import { cn } from "@/lib/utils";

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

const pulseBase = "animate-pulse rounded-md bg-muted";

function SkeletonLine({ width = "100%", height = "h-4", className }: SkeletonLineProps) {
	return <div className={cn(pulseBase, height, className)} style={{ width }} aria-hidden />;
}

function SkeletonCircle({ size = "h-10 w-10", className }: SkeletonCircleProps) {
	return <div className={cn(pulseBase, "rounded-full", size, className)} aria-hidden />;
}

function SkeletonCard({ lines = 3, avatar = true, className }: SkeletonCardProps) {
	return (
		<div
			role="status"
			aria-label="로딩 중"
			className={cn("relative flex flex-col gap-4 overflow-hidden rounded-card border-0 bg-card p-6", className)}
		>
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
		</div>
	);
}

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="skeleton" className={cn(pulseBase, className)} {...props} />;
}

Skeleton.Line = SkeletonLine;
Skeleton.Circle = SkeletonCircle;
Skeleton.Card = SkeletonCard;

export { Skeleton, SkeletonCard, SkeletonCircle, SkeletonLine };
