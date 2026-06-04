"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp, PackageOpen } from "lucide-react";

import { SkeletonLine } from "@/components/primitives/skeleton";

/* ─────────────────────────── types ─────────────────────────── */

export interface Column<T> {
	key: string;
	header: string;
	render?: (row: T, index: number) => React.ReactNode;
	sortable?: boolean;
	width?: string;
	align?: "left" | "center" | "right";
}

type SortDir = "asc" | "desc" | null;

interface DataTableProps<T> {
	columns: Column<T>[];
	data: T[];
	keyExtractor: (row: T) => string;
	loading?: boolean;
	loadingRows?: number;
	error?: string;
	onRetry?: () => void;
	emptyIcon?: React.ReactNode;
	emptyMessage?: string;
	emptyDescription?: string;
	stickyHeader?: boolean;
	onRowClick?: (row: T) => void;
	className?: string;
}

/* ─────────────────────────── component ─────────────────────────── */

export function DataTable<T>({
	columns,
	data,
	keyExtractor,
	loading = false,
	loadingRows = 5,
	error,
	onRetry,
	emptyIcon,
	emptyMessage = "데이터가 없어요",
	emptyDescription,
	stickyHeader = true,
	onRowClick,
	className = "",
}: DataTableProps<T>) {
	const [sortKey, setSortKey] = useState<string | null>(null);
	const [sortDir, setSortDir] = useState<SortDir>(null);

	const handleSort = useCallback(
		(key: string) => {
			if (sortKey === key) {
				if (sortDir === "asc") setSortDir("desc");
				else if (sortDir === "desc") {
					setSortKey(null);
					setSortDir(null);
				}
			} else {
				setSortKey(key);
				setSortDir("asc");
			}
		},
		[sortKey, sortDir],
	);

	const sorted = useMemo(() => {
		if (!sortKey || !sortDir) return data;
		return [...data].sort((a, b) => {
			const aVal = (a as Record<string, unknown>)[sortKey];
			const bVal = (b as Record<string, unknown>)[sortKey];
			if (aVal == null || bVal == null) return 0;
			const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
			return sortDir === "asc" ? cmp : -cmp;
		});
	}, [data, sortKey, sortDir]);

	const alignClass = (align?: string) => {
		if (align === "center") return "text-center";
		if (align === "right") return "text-right";
		return "text-left";
	};

	/* ─── Error state ─── */
	if (error) {
		return (
			<div className={`glass-panel p-12 text-center border-red-500/20 ${className}`}>
				<p className="text-lg font-black tracking-tighter text-foreground mb-2">
					오류가 발생했어요
				</p>
				<p className="text-sm text-muted-foreground mb-6">{error}</p>
				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						className="px-5 py-2 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-sm font-bold transition-colors cursor-pointer"
					>
						다시 시도
					</button>
				)}
			</div>
		);
	}

	/* ─── Empty state ─── */
	if (!loading && data.length === 0) {
		return (
			<div className={`glass-panel p-20 text-center border-dashed border-border/80 bg-muted/5 group ${className}`}>
				<div className="mx-auto mb-6 w-16 h-16 rounded-3xl bg-muted flex items-center justify-center border border-border group-hover:scale-110 transition-transform duration-500">
					{emptyIcon ?? <PackageOpen size={32} className="text-muted-foreground" />}
				</div>
				<p className="text-2xl font-black tracking-tight text-muted-foreground">
					{emptyMessage}
				</p>
				{emptyDescription && (
					<p className="mt-2 text-muted-foreground/60 font-medium">
						{emptyDescription}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className={`glass-panel overflow-hidden ${className}`}>
			<div className="overflow-x-auto">
				<table className="w-full border-collapse">
					{/* Header */}
					<thead>
						<tr
							className={
								stickyHeader
									? "sticky top-0 z-10 bg-card/95 backdrop-blur-md"
									: ""
							}
						>
							{columns.map((col) => {
								const isSorted = sortKey === col.key;
								const ariaSort = isSorted
									? sortDir === "asc"
										? ("ascending" as const)
										: ("descending" as const)
									: undefined;

								return (
									<th
										key={col.key}
										scope="col"
										aria-sort={ariaSort}
										style={col.width ? { width: col.width } : undefined}
										className={`
											px-5 py-3.5 text-xs font-black uppercase tracking-[0.15em] text-muted-foreground/50 border-b border-border/40
											${alignClass(col.align)}
											${col.sortable ? "cursor-pointer select-none hover:text-foreground transition-colors" : ""}
										`}
										onClick={col.sortable ? () => handleSort(col.key) : undefined}
									>
										<span className="inline-flex items-center gap-1.5">
											{col.header}
											{col.sortable && (
												<span className="inline-flex flex-col">
													{isSorted ? (
														sortDir === "asc" ? (
															<ChevronUp className="h-3 w-3" />
														) : (
															<ChevronDown className="h-3 w-3" />
														)
													) : (
														<ChevronsUpDown className="h-3 w-3 opacity-30" />
													)}
												</span>
											)}
										</span>
									</th>
								);
							})}
						</tr>
					</thead>

					{/* Body */}
					<tbody>
						{loading
							? Array.from({ length: loadingRows }, (_, i) => (
									<tr key={`skel-${i}`}>
										{columns.map((col) => (
											<td key={col.key} className="px-5 py-3.5">
												<SkeletonLine
													width={col.key === columns[0].key ? "70%" : "50%"}
													height="h-4"
												/>
											</td>
										))}
									</tr>
								))
							: sorted.map((row, ri) => (
									<tr
										key={keyExtractor(row)}
										onClick={onRowClick ? () => onRowClick(row) : undefined}
										className={`
											border-b border-border/20 last:border-b-0 transition-colors
											${onRowClick ? "cursor-pointer" : ""}
											hover:bg-accent/30
										`}
									>
										{columns.map((col) => (
											<td
												key={col.key}
												className={`px-5 py-3.5 text-sm font-medium text-foreground ${alignClass(col.align)}`}
											>
												{col.render
													? col.render(row, ri)
													: String((row as Record<string, unknown>)[col.key] ?? "")}
											</td>
										))}
									</tr>
								))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
