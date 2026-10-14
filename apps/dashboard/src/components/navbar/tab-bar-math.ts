/** 모바일 탭바 알약의 좌표·제스처 계산이에요. DOM을 건드리지 않는 순수 함수라 계산만 따로 고정해요. */
export interface TabBox {
	x: number;
	width: number;
}

/** 드래그 임계값(px) — 이 미만의 움직임은 탭(클릭)으로 봐요. */
export const DRAG_THRESHOLD = 6;
/** 손끝이 탭바를 벗어나면 저항비율만큼만 따라오고, 최대치에서 멈춰요. */
export const EDGE_RESISTANCE = 0.35;
export const EDGE_MAX = 28;

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** 범위 안에서는 그대로, 밖으로 나가면 저항을 먹인 좌표를 돌려줘요 (고무줄). */
export function rubberBand(value: number, min: number, max: number, resistance = EDGE_RESISTANCE, cap = EDGE_MAX): number {
	if (value < min) return min - Math.min((min - value) * resistance, cap);
	if (value > max) return max + Math.min((value - max) * resistance, cap);
	return value;
}

/** 탭 중심을 지나는 연속 인덱스 (0 = 첫 탭, tabs.length - 1 = 마지막 탭, 사이는 선형). */
export function fractionalIndex(boxes: TabBox[], center: number): number {
	const last = boxes.length - 1;
	if (last < 0) return 0;
	const centers = boxes.map((box) => box.x + box.width / 2);
	if (center <= centers[0]) return 0;
	if (center >= centers[last]) return last;
	for (let index = 0; index < last; index += 1) {
		const span = centers[index + 1] - centers[index];
		if (center <= centers[index + 1]) return span > 0 ? index + (center - centers[index]) / span : index;
	}
	return last;
}

/** 연속 인덱스 위치의 알약 x·폭 — 탭과 탭 사이라프해서 폭이 부드럽게 붙고 떨어져요. */
export function boxAtIndex(boxes: TabBox[], index: number): TabBox {
	const last = boxes.length - 1;
	if (last < 0) return { x: 0, width: 0 };
	const position = clamp(index, 0, last);
	const fromIndex = Math.floor(position);
	const from = boxes[fromIndex];
	const to = boxes[Math.min(fromIndex + 1, last)];
	const mix = position - fromIndex;
	return { x: from.x + (to.x - from.x) * mix, width: from.width + (to.width - from.width) * mix };
}
