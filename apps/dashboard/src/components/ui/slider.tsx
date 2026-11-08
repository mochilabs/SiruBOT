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
	/** 라벨을 화면에서는 숨기고 스크린리더용(aria-label)으로만 둬요 — 바깥 Field 라벨과 겹칠 때 써요 */
	hideLabel?: boolean;
	showValue?: boolean;
	/** 트랙 아래에 최소·최대 값을 보여줘요 (기본은 숨김 — 범위는 설명 문구가 말해줘요) */
	showRange?: boolean;
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
	hideLabel = false,
	showValue = true,
	showRange = false,
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

	// thumbAlignment="edge"는 썸 위치를 JS로 측정해서, 측정이 안 된 채 남으면 썸·채움이 visibility:hidden으로 영영 사라져요.
	// "center"는 값 퍼센트만으로 위치가 정해져 측정 상태에 기대지 않아요. 썸이 양 끝에서 반지름만큼 삐져나오는 건 Control 패딩(px-2.5)으로 흡수해요.
	return (
		<div className={cn("w-full space-y-1.5", className)}>
			{label && !hideLabel && <span className="block text-sm font-medium text-foreground">{label}</span>}

			<div className="flex items-center gap-4">
				<SliderPrimitive.Root
					data-slot="slider"
					className="min-w-0 flex-1"
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
					<SliderPrimitive.Control className="relative flex h-8 w-full touch-none items-center px-2.5 select-none data-disabled:opacity-50">
						<SliderPrimitive.Track
							data-slot="slider-track"
							className="relative grow rounded-full bg-foreground/15 select-none data-horizontal:h-2 data-horizontal:w-full"
						>
							<SliderPrimitive.Indicator
								data-slot="slider-range"
								className="rounded-full bg-primary-control select-none data-horizontal:h-full"
							/>
							<SliderPrimitive.Thumb
								data-slot="slider-thumb"
								index={0}
								aria-label={label}
								className="relative block size-5 shrink-0 rounded-full border-[3px] border-primary-control bg-background shadow-md transition-[color,box-shadow] select-none after:absolute after:-inset-3 hover:ring-4 hover:ring-primary-control/20 data-focused:ring-4 data-focused:ring-primary-control/30 disabled:pointer-events-none disabled:opacity-50"
							/>
						</SliderPrimitive.Track>
					</SliderPrimitive.Control>
				</SliderPrimitive.Root>

				{showValue && (
					<span className="min-w-16 shrink-0 rounded-control bg-surface-2 px-2.5 py-1 text-center text-sm font-bold tabular-nums text-primary-text">
						{formatValue(currentValue)}
					</span>
				)}
			</div>

			{showRange && (
				<div className="flex justify-between text-xs text-muted-foreground">
					<span>{formatValue(min)}</span>
					<span>{formatValue(max)}</span>
				</div>
			)}
		</div>
	);
}

export { Slider };
export type { SliderProps };
