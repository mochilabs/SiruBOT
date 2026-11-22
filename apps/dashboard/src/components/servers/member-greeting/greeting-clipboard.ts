import type { GreetingLayer } from "@sirubot/utils/memberGreeting";

/** 이미지 레이어 개수 상한 — 스키마(`greetingImageSchema`)와 같아요 */
export const MAX_GREETING_LAYERS = 80;
/** 복제·붙여넣기가 원본에서 벗어나는 거리 (카드 %) — 같은 자리에 겹쳐 놓이면 복제된 줄 모르기 때문이에요 */
export const PASTE_OFFSET = { x: 2.5, y: 4.5 } as const;

/** 앱 안 클립보드 — 서버·종류(환영/작별)를 바꿔도 남아요. 시스템 클립보드는 건드리지 않아요 */
let clipboard: { layers: GreetingLayer[]; pastes: number } | null = null;

/** 선택한 레이어를 복사해 둬요 (배열 순서 = 겹침 순서를 지켜요). 빈 선택이면 기존 내용을 그대로 둬요 */
export function copyLayers(layers: readonly GreetingLayer[], selectedIds: readonly string[]): number {
	const picked = layers.filter((layer) => selectedIds.includes(layer.id));
	if (picked.length === 0) return 0;
	clipboard = { layers: structuredClone(picked), pastes: 0 };
	return picked.length;
}

export function hasClipboard(): boolean {
	return clipboard !== null;
}

/** 테스트용 */
export function clearClipboard(): void {
	clipboard = null;
}

function clampPercent(value: number): number {
	return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

/**
 * 레이어 복사본 — 새 id, 오프셋 `steps`번만큼 오른쪽 아래로 이동. 같은 레이어 여러 번 붙여넣어도 한 번씩 더 벗어나요.
 * 가장자리에서는 0~100 안으로 잡아서 화면 밖으로 사라지지 않아요.
 */
export function cloneLayers(layers: readonly GreetingLayer[], steps = 1, newId: () => string = () => crypto.randomUUID()): GreetingLayer[] {
	return layers.map((layer) => ({ ...structuredClone(layer), id: newId(), x: clampPercent(layer.x + PASTE_OFFSET.x * steps), y: clampPercent(layer.y + PASTE_OFFSET.y * steps) }) as GreetingLayer);
}

/** 클립보드 붙여넣기 — 누를 때마다 오프셋이 한 칸씩 커져요. 비어 있으면 빈 배열 */
export function pasteLayers(newId?: () => string): GreetingLayer[] {
	if (!clipboard) return [];
	clipboard.pastes += 1;
	return cloneLayers(clipboard.layers, clipboard.pastes, newId);
}

/** 레이어 배열에 복사본을 맨 위에 쌓아요 — 상한을 넘으면 넘는 만큼 잘라요 */
export function appendWithinLimit(existing: readonly GreetingLayer[], added: readonly GreetingLayer[]): GreetingLayer[] {
	return [...existing, ...added.slice(0, Math.max(0, MAX_GREETING_LAYERS - existing.length))];
}
