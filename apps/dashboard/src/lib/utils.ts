import type { KeyboardEvent } from "react";
import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Register custom CSS tokens from globals.css so tailwind-merge resolves conflicts properly.
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			shadow: [{ shadow: ["control-boundary", "control-boundary-invalid"] }],
			rounded: [{ rounded: ["control", "menu", "card", "dialog"] }],
			"font-size": [{ text: ["2xs", "3xs"] }],
			duration: [{ duration: ["fast", "base", "slow"] }],
			transition: ["transition-control"],
			ease: [{ ease: ["standard"] }],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function radioArrowKeyDown(
	items: readonly string[],
	current: string,
	onPick: (key: string) => void,
): (event: KeyboardEvent) => void {
	return (event) => {
		const index = items.indexOf(current);
		if (index < 0 || (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
			return;
		}
		event.preventDefault();
		const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
		onPick(items[(index + step + items.length) % items.length]!);
	};
}