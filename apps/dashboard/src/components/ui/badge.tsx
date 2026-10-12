"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex select-none items-center justify-center gap-1.5 rounded-full border-0 px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3",
	{
		variants: {
			variant: {
				default: "bg-surface-2 text-foreground/80",
				primary: "bg-primary/10 text-primary-text",
				success: "bg-success/10 text-success",
				warning: "bg-warning/10 text-warning",
				danger: "bg-destructive/10 text-destructive",
				destructive: "bg-destructive/10 text-destructive",
				info: "bg-info/10 text-info",
				discord: "bg-discord-primary/10 text-discord-primary",
				secondary: "bg-secondary text-secondary-foreground",
				outline: "border border-border bg-background text-foreground",
				ghost: "hover:bg-muted hover:text-muted-foreground",
				link: "text-primary-text underline-offset-4 hover:underline",
			},
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
	default: "bg-muted-foreground",
	primary: "bg-primary-control",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-destructive",
	destructive: "bg-destructive",
	info: "bg-info",
	discord: "bg-discord-primary",
	secondary: "bg-secondary",
	outline: "bg-muted-foreground",
	ghost: "bg-muted-foreground",
	link: "bg-primary-text",
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
					className="relative -mr-0.5 ml-0.5 inline-flex cursor-pointer items-center justify-center rounded-full p-0.5 transition-colors hover:bg-foreground/10 after:absolute after:inset-[min(0px,calc((100%-44px)/2))]"
				>
					<X className="h-3 w-3" aria-hidden />
				</button>
			)}
		</span>
	);
}

export { Badge, badgeVariants };
export type { BadgeProps };
