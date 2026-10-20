import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SectionHeader({ id, title, description }: { id: string; title: string; description: string }) {
	return (
		<div id={id} className="scroll-mt-[calc(var(--navbar-h)+3rem)] space-y-2 mb-6">
			<div className="flex items-center gap-6">
				<div className="h-0.5 w-12 bg-primary/40 rounded-full" />
				<h2 className="text-2xl font-black tracking-tighter text-foreground whitespace-nowrap">{title}</h2>
				<div className="h-px flex-1 bg-gradient-to-r from-border/80 to-transparent" />
			</div>
			<p className="text-sm text-muted-foreground font-medium ml-[72px]">{description}</p>
		</div>
	);
}

export function Showcase({ children, className = "" }: { children: ReactNode; className?: string }) {
	return (
		<Card className={cn("mb-12", className)} padding="lg">
			{children}
		</Card>
	);
}

export function ShowcaseRow({ label, children, block = false }: { label: string; children: ReactNode; block?: boolean }) {
	return (
		<div className="space-y-3">
			<p className="text-xs font-medium text-muted-foreground">{label}</p>
			{block ? (
				<div className="space-y-4">{children}</div>
			) : (
				<div className="flex flex-wrap items-center gap-3">{children}</div>
			)}
		</div>
	);
}
