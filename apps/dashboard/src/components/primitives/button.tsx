"use client";

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/* ─────────────────────────── styles ─────────────────────────── */

const buttonVariants = cva(
	"relative inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors duration-fast cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 disabled:pointer-events-none pointer-coarse:min-h-11",
	{
		variants: {
			variant: {
				primary: "bg-primary text-primary-foreground hover:bg-primary/90",
				secondary: "border border-border-strong bg-surface-2 text-foreground hover:bg-surface-3",
				ghost: "text-foreground/75 hover:bg-foreground/5 hover:text-foreground",
				danger: "border border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15",
				icon: "border border-border bg-surface-2 text-foreground/70 hover:bg-surface-3 hover:text-foreground",
				"state-toggle": "border border-primary/20 bg-primary/10 text-primary-text hover:bg-primary/20 data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground",
				cta: "bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90",
			},
			size: {
				sm: "h-8 px-3 text-sm",
				md: "h-9 px-4 text-sm",
				lg: "h-10 px-5 text-sm",
			},
		},
		compoundVariants: [
			{ variant: "icon", size: "sm", class: "w-8 px-0 pointer-coarse:w-11" },
			{ variant: "icon", size: "md", class: "w-9 px-0 pointer-coarse:w-11" },
			{ variant: "icon", size: "lg", class: "w-10 px-0 pointer-coarse:w-11" },
		],
		defaultVariants: { variant: "primary", size: "md" },
	},
);

/* ─────────────────────────── types ─────────────────────────── */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
	loading?: boolean;
	active?: boolean;
	icon?: React.ReactNode;
	children?: React.ReactNode;
}

/* ─────────────────────────── component ─────────────────────────── */

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ variant = "primary", size = "md", loading = false, active = false, icon, children, className, disabled, type = "button", ...props },
	ref,
) {
	const isIcon = variant === "icon";

	return (
		<button
			ref={ref}
			type={type}
			disabled={disabled || loading}
			data-active={active || undefined}
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		>
			{loading ? (
				<>
					<Loader2 className="h-4 w-4 animate-spin" aria-hidden />
					{!isIcon && children && <span className="opacity-70">{children}</span>}
				</>
			) : (
				<>
					{icon}
					{children}
				</>
			)}
		</button>
	);
});

export { buttonVariants };
