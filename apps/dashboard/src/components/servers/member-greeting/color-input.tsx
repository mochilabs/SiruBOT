"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
/** 카드 레이어 색 프리셋 — 렌더러에 넘기는 사용자 데이터(hex)지, UI 스타일이 아니에요 */
export const COLOR_PRESETS = ["#ffffff", "#2d1b1e", "#ff85c1", "#a3416f", "#ffe4f0"] as const;

/** 소그룹 단일 선택(radio) 공용 키보드 이동 — 라디오의 방향키 순환이에요 */
export function radioArrowKeyDown(
	items: readonly string[],
	current: string,
	onPick: (key: string) => void
): (event: React.KeyboardEvent) => void {
	return (event) => {
		const index = items.indexOf(current);
		if (
			index < 0 ||
			(event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "ArrowUp" && event.key !== "ArrowDown")
		) {
			return;
		}
		event.preventDefault();
		const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
		onPick(items[(index + step + items.length) % items.length]);
	};
}

/** 색 프리셋 스와치 + HEX 입력 — 레이어 색·링 색 공용 */
export function ColorField({
	value,
	saving,
	label,
	onChange
}: {
	value: string;
	saving: boolean;
	label: string;
	onChange: (color: string) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<div role="radiogroup" aria-label={`${label} 색 프리셋`} className="flex items-center gap-1.5">
				{COLOR_PRESETS.map((preset) => (
					// D 분류 — 색 프리셋 옵션 행은 raw 유지 (디자인 시스템 7장 §raw button)
					<button
						key={preset}
						type="button"
						role="radio"
						aria-checked={value === preset}
						aria-label={`${label} 색 ${preset}`}
						disabled={saving}
						onKeyDown={radioArrowKeyDown(COLOR_PRESETS, value, (key) => onChange(key))}
						onClick={() => onChange(preset)}
						className={cn(
							"pointer-coarse:h-11 pointer-coarse:w-11 h-7 w-7 cursor-pointer rounded-full shadow-xs transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							value === preset && "ring-2 ring-ring"
						)}
						style={{ backgroundColor: preset }}
					/>
				))}
			</div>
			<HexColorInput value={value} saving={saving} label={label} onCommit={onChange} />
		</div>
	);
}

function HexColorInput({ value, saving, label, onCommit }: { value: string; saving: boolean; label: string; onCommit: (color: string) => void }) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	const valid = HEX_COLOR_PATTERN.test(draft);
	return (
		<Input
			value={draft}
			maxLength={7}
			placeholder="#ffffff"
			className="w-24"
			disabled={saving}
			aria-invalid={!valid || undefined}
			aria-label={`${label} 색 HEX`}
			onChange={(event) => {
				const raw = event.target.value;
				setDraft(raw);
				if (HEX_COLOR_PATTERN.test(raw)) onCommit(raw.toLowerCase());
			}}
		/>
	);
}
