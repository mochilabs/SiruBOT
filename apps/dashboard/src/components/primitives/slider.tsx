"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

interface SliderProps {
	value?: number;
	defaultValue?: number;
	min?: number;
	max?: number;
	step?: number;
	onChange?: (value: number) => void;
	disabled?: boolean;
	label?: string;
	showValue?: boolean;
	formatValue?: (value: number) => string;
	className?: string;
}

/**
 * 네이티브 <input type="range"> 슬라이더 — 썸 위치를 브라우저가 직접 처리해서 터치
 * 드래그 중에도 React 렌더를 기다리지 않아요. 채움·값 표시는 로컬 미러 상태로 그리고
 * 상위 상태는 onChange로 통지해요. 방향키·Home/End 포커스 링은 네이티브 동작을 그대로 써요.
 */
export function Slider({
	value,
	defaultValue = 0,
	min = 0,
	max = 100,
	step = 1,
	onChange,
	disabled = false,
	label,
	showValue = false,
	formatValue = (v) => String(v),
	className = "",
}: SliderProps) {
	const id = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	/** 사용자가 드래그 중일 때는 외부 value 동기화를 건너뛰어 썸이 한 박자 뒤로 튀지 않게 해요 */
	const interactingRef = useRef(false);
	const clamp = useCallback(
		(v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step)),
		[min, max, step],
	);
	const [current, setCurrent] = useState(() => clamp(value ?? defaultValue));
	const isControlled = value !== undefined;
	const percent = max > min ? ((current - min) / (max - min)) * 100 : 0;

	// controlled prop 변화만 입력값에 반영해요 — 드래그 중엔 건드리지 않아요(놓을 때 회신)
	useEffect(() => {
		if (!isControlled || interactingRef.current) return;
		const next = clamp(value);
		const el = inputRef.current;
		if (el && el.valueAsNumber !== next) el.value = String(next);
		if (current !== next) setCurrent(next);
		// current 포함 — 상위가 값을 반영하지 않아도(no-op onChange) 표기를 value로 되돌려요
	}, [isControlled, clamp, value, current]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const next = clamp(e.currentTarget.valueAsNumber);
		setCurrent(next);
		onChange?.(next);
	};

	const handlePointerEnd = () => {
		if (!interactingRef.current) return;
		interactingRef.current = false;
		if (isControlled) {
			const next = clamp(value);
			const el = inputRef.current;
			if (el && el.valueAsNumber !== next) {
				el.value = String(next);
				setCurrent(next);
			}
		}
	};

	return (
		<div className={`space-y-2 ${className}`}>
			{(label || showValue) && (
				<div className="flex items-center justify-between">
					{label && (
						<label htmlFor={id} className="text-sm font-medium text-foreground">
							{label}
						</label>
					)}
					{showValue && (
						<span className="text-sm font-black tracking-tight text-primary-text tabular-nums">
							{formatValue(current)}
						</span>
					)}
				</div>
			)}

			<div className="relative flex items-center">
				{/* Track + Fill — 채움 모서리는 썸이 항상 덮어 좌우로 떨어지지 않아요 */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted"
				>
					<div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
				</div>

				<input
					ref={inputRef}
					id={id}
					type="range"
					min={min}
					max={max}
					step={step}
					defaultValue={clamp(value ?? defaultValue)}
					onChange={handleChange}
					onPointerDown={() => {
						interactingRef.current = true;
					}}
					onPointerUp={handlePointerEnd}
					onPointerCancel={handlePointerEnd}
					disabled={disabled}
					aria-label={label}
					aria-valuetext={formatValue(current)}
					className={`relative z-10 h-6 w-full cursor-pointer appearance-none touch-none bg-transparent disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11
						[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-card [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-primary/20 [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-ring [&:focus-visible::-webkit-slider-thumb]:ring-offset-2 [&:focus-visible::-webkit-slider-thumb]:ring-offset-background
						[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-card [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:shadow-primary/20 [&:focus-visible::-moz-range-thumb]:ring-2 [&:focus-visible::-moz-range-thumb]:ring-ring [&:focus-visible::-moz-range-thumb]:ring-offset-2 [&:focus-visible::-moz-range-thumb]:ring-offset-background
						[&::-moz-range-track]:bg-transparent [&::-moz-range-progress]:bg-transparent
					`}
				/>
			</div>

			{/* Min/Max labels */}
			<div className="flex justify-between text-xs font-bold text-muted-foreground uppercase tracking-widest">
				<span>{formatValue(min)}</span>
				<span>{formatValue(max)}</span>
			</div>
		</div>
	);
}