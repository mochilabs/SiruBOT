import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const cardVariants = cva("relative flex flex-col rounded-card border", {
	variants: {
		variant: {
			default: "bg-card border-border",
			muted: "bg-muted border-border/60",
			raised: "bg-card border-border shadow-sm",
			interactive: "bg-card border-border cursor-pointer hover:border-border-strong hover:bg-muted"
		},
		padding: {
			none: "",
			sm: "p-4",
			md: "p-5",
			lg: "p-6"
		}
	},
	defaultVariants: {
		variant: "default",
		padding: "md"
	}
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ variant, padding, className, ...props }: CardProps) {
	return <div data-slot="card" className={cn(cardVariants({ variant, padding }), "gap-4", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="card-header" className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="card-title" className={cn("text-base font-semibold leading-tight text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="card-content" className={cn("min-w-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="card-footer" className={cn("flex items-center gap-2", className)} {...props} />;
}
