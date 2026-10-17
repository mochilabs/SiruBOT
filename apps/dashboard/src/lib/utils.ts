import type { KeyboardEvent } from "react";
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

/**
 * 소그룹 단일 선택(radio) 공용 키보드 이동 — 좌/우/위/아래 화살표로 항목을 순환해요.
 * role="radio"를 쓰는 커스텀 그룹(색 프리셋, 정렬, 도형 등)이 함께 써요.
 */
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