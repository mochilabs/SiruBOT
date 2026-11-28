import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const statusSecondaryActionClass =
	"group flex h-11 items-center gap-1.5 rounded-control px-4 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface StatusScreenProps {
	title: string;
	description: ReactNode;
	meta?: ReactNode;
	actions?: ReactNode;
	illustration?: ReactNode;
	inline?: boolean;
	className?: string;
}

export function StatusScreen({ title, description, meta, actions, illustration, inline, className }: StatusScreenProps) {
	const Root = inline ? "section" : "main";
	return (
		<Root
			className={cn(
				"mx-auto grid w-full max-w-7xl items-center gap-10 px-4 sm:px-6 md:gap-12 lg:gap-16 lg:px-8",
				illustration && "md:grid-cols-2",
				inline ? "py-10" : "min-h-[calc(100svh-var(--navbar-h))] py-12",
				className
			)}
		>
			<div className="flex max-w-2xl flex-col items-start gap-8">
				<div className="space-y-3">
					<h1 className="break-keep text-4xl font-extrabold tracking-tighter text-foreground sm:text-5xl">{title}</h1>
					<div className="max-w-md break-keep text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">{description}</div>
					{meta}
				</div>
				{actions && <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">{actions}</div>}
			</div>
			{illustration && <div className="mx-auto w-full max-w-sm md:max-w-none">{illustration}</div>}
		</Root>
	);
}
