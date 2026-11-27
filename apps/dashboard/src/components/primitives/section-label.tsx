import { cn } from "@/lib/utils";

interface SectionLabelProps {
	children: React.ReactNode;
	as?: "div" | "p" | "span";
	className?: string;
}

export function SectionLabel({ children, as: Tag = "div", className }: SectionLabelProps) {
	return <Tag className={cn("px-3 py-1.5 text-xs font-medium text-muted-foreground", className)}>{children}</Tag>;
}
