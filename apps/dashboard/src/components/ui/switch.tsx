"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

interface SwitchProps extends Omit<SwitchPrimitive.Root.Props, "onCheckedChange" | "checked" | "defaultChecked"> {
	checked?: boolean;
	defaultChecked?: boolean;
	onChange?: (checked: boolean) => void;
	label?: string;
	labelPosition?: "left" | "right";
	size?: "sm" | "md";
	className?: string;
}

const trackSizes = {
	sm: "h-5 w-9",
	md: "h-6 w-11",
};

const thumbSizes = {
	sm: "h-3.5 w-3.5",
	md: "h-5 w-5",
};

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
				"peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-0 bg-muted transition-colors duration-fast outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary",
				trackSizes[size],
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={cn(
					"pointer-events-none block rounded-full bg-background shadow-sm transition-transform duration-fast",
					thumbSizes[size],
					"group-data-[size=sm]/switch:translate-x-0.5 group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)]",
					"group-data-[size=md]/switch:translate-x-0.5 group-data-[size=md]/switch:data-checked:translate-x-[calc(100%-2px)]",
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
