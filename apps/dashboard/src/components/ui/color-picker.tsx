"use client";

import { type KeyboardEvent,useCallback, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { clamp01, HEX_COLOR_PATTERN, hexToHsv, type Hsv,hsvToHex, normalizeHex } from "@/lib/color";
import { cn, radioArrowKeyDown } from "@/lib/utils";
/** 색 프리셋 기본값 — 사용자가 고르는 실제 색 데이터예요. UI 스타일이 아니에요 */
export const COLOR_PRESETS = ["#ffffff", "#2d1b1e", "#ff85c1", "#a3416f", "#ffe4f0"] as const;

export interface ColorPickerProps {
	/** 현재 색 (#RRGGBB) */
	value: string;
	/** 색이 바뀔 때마다 호출 — 드래그 중에도 나가요 */
	onChange: (color: string) => void;
	/** 편집 확정 시점(드래그 놓기·키보드 한 스텝·HEX blur·프리셋 클릭)에 호출 — 되돌리기 한 단계용 */
	onCommit?: (color: string) => void;
	/** 색을 고르는 대상 이름 — 접근성 라벨에 쓰여요 (예: "글자", "강조색") */
	label: string;
	presets?: readonly string[];
	disabled?: boolean;
	className?: string;
}

/**
 * 색 선택기 — 채도·명도 팔레트 + 색상 바 + HEX 입력 + 프리셋 스와치.
 *
 * 팔레트의 그라데이션은 장식이 아니라 편집 중인 색 공간(채도/명도/색상)을 그대로 보여주는 표면이에요.
 * HEX 입력이 있어서 키보드만으로도 값을 정확히 낼 수 있고, 팔레트는 방향키로 한 스텝씩 움직여요.
 */
export function ColorPicker({ value, onChange, onCommit, label, presets = COLOR_PRESETS, disabled = false, className }: ColorPickerProps) {
	const normalized = normalizeHex(value) ?? "#ffffff";
	// 색상(h)은 무채색에서도 유지돼야 해요 — 표시 색만으로 되돌리면 슬라이더가 튀어요.
	const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(normalized));
	const draggingRef = useRef(false);
	const svRef = useRef<HTMLDivElement>(null);
	const hueRef = useRef<HTMLDivElement>(null);

	// 외부에서 값이 바뀌면(프리셋·HEX 입력·초기화) 팔레트를 따라가요.
	// 자기가 만든 색은 비교에서 걸러지고, 무채색으로 옮겨도 색상(h)을 그대로 지켜요.
	useEffect(() => {
		setHsv((prev) => (hsvToHex(prev.h, prev.s, prev.v) === normalized ? prev : hexToHsv(normalized)));
	}, [normalized]);

	const emit = useCallback(
		(next: Hsv, commit: boolean) => {
			setHsv(next);
			const hex = hsvToHex(next.h, next.s, next.v);
			onChange(hex);
			if (commit) onCommit?.(hex);
		},
		[onChange, onCommit]
	);

	const pickFromSv = (clientX: number, clientY: number, commit: boolean) => {
		const rect = svRef.current?.getBoundingClientRect();
		if (!rect) return;
		emit({ h: hsv.h, s: clamp01((clientX - rect.left) / rect.width), v: clamp01(1 - (clientY - rect.top) / rect.height) }, commit);
	};

	const pickFromHue = (clientY: number, commit: boolean) => {
		const rect = hueRef.current?.getBoundingClientRect();
		if (!rect) return;
		emit({ ...hsv, h: clamp01((clientY - rect.top) / rect.height) * 360 }, commit);
	};

	const onSvKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const step = event.shiftKey ? 0.1 : 0.01;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, step],
			ArrowDown: [0, -step]
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		emit({ h: hsv.h, s: clamp01(hsv.s + move[0]), v: clamp01(hsv.v + move[1]) }, true);
	};

	const onHueKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const step = event.shiftKey ? 30 : 5;
		if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
		event.preventDefault();
		emit({ ...hsv, h: ((hsv.h + (event.key === "ArrowUp" ? step : -step)) % 360 + 360) % 360 }, true);
	};

	const swatchStyle = { backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v) };

	return (
		<div className={cn("space-y-2", className)}>
			<div className="flex items-stretch gap-2">
				{/* 채도·명도 표면 — 가로는 채도, 세로는 명도 */}
				<div
					ref={svRef}
					role="slider"
					tabIndex={disabled ? -1 : 0}
					aria-label={`${label} 채도와 명도`}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(hsv.s * 100)}
					aria-valuetext={`채도 ${Math.round(hsv.s * 100)}%, 명도 ${Math.round(hsv.v * 100)}%`}
					aria-disabled={disabled}
					onKeyDown={onSvKeyDown}
					onPointerDown={(event) => {
						if (disabled) return;
						event.currentTarget.setPointerCapture(event.pointerId);
						draggingRef.current = true;
						pickFromSv(event.clientX, event.clientY, false);
					}}
					onPointerMove={(event) => {
						if (!draggingRef.current || disabled) return;
						pickFromSv(event.clientX, event.clientY, false);
					}}
					onPointerUp={(event) => {
						if (!draggingRef.current) return;
						draggingRef.current = false;
						pickFromSv(event.clientX, event.clientY, true);
					}}
					onPointerCancel={() => {
						draggingRef.current = false;
					}}
					className={cn(
						"relative h-36 w-full max-w-56 touch-none rounded-control shadow-control-boundary select-none",
						disabled ? "cursor-not-allowed opacity-50" : "cursor-crosshair",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					)}
					style={{
						background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h} 100% 50%)`
					}}
				>
					<span
						aria-hidden
						className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/25"
						style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, ...swatchStyle }}
					/>
				</div>

				{/* 색상 바 — 위에서 아래로 0°→360° */}
				<div
					ref={hueRef}
					role="slider"
					tabIndex={disabled ? -1 : 0}
					aria-label={`${label} 색상`}
					aria-valuemin={0}
					aria-valuemax={360}
					aria-valuenow={Math.round(hsv.h)}
					aria-valuetext={`${Math.round(hsv.h)}도`}
					aria-disabled={disabled}
					onKeyDown={onHueKeyDown}
					onPointerDown={(event) => {
						if (disabled) return;
						event.currentTarget.setPointerCapture(event.pointerId);
						draggingRef.current = true;
						pickFromHue(event.clientY, false);
					}}
					onPointerMove={(event) => {
						if (!draggingRef.current || disabled) return;
						pickFromHue(event.clientY, false);
					}}
					onPointerUp={(event) => {
						if (!draggingRef.current) return;
						draggingRef.current = false;
						pickFromHue(event.clientY, true);
					}}
					onPointerCancel={() => {
						draggingRef.current = false;
					}}
					className={cn(
						"relative w-4 shrink-0 rounded-full shadow-control-boundary select-none",
						disabled ? "cursor-not-allowed opacity-50" : "cursor-ns-resize",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					)}
					style={{
						background: "linear-gradient(to bottom, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
					}}
				>
					<span
						aria-hidden
						className="pointer-events-none absolute left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/25"
						style={{ top: `${(hsv.h / 360) * 100}%`, ...swatchStyle }}
					/>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<HexInput value={normalized} label={label} disabled={disabled} onChange={onChange} onCommit={onCommit} />
				{presets.length > 0 && (
					<div role="radiogroup" aria-label={`${label} 색 프리셋`} className="flex items-center gap-2.5">
						{presets.map((preset) => (
							// D 분류 — 색 프리셋 옵션 행은 raw 유지 (디자인 시스템 7장 §raw button)
							<button
								key={preset}
								type="button"
								role="radio"
								aria-checked={normalized === preset.toLowerCase()}
								aria-label={`${label} 색 ${preset}`}
								disabled={disabled}
								onKeyDown={radioArrowKeyDown(presets, normalized, (key) => {
									onChange(key.toLowerCase());
									onCommit?.(key.toLowerCase());
								})}
								onClick={() => {
									onChange(preset.toLowerCase());
									onCommit?.(preset.toLowerCase());
								}}
								className={cn(
									" relative h-7 w-7 cursor-pointer rounded-full shadow-control-boundary transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:-inset-2",
									normalized === preset.toLowerCase() && "ring-2 ring-ring"
								)}
								style={{ backgroundColor: preset }}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

/** HEX 입력 — 형식이 맞을 때만 바깥으로 값을 내보내요. 편집 중인 깨진 입력이 미리보기를 깨지 않게요 */
function HexInput({
	value,
	label,
	disabled,
	onChange,
	onCommit
}: {
	value: string;
	label: string;
	disabled: boolean;
	onChange: (color: string) => void;
	onCommit?: (color: string) => void;
}) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	const valid = HEX_COLOR_PATTERN.test(draft);
	return (
		<Input
			value={draft}
			maxLength={7}
			placeholder="#ffffff"
			className="w-24"
			disabled={disabled}
			aria-invalid={!valid || undefined}
			aria-label={`${label} 색 HEX`}
			onChange={(event) => {
				const raw = event.target.value;
				setDraft(raw);
				const normalized = normalizeHex(raw);
				if (normalized) onChange(normalized);
			}}
			onBlur={() => {
				if (valid) onCommit?.(normalizeHex(draft) ?? value);
				else setDraft(value);
			}}
		/>
	);
}
