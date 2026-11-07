"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

import { SidebarIndicatorOverlay, useSidebarIndicator } from "@/components/primitives/sidebar-indicator";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ServerFeatureItem {
	key: string;
	label: string;
	icon?: React.ReactNode;
	/** 같은 group이 이어지면 접을 수 있는 폴더로 묶여요 */
	group?: string;
}

interface ServerFeatureSidebarProps {
	items: readonly ServerFeatureItem[];
	active: string;
	onSelect: (key: string) => void;
	groupLabels?: Readonly<Record<string, string>>;
}

/**
 * PC(lg+) 전용 기능 사이드바 — 플레이리스트 사이드바와 같은 "카드 + 목록" 언어를 써서
 * 대시보드 안에서 새 패턴을 만들지 않아요. 그룹은 모두 펼쳐진 채 시작하고, 길면 폴더처럼 접을 수 있어요(보는 기능의
 * 그룹은 다른 경로로 이동해도 다시 펼쳐져요). 활성 항목은 spring 인디케이터로 표시해요.
 */
export function ServerFeatureSidebar({ items, active, onSelect, groupLabels }: ServerFeatureSidebarProps) {
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const activeGroup = items.find((item) => item.key === active)?.group;
	const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set(items.flatMap((item) => (item.group ? [item.group] : []))));

	// 다른 경로(모바일 내비, URL)로 활성 기능이 바뀌어도 그 그룹은 펼쳐 둬요
	useEffect(() => {
		if (!activeGroup) return;
		setOpenGroups((prev) => (prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)));
	}, [activeGroup]);

	const toggleGroup = (group: string) =>
		setOpenGroups((prev) => {
			const next = new Set(prev);
			if (next.has(group)) next.delete(group);
			else next.add(group);
			return next;
		});

	// 접힌 그룹의 항목은 렌더하지 않으므로 인디케이터는 보이는 항목 목록 기준으로 계산해요
	const visible = useMemo(() => items.filter((item) => !item.group || openGroups.has(item.group)), [items, openGroups]);
	const activeIndex = visible.findIndex((item) => item.key === active);
	const getItemEl = useCallback((index: number) => itemRefs.current[index], []);
	const indicator = useSidebarIndicator(visible, activeIndex, getItemEl);

	const refIndexByKey = new Map(visible.map((item, index) => [item.key, index]));

	return (
		<nav className="hidden w-full lg:block lg:w-72 shrink-0 lg:sticky lg:top-20 lg:z-10" aria-label="서버 설정 기능">
			<Card padding="none" className="overflow-hidden">
				<div className="relative flex max-h-[calc(100svh-7rem)] flex-col gap-0.5 overflow-y-auto p-2">
					<SidebarIndicatorOverlay indicator={indicator} />

					{items.map((item, idx) => {
						const startsGroup = item.group && item.group !== items[idx - 1]?.group;
						const isOpen = !item.group || openGroups.has(item.group);
						const header = startsGroup && item.group ? (
							<button
								type="button"
								aria-expanded={isOpen}
								onClick={() => toggleGroup(item.group as string)}
								className={cn(
									"relative z-10 flex w-full items-center gap-2 rounded-menu px-3.5 py-2.5 text-left text-sm font-bold text-foreground transition-colors duration-fast hover:bg-accent/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
								)}
							>
								<ChevronRight size={14} aria-hidden className={cn("shrink-0 text-muted-foreground transition-transform duration-fast", isOpen && "rotate-90")} />
								<span>{groupLabels?.[item.group] ?? item.group}</span>
								{!isOpen && item.group === activeGroup && (
									<span className="ml-auto truncate text-xs font-semibold text-primary-text">{items.find((entry) => entry.key === active)?.label}</span>
								)}
							</button>
						) : null;

						if (!isOpen) return <Fragment key={item.key}>{header}</Fragment>;

						const refIndex = refIndexByKey.get(item.key) ?? 0;
						const isActive = item.key === active;
						return (
							<Fragment key={item.key}>
								{header}
								<button
									type="button"
									ref={(el) => {
										itemRefs.current[refIndex] = el;
									}}
									onClick={() => onSelect(item.key)}
									aria-current={isActive ? "true" : undefined}
									className={cn(
										"relative z-10 flex w-full items-center gap-3 rounded-menu border-0 px-3.5 py-2.5 text-left text-sm transition-colors duration-fast focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
										item.group && "ml-2 w-[calc(100%-0.5rem)]",
										isActive ? "font-extrabold text-primary-text" : "font-medium text-foreground/70 hover:bg-accent/15 hover:text-foreground",
									)}
								>
									<span aria-hidden className={cn("shrink-0 transition-colors duration-fast", isActive ? "text-primary-text" : "text-muted-foreground")}>
										{item.icon}
									</span>
									<span className="truncate">{item.label}</span>
								</button>
							</Fragment>
						);
					})}
				</div>
			</Card>
		</nav>
	);
}
