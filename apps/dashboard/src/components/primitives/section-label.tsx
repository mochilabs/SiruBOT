import { cn } from "@/lib/utils";

/* ─────────────────────────── types ─────────────────────────── */

interface SectionLabelProps {
	children: React.ReactNode;
	/** div(기본) 또는 p. 그룹 레이블은 보통 p. */
	as?: "div" | "p" | "span";
	className?: string;
}

/* ─────────────────────────── component ─────────────────────────── */

export function SectionLabel({ children, as: Tag = "div", className }: SectionLabelProps) {
	return <Tag className={cn("px-3 py-1.5 text-xs font-medium text-muted-foreground", className)}>{children}</Tag>;
}
