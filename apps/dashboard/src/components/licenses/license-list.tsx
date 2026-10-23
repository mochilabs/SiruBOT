"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface LicenseEntry {
	name: string;
	license: string;
	group: string;
	url: string | null;
}

interface LicenseListProps {
	entries: LicenseEntry[];
	summary: Array<{ license: string; count: number }>;
	total: number;
}

const rowClass =
	"flex min-w-0 items-center gap-2 rounded-control bg-surface-2 px-3 py-1.5 text-sm";

/** 검색으로 패키지를 거르고, 라이선스별 그룹으로 고지해요 — 데이터는 스크립트로 생성돼요(커밋된 JSON). */
export function LicenseList({ entries, summary, total }: LicenseListProps) {
	const [query, setQuery] = useState("");
	const trimmed = query.trim().toLowerCase();

	const filtered = useMemo(() => {
		if (!trimmed) return entries;
		return entries.filter(
			(entry) =>
				entry.name.toLowerCase().includes(trimmed) ||
				entry.license.toLowerCase().includes(trimmed),
		);
	}, [entries, trimmed]);

	const groups = useMemo(() => {
		const byGroup = new Map<string, LicenseEntry[]>();
		for (const entry of filtered) {
			if (!byGroup.has(entry.group)) byGroup.set(entry.group, []);
			byGroup.get(entry.group)!.push(entry);
		}
		// summary는 카운트 내림차순으로 정렬돼 있어요 — 큰 그룹(MIT 등)이 위에 와요.
		return summary
			.map(({ license }) => ({ license, items: byGroup.get(license) ?? [] }))
			.filter((group) => group.items.length > 0);
	}, [filtered, summary]);

	return (
		<Card padding="lg" className="gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="text-base font-black tracking-tight text-foreground">
					코드 의존성 <span className="font-medium text-muted-foreground">총 {total.toLocaleString()}개</span>
				</h2>
				<span className="text-xs text-muted-foreground">직접 · 전이 의존성 전체 고지예요</span>
			</div>

			<form onSubmit={(event) => event.preventDefault()}>
				<Input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="패키지 이름 · 라이선스"
					aria-label="패키지 검색"
				/>
			</form>

			{groups.length === 0 ? (
				<EmptyState
					size="sm"
					title="일치하는 패키지가 없어요."
					description="검색어를 비우거나 다른 검색어로 시도해 주세요."
				/>
			) : (
				<div className="space-y-2">
					{groups.map(({ license, items }) => (
						// 검색 중엔 매칭 그룹을 펼쳐요(비어 있으면 기본 접힘 — 카운트만으로 훑을 수 있게)
						<details key={license} open={trimmed ? true : undefined} className="group rounded-card">
							<summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-bold text-foreground hover:bg-surface-2 transition-colors duration-fast">
								<span className="min-w-0 truncate">{license}</span>
								<Badge size="sm" variant="default">
									{items.length.toLocaleString()}개
								</Badge>
							</summary>
							<ol className="space-y-1 px-3 pb-3 pt-2">
								{items.map((entry) => (
									<li key={entry.name} className={rowClass}>
										<span className="min-w-0 flex-1 truncate">
											<span className="truncate font-semibold text-foreground">{entry.name}</span>
										</span>
										<span className="hidden max-w-56 truncate text-xs text-muted-foreground sm:block">{entry.license}</span>
										{entry.url && (
											<a
												href={entry.url}
												target="_blank"
												rel="noopener noreferrer"
												aria-label={`${entry.name} 원본 저장소`}
												// 아이콘(13px)만으로는 터치하기 어려워 after로 44px 히트 영역을 넓혀요(배지 dismiss와 같은 방식).
												className="relative shrink-0 text-muted-foreground transition-colors duration-fast hover:text-primary-text after:absolute after:inset-[min(0px,calc((100%-44px)/2))]"
											>
												<ExternalLink size={13} aria-hidden />
											</a>
										)}
									</li>
								))}
							</ol>
						</details>
					))}
				</div>
			)}
		</Card>
	);
}
