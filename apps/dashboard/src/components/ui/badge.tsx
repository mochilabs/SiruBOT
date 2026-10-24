"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export const badgeToneClasses = {
	default: "bg-surface-2 text-foreground/80",
	primary: "bg-primary/10 text-primary-text",
	success: "bg-success/10 text-success",
	// 12px 배지 텍스트는 warning·destructive·discord 틴트 배경 위에서 AA 4.5:1에 못 미쳐요(측정 3.98~4.50:1).
	// 이 세 톤만 솔리드 채움 + 전경 토큰으로 바꿔요(측정 라이트 4.61~5.25:1, 다크 4.61~8.97:1).
	warning: "bg-warning text-warning-foreground",
	// 별칭 계약: danger와 destructive는 같은 클래스를 가리키는 공개 API 별칭이에요(호출부 혼용 유지).
	danger: "bg-destructive text-destructive-foreground",
	destructive: "bg-destructive text-destructive-foreground",
	info: "bg-info/10 text-info",
	discord: "bg-discord-primary text-white",
	secondary: "bg-secondary text-secondary-foreground",
	outline: "border border-border bg-background text-foreground",
	ghost: "hover:bg-muted hover:text-muted-foreground",
	link: "text-primary-text underline-offset-4 hover:underline",
} as const;

const badgeVariants = cva(
	"inline-flex select-none items-center justify-center gap-1.5 rounded-full border-0 px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3",
	{
		variants: {
			variant: badgeToneClasses,
			size: {
				sm: "px-2 py-0.5 text-xs",
				md: "px-2.5 py-1 text-xs",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "md",
		},
	},
);

const dotVariants: Record<NonNullable<VariantProps<typeof badgeVariants>["variant"]>, string> = {
	default: "bg-dot-neutral",
	primary: "bg-primary-control",
	success: "bg-success",
	// 솔리드 배경(위 warning·destructive·discord) 위에서는 dot도 전경색으로 뒤집어야 형태가 읽혀요(측정 4.61~8.97:1)
	warning: "bg-warning-foreground",
	// 별칭 계약: danger와 destructive는 같은 값을 가져요(위 variant와 동일한 별칭 관계).
	danger: "bg-destructive-foreground",
	destructive: "bg-destructive-foreground",
	info: "bg-info",
	discord: "bg-white",
	secondary: "bg-secondary",
	outline: "bg-dot-neutral",
	ghost: "bg-dot-neutral",
	link: "bg-primary-control",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
	dot?: boolean;
	dismissible?: boolean;
	onDismiss?: () => void;
}

function Badge({
	className,
	variant = "default",
	size = "md",
	dot = false,
	dismissible = false,
	onDismiss,
	children,
	...props
}: BadgeProps) {
	return (
		<span className={cn(badgeVariants({ variant, size }), className)} {...props}>
			{dot && <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotVariants[variant ?? "default"])} />}
			{children}
			{dismissible && (
				<button
					type="button"
					onClick={onDismiss}
					aria-label="제거"
					className="-mr-0.5 ml-0.5 inline-flex cursor-pointer items-center justify-center rounded-full p-0.5 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11 pointer-coarse:w-11"
				>
					<X className="h-3 w-3" aria-hidden />
				</button>
			)}
		</span>
	);
}

export { Badge, badgeVariants };
export type { BadgeProps };
