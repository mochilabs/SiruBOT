import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class name combiner: conditional classes via `clsx`, conflict resolution via `tailwind-merge`.
 *
 * All components must route Tailwind classes through `cn` so that later utility
 * classes reliably override earlier ones (e.g. `cn("px-4", className)`).
 *
 * globals.css의 커스텀 명명 토큰(shadow-control-boundary, rounded-control, duration-fast,
 * text-2xs 등)을 tailwind-merge 기본 그룹에 등록한다 — 등록하지 않으면 같은 축의 클래스가
 * 병합되지 않고 둘 다 살아남는다(예: `shadow-sm` + `shadow-control-boundary` 공존).
 */
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