"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
}

function ScrollArea({ className, children, ...props }: ScrollAreaProps) {
	return (
		<div
			data-slot="scroll-area"
			className={cn("relative overflow-auto", className)}
			{...props}
		>
			{children}
		</div>
	);
}

export { ScrollArea };
