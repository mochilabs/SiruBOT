import { cva, type VariantProps } from "class-variance-authority";

/** "use client" 없는 서버 세이프 모듈 — 서버 컴포넌트에서도 import 가능하다. */
export const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-control border-0 text-sm font-medium whitespace-nowrap transition-control duration-fast outline-none select-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/70",
				primary: "bg-primary text-primary-foreground hover:bg-primary/70",
				secondary: "bg-secondary text-secondary-foreground shadow-control-boundary hover:bg-surface-3",
				ghost: "text-foreground/75 hover:bg-foreground/5 hover:text-foreground",
				danger: "bg-destructive/10 text-destructive hover:bg-destructive/15",
				icon: "bg-secondary text-secondary-foreground shadow-control-boundary hover:bg-surface-3 hover:text-foreground",
				"state-toggle":
					"bg-primary/10 text-primary-text hover:bg-primary/20 data-[active=true]:bg-primary-control data-[active=true]:text-primary-control-text",
				cta: "bg-primary-control font-semibold text-primary-control-text shadow-sm hover:bg-primary-control-hover",
				destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15",
				outline:
					"border border-border-strong bg-outline-fill hover:bg-outline-fill-hover hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
				link: "text-primary-text underline-offset-4 hover:underline active:scale-100",
			},
			size: {
				default: "h-10 px-4.5 max-sm:h-11",
				sm: "h-9 px-3.5 text-sm",
				md: "h-10 px-4.5 text-sm max-sm:h-11",
				lg: "h-11 px-5.5 text-sm",
				xl: "h-12 px-6 text-base font-bold",
				xs: "h-7 gap-1 rounded-control-inner px-2.5 text-xs",
				icon: "size-10 px-0 max-sm:size-11",
				"icon-xs": "size-7 rounded-control-inner px-0 [&_svg:not([class*='size-'])]:size-3.5",
				"icon-sm": "size-8 px-0",
				"icon-lg": "size-11 px-0",
			},
		},
		compoundVariants: [
			{ variant: "icon", size: "sm", class: "w-9 px-0" },
			{ variant: "icon", size: "md", class: "w-10 px-0 max-sm:w-11" },
			{ variant: "icon", size: "lg", class: "w-11 px-0" },
		],
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;