"use client";

import { useId } from "react";
import { m, AnimatePresence } from "framer-motion";

/* ─────────────────────────── types ─────────────────────────── */

interface SwitchProps {
	checked?: boolean;
	defaultChecked?: boolean;
	onChange?: (checked: boolean) => void;
	disabled?: boolean;
	label?: string;
	labelPosition?: "left" | "right";
	size?: "sm" | "md";
	className?: string;
}

/* ─────────────────────────── styles ─────────────────────────── */

const trackSizes = {
	sm: "h-5 w-9",
	md: "h-6 w-11",
};

const thumbSizes = {
	sm: "h-3.5 w-3.5",
	md: "h-5 w-5",
};

const thumbTravel = {
	sm: 16,
	md: 20,
};

/* ─────────────────────────── component ─────────────────────────── */

export function Switch({
	checked,
	defaultChecked = false,
	onChange,
	disabled = false,
	label,
	labelPosition = "right",
	size = "md",
	className = "",
}: SwitchProps) {
	const id = useId();

	// Support both controlled and uncontrolled
	const isControlled = checked !== undefined;
	const isOn = isControlled ? checked : undefined;

	const handleClick = () => {
		if (disabled) return;
		onChange?.(!isOn);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === " ") {
			e.preventDefault();
			handleClick();
		}
	};

	const track = (
		<button
			id={id}
			role="switch"
			type="button"
			aria-checked={isOn ?? defaultChecked}
			aria-label={label}
			disabled={disabled}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			className={`
				relative inline-flex shrink-0 items-center rounded-full transition-colors duration-300 cursor-pointer
				${trackSizes[size]}
				${(isOn ?? defaultChecked) ? "bg-primary" : "bg-muted"}
				${disabled ? "opacity-50 cursor-not-allowed" : ""}
				focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
			`}
		>
			<m.span
				className={`
					block rounded-full bg-white shadow-sm
					${thumbSizes[size]}
				`}
				animate={{
					x: (isOn ?? defaultChecked) ? thumbTravel[size] : 2,
				}}
				transition={{ type: "spring", stiffness: 500, damping: 30 }}
			/>
		</button>
	);

	if (!label) {
		return <span className={className}>{track}</span>;
	}

	return (
		<label
			htmlFor={id}
			className={`inline-flex items-center gap-3 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
		>
			{labelPosition === "left" && (
				<span className="text-sm font-medium text-foreground select-none">{label}</span>
			)}
			{track}
			{labelPosition === "right" && (
				<span className="text-sm font-medium text-foreground select-none">{label}</span>
			)}
		</label>
	);
}
