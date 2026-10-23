"use client";

import { forwardRef } from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-control border-0 text-sm font-medium whitespace-nowrap transition-control duration-fast outline-none select-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				// 별칭 계약: default와 primary는 같은 클래스를 가리키는 공개 API 별칭이에요(호출부 혼용 유지).
				default: "bg-primary text-primary-foreground hover:bg-primary/70",
				primary: "bg-primary text-primary-foreground hover:bg-primary/70",
				// secondary fill alone is too subtle against cards, so an inset
				// boundary is used. This keeps the surface visually light while
				// meeting SC 1.4.11 (3:1 non-text contrast).
				secondary: "bg-secondary text-secondary-foreground shadow-control-boundary hover:bg-surface-3",
				ghost: "text-foreground/75 hover:bg-foreground/5 hover:text-foreground",
				// 별칭 계약: danger와 destructive도 같은 클래스를 가리키는 공개 API 별칭이에요(호출부 혼용 유지).
				danger: "bg-destructive/10 text-destructive hover:bg-destructive/15",
				icon: "bg-secondary text-secondary-foreground shadow-control-boundary hover:bg-surface-3 hover:text-foreground",
				// "on" 상태는 브랜드 핑크(primary-control) 채움 + 마룬 텍스트 (4.75:1)
				"state-toggle":
					"bg-primary/10 text-primary-text hover:bg-primary/20 data-[active=true]:bg-primary-control data-[active=true]:text-primary-control-text",
				cta: "bg-primary-control font-semibold text-primary-control-text shadow-sm hover:bg-primary-control-hover",
				destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15",
				outline:
					"border border-border-strong bg-outline-fill hover:bg-outline-fill-hover hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
				link: "text-primary-text underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4",
				sm: "h-8 px-3 text-sm",
				md: "h-9 px-4 text-sm",
				lg: "h-10 px-5 text-sm",
				xs: "h-6 gap-1 rounded-control px-2 text-xs",
				icon: "size-9 px-0",
				"icon-xs": "size-6 rounded-control px-0 [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-7 rounded-control px-0",
				"icon-lg": "size-10 px-0",
			},
		},
		compoundVariants: [
			{ variant: "icon", size: "sm", class: "w-8 px-0" },
			{ variant: "icon", size: "md", class: "w-9 px-0" },
			{ variant: "icon", size: "lg", class: "w-10 px-0" },
		],
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

interface ButtonProps extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
	loading?: boolean;
	active?: boolean;
	icon?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ className, variant = "default", size = "default", loading = false, active = false, icon, children, disabled, type = "button", ...props },
	ref,
) {
	const isIconVariant = variant === "icon";

	return (
		<ButtonPrimitive
			ref={ref}
			type={type}
			data-slot="button"
			data-active={active || undefined}
			className={cn(buttonVariants({ variant, size, className }))}
			disabled={disabled || loading}
			{...props}
		>
			{loading ? (
				<>
					<Loader2 className="h-4 w-4 animate-spin" aria-hidden />
					{!isIconVariant && children && <span className="opacity-70">{children}</span>}
				</>
			) : (
				<>
					{icon}
					{children}
				</>
			)}
		</ButtonPrimitive>
	);
});

export { Button, buttonVariants };
export type { ButtonProps };
