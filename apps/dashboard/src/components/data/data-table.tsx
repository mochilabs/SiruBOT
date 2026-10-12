"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp, PackageOpen } from "lucide-react";

import { ErrorPanel } from "@/components/error-panel";
import { EmptyState } from "@/components/primitives/empty-state";
import { Card } from "@/components/ui/card";
import { SkeletonLine } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface Column<T> {
	key: string;
	header: string;
	render?: (row: T, index: number) => React.ReactNode;
	sortable?: boolean;
	width?: string;
	align?: "left" | "center" | "right";
}

type SortDir = "asc" | "desc" | null;

export interface DataTableProps<T> {
	columns: Column<T>[];
	data: T[];
	keyExtractor: (row: T) => string;
	loading?: boolean;
	loadingRows?: number;
	error?: string;
	onRetry?: () => void;
	emptyIcon?: React.ComponentType<{ className?: string }>;
	emptyMessage?: string;
	emptyDescription?: string;
	stickyHeader?: boolean;
	onRowClick?: (row: T) => void;
	className?: string;
}

export function DataTable<T>({
	columns,
	data,
	keyExtractor,
	loading = false,
	loadingRows = 5,
	error,
	onRetry,
	emptyIcon = PackageOpen,
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

	if (error) {
		// 에러 피드백은 ErrorPanel로 통일 (EmptyState·ErrorPanel과 같은 형태 언어)
		return <ErrorPanel title="오류가 발생했어요" message={error} onRetry={onRetry} className={className} />;
	}

	if (!loading && data.length === 0) {
		return <EmptyState icon={emptyIcon} title={emptyMessage} description={emptyDescription} className={className} />;
	}

	return (
		<Card className={cn("overflow-hidden rounded-card border-0 bg-surface-1 p-0 ring-0", className)}>
			<Table>
				<TableHeader>
					<TableRow
						className={cn(
							// 헤더-본문 구분선 — 행과 같은 border-border-subtle 톤 (border-0으로 지우면 카드 안에서 경계가 사라져요)
							"hover:bg-transparent",
							stickyHeader && "sticky top-0 z-10",
						)}
					>
						{columns.map((col) => {
							const isSorted = sortKey === col.key;
							const ariaSort = isSorted
								? sortDir === "asc"
									? ("ascending" as const)
									: ("descending" as const)
								: undefined;

							return (
								<TableHead
									key={col.key}
									scope="col"
									aria-sort={ariaSort}
									style={col.width ? { width: col.width } : undefined}
									className={cn(
										"px-5 py-3.5 text-xs font-black text-muted-foreground",
										alignClass(col.align),
										col.sortable && "cursor-pointer select-none hover:text-foreground transition-colors",
										stickyHeader && "bg-surface-2",
									)}
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
								</TableHead>
							);
						})}
					</TableRow>
				</TableHeader>

				<TableBody>
					{loading
						? Array.from({ length: loadingRows }, (_, i) => (
								<TableRow key={`skel-${i}`}>
									{columns.map((col) => (
										<TableCell key={col.key} className="px-5 py-3.5">
											<SkeletonLine
												width={col.key === columns[0].key ? "70%" : "50%"}
												height="h-4"
											/>
										</TableCell>
									))}
								</TableRow>
							))
						: sorted.map((row, ri) => (
								<TableRow
									key={keyExtractor(row)}
									onClick={onRowClick ? () => onRowClick(row) : undefined}
									className={cn(onRowClick && "cursor-pointer")}
								>
									{columns.map((col) => (
										<TableCell
											key={col.key}
											className={cn(
												"px-5 py-3.5 text-sm font-medium text-foreground",
												alignClass(col.align),
											)}
										>
											{col.render
												? col.render(row, ri)
												: String((row as Record<string, unknown>)[col.key] ?? "")}
										</TableCell>
									))}
								</TableRow>
							))}
				</TableBody>
			</Table>
		</Card>
	);
}
