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
//   md: track 44x24 px, thumb 16x16 px, 2px padding each side -> travel 24px (1.5rem)
//   sm: track 36x20 px, thumb 14x14 px, 2px padding each side -> travel 18px (1.125rem)
// Thumb stays 2px smaller than track height so it never clips the rounded caps.
const trackSizes = {
	sm: "h-5 w-9",
	md: "h-6 w-11",
};

const thumbSizes = {
	sm: "h-3.5 w-3.5",
	md: "h-4 w-4",
};

// Unchecked track: secondary fill is too subtle against cards, so it pairs with
// an inset boundary. Checked track uses primary-control (#c14377, 4.84:1 vs white)
// for clear on-state contrast.
const trackBase =
	"rounded-full border-0 bg-secondary shadow-control-boundary transition-colors duration-fast outline-none data-checked:bg-primary-control data-checked:shadow-none";

const thumbBase =
	"pointer-events-none block rounded-full border-0 bg-card shadow-md transition-transform duration-fast ease-out";

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
					"group-data-[size=sm]/switch:translate-x-0.5 group-data-[size=sm]/switch:data-checked:translate-x-[1.125rem]",
					"group-data-[size=md]/switch:translate-x-0.5 group-data-[size=md]/switch:data-checked:translate-x-[1.5rem]",
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
