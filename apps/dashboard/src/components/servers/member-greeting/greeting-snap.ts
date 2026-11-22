/**
 * 인사 카드 편집기 스냅·정렬 가이드 — 드래그 중인 박스의 가장자리·가운데를 카드 중앙선·가장자리·다른 레이어에 붙여요.
 * DOM·canvas 없이 박스 숫자만 다루는 순수 함수라서 단위 테스트가 쉬워요. 좌표는 카드 px(1200×675)예요.
 */

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** 화면에 그릴 가이드선 — axis 'x'는 세로선(x = pos), 'y'는 가로선(y = pos), from~to는 다른 축 범위예요 */
export interface SnapGuide {
	axis: "x" | "y";
	pos: number;
	from: number;
	to: number;
}

export interface SnapResult {
	/** 움직임에 더할 보정값(px) — 스냅이 없으면 0 */
	dx: number;
	dy: number;
	guides: SnapGuide[];
}

/** 박스 여러 개를 감싸는 가장 작은 박스 — 비어 있으면 null */
export function unionBox(boxes: readonly Box[]): Box | null {
	if (boxes.length === 0) return null;
	const left = Math.min(...boxes.map((box) => box.x));
	const top = Math.min(...boxes.map((box) => box.y));
	const right = Math.max(...boxes.map((box) => box.x + box.w));
	const bottom = Math.max(...boxes.map((box) => box.y + box.h));
	return { x: left, y: top, w: right - left, h: bottom - top };
}

/** 두 박스가 한 점이라도 겹치는지 — 마퀴 선택용이에요 */
export function boxesIntersect(a: Box, b: Box): boolean {
	return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

/** 두 점으로 만든 사각형 (드래그 방향 무관) */
export function boxFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Box {
	return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

interface Target {
	pos: number;
	/** 다른 축에서 이 목표가 차지하는 범위 — 카드 기준선은 카드 전체예요 */
	from: number;
	to: number;
}

function xs(box: Box): number[] {
	return [box.x, box.x + box.w / 2, box.x + box.w];
}
function ys(box: Box): number[] {
	return [box.y, box.y + box.h / 2, box.y + box.h];
}

/** 한 축에서 가장 가까운 (움직이는 쪽 선, 목표선) 쌍의 거리 보정값 — 한계(threshold) 밖이면 null */
function bestOffset(edges: readonly number[], targets: readonly Target[], threshold: number): number | null {
	let best: number | null = null;
	for (const edge of edges) {
		for (const target of targets) {
			const delta = target.pos - edge;
			if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best))) best = delta;
		}
	}
	return best;
}

/**
 * 움직이는 박스(`moving`, 이미 이동한 위치)를 목표선에 붙이는 보정값과 가이드선을 구해요.
 * 목표: 카드 가장자리·가운데, 그리고 `others`(움직이지 않는 레이어)의 가장자리·가운데예요. `threshold`는 붙는 거리(px)예요.
 */
export function snapBox(moving: Box, others: readonly Box[], card: { w: number; h: number }, threshold: number): SnapResult {
	const xTargets: Target[] = [0, card.w / 2, card.w].map((pos) => ({ pos, from: 0, to: card.h }));
	const yTargets: Target[] = [0, card.h / 2, card.h].map((pos) => ({ pos, from: 0, to: card.w }));
	for (const other of others) {
		for (const pos of xs(other)) xTargets.push({ pos, from: other.y, to: other.y + other.h });
		for (const pos of ys(other)) yTargets.push({ pos, from: other.x, to: other.x + other.w });
	}
	const dx = bestOffset(xs(moving), xTargets, threshold) ?? 0;
	const dy = bestOffset(ys(moving), yTargets, threshold) ?? 0;
	const snapped: Box = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h };

	const guides: SnapGuide[] = [];
	const seen = new Set<string>();
	for (const target of xTargets) {
		if (!xs(snapped).some((edge) => Math.abs(edge - target.pos) < 0.5)) continue;
		const key = `x${target.pos}:${target.from}:${target.to}`;
		if (seen.has(key)) continue;
		seen.add(key);
		guides.push({ axis: "x", pos: target.pos, from: Math.min(target.from, snapped.y), to: Math.max(target.to, snapped.y + snapped.h) });
	}
	for (const target of yTargets) {
		if (!ys(snapped).some((edge) => Math.abs(edge - target.pos) < 0.5)) continue;
		const key = `y${target.pos}:${target.from}:${target.to}`;
		if (seen.has(key)) continue;
		seen.add(key);
		guides.push({ axis: "y", pos: target.pos, from: Math.min(target.from, snapped.x), to: Math.max(target.to, snapped.x + snapped.w) });
	}
	return { dx, dy, guides };
}
