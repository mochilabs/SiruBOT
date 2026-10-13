"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

interface SwitchProps extends Omit<SwitchPrimitive.Root.Props, "onCheckedChange" & "checked" & "defaultChecked"> {
	checked?: boolean;
	defaultChecked?: boolean;
	onChange?: (checked: boolean) => void;
	label?: string;
	labelPosition?: "left" | "right";
	size?: "sm" | "md";
	className?: string;
}

// Track internal geometry:
//   md: track 44x24 px, thumb 20x20 px, 2px padding each side -> travel 20px (1.25rem)
//   sm: track 36x20 px, thumb 16x16 px, 2px padding each side -> travel 16px (1rem)
// Thumb is inset 2px from the top/bottom caps (4px smaller than track height) so it never clips the rounded caps.
const trackSizes = {
	sm: "h-5 w-9",
	md: "h-6 w-11",
};

const thumbSizes = {
	sm: "h-4 w-4",
	md: "h-5 w-5",
};

// Unchecked track: secondary fill is too subtle against cards, so it pairs with
// an inset boundary. Checked track uses primary-control (= var(--brand) — light
// #ee6f8b / dark #f98aa0) for a clear on-state fill.
// Thumb is always solid white via --switch-thumb (iOS/Discord convention).
// knob에 elevation shadow를 얹지 않는다 — 핑크 on-state 트랙 위에서 그림자가
// 흰 dot 아래로 번져 knob이 몇 픽셀 낮게 보이는 착시를 만들어요.
const trackBase =
	"rounded-full border-0 bg-secondary shadow-control-boundary transition-colors duration-fast outline-none data-checked:bg-primary-control data-checked:shadow-none";

const thumbBase =
	"pointer-events-none block -translate-y-[0.25px] rounded-full border-0 bg-switch-thumb transition-transform duration-fast ease-out";

function Switch({
	checked,
	defaultChecked,
	onChange,
	disabled,
	label,
	labelPosition = "right",
	size = "md",
	className,
	...props
}: SwitchProps) {
	const track = (
		<SwitchPrimitive.Root
			data-slot="switch"
			data-size={size}
			checked={checked}
			defaultChecked={defaultChecked}
			onCheckedChange={onChange}
			disabled={disabled}
			className={cn(
				"peer group/switch relative inline-flex shrink-0 cursor-pointer items-center focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
				trackBase,
				trackSizes[size],
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={cn(
					thumbBase,
					thumbSizes[size],
					// 2px inset from left cap.
					"group-data-[size=sm]/switch:translate-x-0.5 group-data-[size=sm]/switch:data-checked:translate-x-[1rem]",
					"group-data-[size=md]/switch:translate-x-0.5 group-data-[size=md]/switch:data-checked:translate-x-[1.25rem]",
				)}
			/>
		</SwitchPrimitive.Root>
	);

	if (!label) {
		return track;
	}

	return (
		<label
			className={cn(
				"inline-flex items-center gap-3",
				disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
			)}
		>
			{labelPosition === "left" && <span className="select-none text-sm font-medium text-foreground">{label}</span>}
			{track}
			{labelPosition === "right" && <span className="select-none text-sm font-medium text-foreground">{label}</span>}
		</label>
	);
}

export { Switch };
export type { SwitchProps };
