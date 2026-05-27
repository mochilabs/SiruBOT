"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

/* ─────────────────────────── types ─────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "icon" | "state-toggle" | "cta";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
	active?: boolean;
	icon?: React.ReactNode;
	children?: React.ReactNode;
}

/* ─────────────────────────── styles ─────────────────────────── */

const baseClasses =
	"relative inline-flex items-center justify-center gap-2 font-bold transition-all duration-300 cursor-pointer select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const variantClasses: Record<ButtonVariant, string> = {
	primary:
		"bg-primary text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90 hover:shadow-primary/25 hover:scale-[1.02] active:scale-[0.98]",
	secondary:
		"glass-overlay text-foreground hover:bg-foreground/5 hover:scale-[1.02] active:scale-[0.98]",
	ghost:
		"bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20",
	danger:
		"bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20",
	icon:
		"glass-overlay text-foreground/70 hover:text-primary hover:border-primary/30",
	"state-toggle":
		"bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-white",
	cta:
		"bg-gradient-to-r from-primary to-secondary text-white shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] overflow-hidden",
};

const activeVariantOverrides: Partial<Record<ButtonVariant, string>> = {
	"state-toggle": "bg-primary text-white border-primary shadow-lg shadow-primary/20",
};

const sizeClasses: Record<ButtonSize, string> = {
	sm: "h-9 px-3 text-sm rounded-xl",
	md: "h-11 px-5 text-sm rounded-2xl",
	lg: "h-14 px-8 text-base rounded-2xl",
};

const iconSizeClasses: Record<ButtonSize, string> = {
	sm: "h-9 w-9 rounded-xl",
	md: "h-11 w-11 rounded-xl",
	lg: "h-14 w-14 rounded-2xl",
};

/* ─────────────────────────── component ─────────────────────────── */

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{
		variant = "primary",
		size = "md",
		loading = false,
		active = false,
		icon,
		children,
		className = "",
		disabled,
		...props
	},
	ref,
) {
	const isIcon = variant === "icon";
	const sizeClass = isIcon ? iconSizeClasses[size] : sizeClasses[size];
	const variantClass = active && activeVariantOverrides[variant]
		? activeVariantOverrides[variant]
		: variantClasses[variant];

	return (
		<button
			ref={ref}
			disabled={disabled || loading}
			className={`${baseClasses} ${variantClass} ${sizeClass} ${className}`}
			{...props}
		>
			{/* Shimmer sweep on CTA only */}
			{variant === "cta" && !disabled && !loading && (
				<span
					aria-hidden
					className="pointer-events-none absolute inset-0 animate-shimmer-sweep"
				>
					<span className="block h-full w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
				</span>
			)}

			{loading ? (
				<>
					<Loader2 className="h-4 w-4 animate-spin" />
					{!isIcon && children && (
						<span className="opacity-70">{children}</span>
					)}
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
