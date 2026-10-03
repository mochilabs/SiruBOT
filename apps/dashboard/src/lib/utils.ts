import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class name combiner: conditional classes via `clsx`, conflict resolution via `tailwind-merge`.
 *
 * All components must route Tailwind classes through `cn` so that later utility
 * classes reliably override earlier ones (e.g. `cn("px-4", className)`).
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
