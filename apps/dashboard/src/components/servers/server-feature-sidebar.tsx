"use client";

import { useCallback, useRef } from "react";

import { SidebarIndicatorOverlay, useSidebarIndicator } from "@/components/primitives/sidebar-indicator";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ServerFeatureItem {
	key: string;
	label: string;
	icon?: React.ReactNode;
}

interface ServerFeatureSidebarProps {
	items: readonly ServerFeatureItem[];
	active: string;
	onSelect: (key: string) => void;
}

/**
 * PC(lg+) 전용 기능 사이드바 — 플레이리스트 사이드바와 같은 "카드 + 목록" 언어를 써서
 * 대시보드 안에서 새 패턴을 만들지 않아요. 활성 항목은 spring 인디케이터로 표시해
 * 지금 어느 기능을 보고 있는지 한눈에 읽히게 해요.
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
						const isActive = item.key === active;
						return (
							<button
								key={item.key}
								type="button"
								ref={(el) => {
									itemRefs.current[idx] = el;
								}}
								onClick={() => onSelect(item.key)}
								aria-current={isActive ? "true" : undefined}
								className={cn(
									"relative z-10 flex w-full items-center gap-2.5 rounded-menu border-0 px-3 py-2.5 text-left text-sm transition-colors duration-fast focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40",
									isActive
										? "font-bold text-primary-text"
										: "font-medium text-muted-foreground hover:bg-accent/10 hover:text-foreground",
								)}
							>
								<span aria-hidden className={isActive ? "text-primary-text" : "text-muted-foreground"}>
									{item.icon}
								</span>
								<span className="truncate">{item.label}</span>
							</button>
						);
					})}
				</div>
			</Card>
		</nav>
	);
}
