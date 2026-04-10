"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
	currentPage: number;
	totalPages: number;
	basePath: string;
}

export function Pagination({ currentPage, totalPages, basePath }: PaginationProps) {
	const searchParams = useSearchParams();

	if (totalPages <= 1) return null;

	const prevPage = Math.max(1, currentPage - 1);
	const nextPage = Math.min(totalPages, currentPage + 1);

	const createPageUrl = (pageNumber: number) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("page", pageNumber.toString());
		return `${basePath}?${params.toString()}`;
	};

	return (
		<div className="mt-6 flex items-center justify-between gap-3">
			<Link
				href={createPageUrl(prevPage)}
				aria-disabled={currentPage <= 1}
				tabIndex={currentPage <= 1 ? -1 : undefined}
				className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm transition-colors ${
					currentPage <= 1
						? "pointer-events-none border border-border/30 text-muted-foreground/50"
						: "hover:bg-primary/10 hover:text-primary border border-border/50 bg-background/50"
				}`}
			>
				<ChevronLeft className="h-4 w-4" />
				이전
			</Link>

			<p className="text-sm text-muted-foreground/80 font-medium">
				페이지 {currentPage} / {totalPages}
			</p>

			<Link
				href={createPageUrl(nextPage)}
				aria-disabled={currentPage >= totalPages}
				tabIndex={currentPage >= totalPages ? -1 : undefined}
				className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm transition-colors ${
					currentPage >= totalPages
						? "pointer-events-none border border-border/30 text-muted-foreground/50"
						: "hover:bg-primary/10 hover:text-primary border border-border/50 bg-background/50"
				}`}
			>
				다음
				<ChevronRight className="h-4 w-4" />
			</Link>
		</div>
	);
}

