import * as React from "react";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const Textarea = forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(function Textarea({ className, ...props }, ref) {
	return (
		<textarea
			ref={ref}
			data-slot="textarea"
			className={cn(
				"flex field-sizing-content min-h-16 w-full rounded-control border-0 bg-input px-3 py-2 text-sm text-foreground shadow-control-boundary transition-control duration-fast outline-none",
				"placeholder:text-muted-foreground",
				"focus-visible:ring-2 focus-visible:ring-ring",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:shadow-control-boundary-invalid aria-invalid:focus-visible:ring-destructive",
				"resize-y leading-relaxed",
				className,
			)}
			{...props}
		/>
	);
});

export { Textarea };
