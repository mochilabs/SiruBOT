"use client";

import { useCallback, useId, useRef, useState } from "react";

/* ─────────────────────────── types ─────────────────────────── */

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

/* ─────────────────────────── component ─────────────────────────── */

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
	const trackRef = useRef<HTMLDivElement>(null);
	
	// Support both controlled and uncontrolled states
	const [localValue, setLocalValue] = useState(defaultValue);
	const isControlled = value !== undefined;
	const current = isControlled ? value : localValue;
	const percent = ((current - min) / (max - min)) * 100;

	const clamp = useCallback(
		(v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step)),
		[min, max, step],
	);

	const getValueFromPosition = useCallback(
		(clientX: number) => {
			const rect = trackRef.current?.getBoundingClientRect();
			if (!rect) return current;
			const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
			return clamp(min + ratio * (max - min));
		},
		[min, max, current, clamp],
	);

	const handleValueChange = (newValue: number) => {
		if (!isControlled) {
			setLocalValue(newValue);
		}
		onChange?.(newValue);
	};

	const handlePointerDown = (e: React.PointerEvent) => {
		if (disabled) return;
		e.preventDefault();
		const track = trackRef.current;
		if (track) {
			track.setPointerCapture(e.pointerId);
			handleValueChange(getValueFromPosition(e.clientX));
		}
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		if (disabled) return;
		const track = trackRef.current;
		if (track && track.hasPointerCapture(e.pointerId)) {
			handleValueChange(getValueFromPosition(e.clientX));
		}
	};

	const handlePointerUp = (e: React.PointerEvent) => {
		const track = trackRef.current;
		if (track && track.hasPointerCapture(e.pointerId)) {
			track.releasePointerCapture(e.pointerId);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (disabled) return;
		let next = current;
		switch (e.key) {
			case "ArrowRight":
			case "ArrowUp":
				next = clamp(current + step);
				break;
			case "ArrowLeft":
			case "ArrowDown":
				next = clamp(current - step);
				break;
			case "Home":
				next = min;
				break;
			case "End":
				next = max;
				break;
			default:
				return;
		}
		e.preventDefault();
		handleValueChange(next);
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
						<span className="text-sm font-black tracking-tight text-primary tabular-nums">
							{formatValue(current)}
						</span>
					)}
				</div>
			)}

			{/* Track */}
			<div
				ref={trackRef}
				className={`relative h-2 w-full rounded-full bg-muted ${disabled ? "opacity-50" : "cursor-pointer"}`}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
			>
				{/* Fill */}
				<div
					className="absolute inset-y-0 left-0 rounded-full bg-primary"
					style={{ width: `${percent}%` }}
				/>

				{/* Thumb */}
				<div
					id={id}
					role="slider"
					tabIndex={disabled ? -1 : 0}
					aria-valuemin={min}
					aria-valuemax={max}
					aria-valuenow={current}
					aria-label={label}
					aria-disabled={disabled || undefined}
					onKeyDown={handleKeyDown}
					className={`
						absolute top-1/2 -translate-y-1/2 -translate-x-1/2
						h-5 w-5 rounded-full bg-white border-2 border-primary
						shadow-lg shadow-primary/20
						transition-shadow duration-200
						${disabled ? "" : "hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"}
					`}
					style={{ left: `${percent}%` }}
				/>
			</div>

			{/* Min/Max labels */}
			<div className="flex justify-between text-xs font-bold text-muted-foreground/40 uppercase tracking-widest">
				<span>{formatValue(min)}</span>
				<span>{formatValue(max)}</span>
			</div>
		</div>
	);
}
