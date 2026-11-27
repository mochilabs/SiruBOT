import type { GreetingLayer } from "@sirubot/utils/memberGreeting";

export const MAX_GREETING_LAYERS = 80;
export const PASTE_OFFSET = { x: 2.5, y: 4.5 } as const;

let clipboard: { layers: GreetingLayer[]; pastes: number } | null = null;

export function copyLayers(layers: readonly GreetingLayer[], selectedIds: readonly string[]): number {
	const picked = layers.filter((layer) => selectedIds.includes(layer.id));
	if (picked.length === 0) return 0;
	clipboard = { layers: structuredClone(picked), pastes: 0 };
	return picked.length;
}

export function hasClipboard(): boolean {
	return clipboard !== null;
}

export function clearClipboard(): void {
	clipboard = null;
}

function clampPercent(value: number): number {
	return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

export function cloneLayers(layers: readonly GreetingLayer[], steps = 1, newId: () => string = () => crypto.randomUUID()): GreetingLayer[] {
	return layers.map((layer) => ({ ...structuredClone(layer), id: newId(), x: clampPercent(layer.x + PASTE_OFFSET.x * steps), y: clampPercent(layer.y + PASTE_OFFSET.y * steps) }) as GreetingLayer);
}

export function pasteLayers(newId?: () => string): GreetingLayer[] {
	if (!clipboard) return [];
	clipboard.pastes += 1;
	return cloneLayers(clipboard.layers, clipboard.pastes, newId);
}

export function appendWithinLimit(existing: readonly GreetingLayer[], added: readonly GreetingLayer[]): GreetingLayer[] {
	return [...existing, ...added.slice(0, Math.max(0, MAX_GREETING_LAYERS - existing.length))];
}
