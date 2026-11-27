import React from "react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps {
	title: React.ReactNode;
	description?: React.ReactNode;
	children?: React.ReactNode;
	className?: string;
}

export function PageHeader({
	title,
	description,
	children,
	className = "",
}: PageHeaderProps) {
	return (
		<header className={cn("mb-8 flex flex-col lg:flex-row lg:items-end justify-between gap-4 sm:gap-6 relative", className)}>
			<div className="flex-1 min-w-0 max-w-full flex flex-col justify-center space-y-3">
				<div className="space-y-1">
					<h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tighter text-foreground break-keep break-words pb-1">
						{title}
					</h1>
					{description && (
						<div className="text-sm sm:text-base font-medium text-muted-foreground break-keep break-words">
							{description}
						</div>
					)}
				</div>
			</div>

			{children && (
				<div className="min-w-0 max-w-full w-full lg:w-auto flex flex-wrap items-center gap-2 lg:justify-end">
					{children}
				</div>
			)}
		</header>
	);
}
