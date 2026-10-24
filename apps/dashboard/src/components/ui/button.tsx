"use client";

import { forwardRef } from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { Loader2 } from "lucide-react";

import { type ButtonVariantProps,buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonPrimitive.Props, ButtonVariantProps {
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
