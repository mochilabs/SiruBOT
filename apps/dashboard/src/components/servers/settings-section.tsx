"use client";

import { type ReactNode, useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface SettingsSectionProps {
	title: string;
	/** 접힌 상태에서도 읽히는 현재값 요약 한 줄 */
	summary?: ReactNode;
	defaultOpen?: boolean;
	children: ReactNode;
}

/**
 * 설정 패널 안의 접이식 구획 — 카드를 또 만들지 않고 구분선 + 한 줄 헤더로 나눠요.
 * 접어도 본문은 마운트된 채 숨기기만 해서(hidden) 폼 상태·SaveBar 동작이 그대로예요.
 */
export function SettingsSection({ title, summary, defaultOpen = false, children }: SettingsSectionProps) {
	const [open, setOpen] = useState(defaultOpen);
	const bodyId = useId();

	return (
		<section className="border-t border-border first:border-t-0">
			<h3>
				<button
					type="button"
					aria-expanded={open}
					aria-controls={bodyId}
					onClick={() => setOpen((prev) => !prev)}
					className="group flex min-h-12 w-full items-center gap-3 rounded-control py-3 text-left transition-colors duration-fast focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
				>
					<span className="shrink-0 text-sm font-bold text-foreground">{title}</span>
					{summary && <span className="min-w-0 flex-1 truncate text-right text-xs font-medium text-muted-foreground sm:text-sm">{summary}</span>}
					{!summary && <span className="flex-1" />}
					<ChevronDown
						size={16}
						aria-hidden
						className={cn("shrink-0 text-muted-foreground transition-transform duration-fast group-hover:text-foreground", open && "rotate-180")}
					/>
				</button>
			</h3>
			<div id={bodyId} hidden={!open} className="space-y-5 pb-5">
				{children}
			</div>
		</section>
	);
}

/** 켜기/끄기 한 줄 — 제목과 설명은 왼쪽, 스위치는 오른쪽 */
export function SettingsToggleRow({ title, description, control, extra }: { title: string; description?: ReactNode; control: ReactNode; extra?: ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="min-w-0 space-y-0.5">
				<p className="flex items-center gap-2 text-sm font-semibold text-foreground">
					{title}
					{extra}
				</p>
				{description && <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>}
			</div>
			<div className="shrink-0 pt-0.5">{control}</div>
		</div>
	);
}
