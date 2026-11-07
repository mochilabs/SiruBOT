"use client";

import { Fragment, useCallback, useRef } from "react";

import { SidebarIndicatorOverlay, useSidebarIndicator } from "@/components/primitives/sidebar-indicator";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ServerFeatureItem {
	key: string;
	label: string;
	icon?: React.ReactNode;
	/** group이 바뀌는 지점에는 헤더 없이 얇은 구분선만 그려요 */
	group?: string;
}

interface ServerFeatureSidebarProps {
	items: readonly ServerFeatureItem[];
	active: string;
	onSelect: (key: string) => void;
}

/**
 * PC(lg+) 전용 기능 사이드바 — 플레이리스트 사이드바와 같은 "카드 + 목록" 언어를 써서
 * 대시보드 안에서 새 패턴을 만들지 않아요. 모든 메뉴를 평평하게 보여주고 그룹 경계만
 * 구분선으로 나눠요. 활성 항목은 spring 인디케이터로 표시해요.
 */
export function ServerFeatureSidebar({ items, active, onSelect }: ServerFeatureSidebarProps) {
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const activeIndex = items.findIndex((item) => item.key === active);
	const getItemEl = useCallback((index: number) => itemRefs.current[index], []);
	const indicator = useSidebarIndicator(items, activeIndex, getItemEl);

	return (
		<nav className="hidden w-full lg:block lg:w-72 shrink-0 lg:sticky lg:top-20 lg:z-10" aria-label="서버 설정 기능">
			<Card padding="none" className="overflow-hidden">
				<div className="relative flex max-h-[calc(100svh-7rem)] flex-col gap-0.5 overflow-y-auto p-2">
					<SidebarIndicatorOverlay indicator={indicator} />

					{items.map((item, idx) => {
						const startsGroup = idx !== 0 && item.group !== items[idx - 1]?.group;
						const isActive = item.key === active;
						return (
							<Fragment key={item.key}>
								{startsGroup && <div role="separator" className="mx-3 my-1 h-px bg-border" />}
								<button
									type="button"
									ref={(el) => {
										itemRefs.current[idx] = el;
									}}
									onClick={() => onSelect(item.key)}
									aria-current={isActive ? "true" : undefined}
									className={cn(
										"relative z-10 flex w-full items-center gap-3 rounded-menu border-0 px-3.5 py-2 text-left text-sm transition-colors duration-fast focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
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
