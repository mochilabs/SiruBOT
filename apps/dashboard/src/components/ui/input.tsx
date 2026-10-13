import * as React from "react";
import { forwardRef } from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

const Input = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function Input({ className, type, ...props }, ref) {
	return (
		<InputPrimitive
			ref={ref}
			type={type}
			data-slot="input"
			className={cn(
				"h-9 w-full min-w-0 rounded-control border-0 bg-input px-3 py-1 text-sm text-foreground shadow-control-boundary transition-control duration-fast outline-none",
				"file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
				"placeholder:text-muted-foreground",
				"focus-visible:ring-2 focus-visible:ring-ring",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:shadow-control-boundary-invalid aria-invalid:focus-visible:ring-destructive",
				className,
			)}
			{...props}
		/>
	);
});

export { Input };
