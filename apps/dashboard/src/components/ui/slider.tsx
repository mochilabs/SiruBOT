"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";

interface SliderProps extends Omit<SliderPrimitive.Root.Props, "value" | "defaultValue" | "onValueChange" | "onChange" | "onValueCommitted"> {
	value?: number;
	defaultValue?: number;
	min?: number;
	max?: number;
	step?: number;
	onChange?: (value: number) => void;
	/** 조작이 끝나는 시점(드래그 놓기·트랙 클릭·키보드 한 스텝)에 1회 호출돼요 — 히스토리 커밋용 */
	onCommit?: (value: number) => void;
	label?: string;
	showValue?: boolean;
	formatValue?: (value: number) => string;
	className?: string;
}

function Slider({
	className,
	value,
	defaultValue,
	min = 0,
	max = 100,
	step = 1,
	onChange,
	onCommit,
	label,
	showValue = false,
	formatValue = (v) => String(v),
	disabled,
	...props
}: SliderProps) {
	const currentValue = value ?? defaultValue ?? min;
	const handleValueChange = (values: number[]) => {
		onChange?.(values[0] ?? min);
	};
	const handleValueCommitted = (committed: number | readonly number[]) => {
		if (!onCommit) return;
		onCommit(typeof committed === "number" ? committed : (committed[0] ?? min));
	};

	return (
		<div className={cn("w-full space-y-1.5", className)}>
			{(label || showValue) && (
				<div className="flex items-center justify-between gap-2">
					{label && <span className="text-sm font-medium text-foreground">{label}</span>}
					{showValue && <span className="text-sm font-medium tracking-tight text-primary-text tabular-nums">{formatValue(currentValue)}</span>}
				</div>
			)}

			<SliderPrimitive.Root
				data-slot="slider"
				value={value !== undefined ? [value] : undefined}
				defaultValue={defaultValue !== undefined ? [defaultValue] : undefined}
				min={min}
				max={max}
				step={step}
				onValueChange={handleValueChange}
				onValueCommitted={handleValueCommitted}
				disabled={disabled}
				thumbAlignment="center"
				{...props}
			>
				<SliderPrimitive.Control className="relative flex h-6 w-full touch-none items-center select-none data-disabled:opacity-50">
					<SliderPrimitive.Track
						data-slot="slider-track"
						className="relative grow rounded-full bg-muted select-none data-horizontal:h-1.5 data-horizontal:w-full"
					>
						<SliderPrimitive.Indicator
							data-slot="slider-range"
							className="rounded-full bg-primary-control select-none data-horizontal:h-full"
						/>
						<SliderPrimitive.Thumb
							data-slot="slider-thumb"
							index={0}
							aria-label={label}
							className="relative block size-4 shrink-0 rounded-full border-0 bg-primary-control shadow-sm transition-[color,box-shadow] select-none after:absolute after:-inset-3.5 hover:ring-2 data-focused:ring-2 ring-ring disabled:pointer-events-none disabled:opacity-50"
						/>
					</SliderPrimitive.Track>
				</SliderPrimitive.Control>
			</SliderPrimitive.Root>

			<div className="flex justify-between text-xs text-muted-foreground">
				<span>{formatValue(min)}</span>
				<span>{formatValue(max)}</span>
			</div>
		</div>
	);
}

export { Slider };
export type { SliderProps };
