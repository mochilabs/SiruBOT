"use client";

import { useId, useRef } from "react";

import { cn } from "@/lib/utils";

/* ─────────────────────────── types ─────────────────────────── */

export interface TabItem {
	key: string;
	label: React.ReactNode;
	icon?: React.ReactNode;
	badge?: React.ReactNode;
	disabled?: boolean;
}

interface TabsProps {
	items: TabItem[];
	value?: string;
	defaultValue?: string;
	onChange?: (key: string) => void;
	/** 활성 탭 패널 콘텐츠. 넘기면 role="tabpanel" 영역까지 자동 렌더링. */
	renderPanel?: (key: string) => React.ReactNode;
	className?: string;
	listClassName?: string;
	panelClassName?: string;
	"aria-label": string;
}

/* ─────────────────────────── component ─────────────────────────── */

export function Tabs({ items, value, defaultValue, onChange, renderPanel, className, listClassName, panelClassName, "aria-label": ariaLabel }: TabsProps) {
	const baseId = useId();
	const controlled = value !== undefined;
	const activeKey = controlled ? value : (defaultValue ?? items[0]?.key);
	const refs = useRef<Record<string, HTMLButtonElement | null>>({});

	/** roving tabindex + selection follows focus — 방향키 이동 시 포커스와 선택이 함께 움직여요 (controlled/비controlled 공통) */
	const focusKey = (key: string) => {
		refs.current[key]?.focus();
		onChange?.(key);
	};

	const move = (dir: 1 | -1 | "home" | "end") => {
		const enabled = items.filter((i) => !i.disabled);
		if (enabled.length === 0) return;
		if (dir === "home") return focusKey(enabled[0].key);
		if (dir === "end") return focusKey(enabled[enabled.length - 1].key);
		const idx = enabled.findIndex((i) => i.key === activeKey);
		focusKey(enabled[(idx + dir + enabled.length) % enabled.length].key);
	};

	const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
		switch (event.key) {
			case "ArrowRight":
				event.preventDefault();
				move(1);
				break;
			case "ArrowLeft":
				event.preventDefault();
				move(-1);
				break;
			case "Home":
				event.preventDefault();
				move("home");
				break;
			case "End":
				event.preventDefault();
				move("end");
				break;
		}
	};

	return (
		<div className={className}>
			<div role="tablist" aria-label={ariaLabel} className={cn("-mb-px flex items-center gap-1 overflow-x-auto border-b border-border", listClassName)}>
				{items.map((item) => {
					const selected = item.key === activeKey;
					return (
						<button
							key={item.key}
							type="button"
							role="tab"
							id={`${baseId}-tab-${item.key}`}
							aria-selected={selected}
							aria-controls={renderPanel ? `${baseId}-panel-${item.key}` : undefined}
							tabIndex={selected ? 0 : -1}
							disabled={item.disabled}
							ref={(node) => {
								refs.current[item.key] = node;
							}}
							onClick={() => onChange?.(item.key)}
							onKeyDown={onKeyDown}
							className={cn(
								"inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
								selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
								"disabled:pointer-events-none disabled:opacity-50",
							)}
						>
							{item.icon}
							{item.label}
							{item.badge}
						</button>
					);
				})}
			</div>
			{renderPanel && activeKey !== undefined && (
				<div role="tabpanel" id={`${baseId}-panel-${activeKey}`} aria-labelledby={`${baseId}-tab-${activeKey}`} tabIndex={0} className={cn("pt-4 focus-visible:outline-none", panelClassName)}>
					{renderPanel(activeKey)}
				</div>
			)}
		</div>
	);
}
