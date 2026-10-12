"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";

interface SliderProps extends Omit<SliderPrimitive.Root.Props, "value" | "defaultValue" | "onValueChange" | "onChange"> {
	value?: number;
	defaultValue?: number;
	min?: number;
	max?: number;
	step?: number;
	onChange?: (value: number) => void;
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

	return (
		<div className={cn("space-y-2", className)}>
			{(label || showValue) && (
				<div className="flex items-center justify-between">
					{label && <span className="text-sm font-medium text-foreground">{label}</span>}
					{showValue && <span className="text-sm font-black tracking-tight text-primary-text tabular-nums">{formatValue(currentValue)}</span>}
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
				disabled={disabled}
				thumbAlignment="edge"
				{...props}
			>
				<SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50">
					<SliderPrimitive.Track
						data-slot="slider-track"
						className="relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1.5 data-horizontal:w-full"
					>
						<SliderPrimitive.Indicator
							data-slot="slider-range"
							className="bg-primary select-none data-horizontal:h-full"
						/>
					</SliderPrimitive.Track>
					{Array.from({ length: 1 }, (_, index) => (
						<SliderPrimitive.Thumb
							data-slot="slider-thumb"
							key={index}
							className="relative block size-4 shrink-0 rounded-full border-0 bg-primary shadow-sm transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
						/>
					))}
				</SliderPrimitive.Control>
			</SliderPrimitive.Root>

			<div className="flex justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
				<span>{formatValue(min)}</span>
				<span>{formatValue(max)}</span>
			</div>
		</div>
	);
}

export { Slider };
export type { SliderProps };
