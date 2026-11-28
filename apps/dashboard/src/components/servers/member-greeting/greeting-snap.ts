export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface SnapGuide {
	axis: "x" | "y";
	pos: number;
	from: number;
	to: number;
}

export interface SnapResult {
	dx: number;
	dy: number;
	guides: SnapGuide[];
}

export function unionBox(boxes: readonly Box[]): Box | null {
	if (boxes.length === 0) return null;
	const left = Math.min(...boxes.map((box) => box.x));
	const top = Math.min(...boxes.map((box) => box.y));
	const right = Math.max(...boxes.map((box) => box.x + box.w));
	const bottom = Math.max(...boxes.map((box) => box.y + box.h));
	return { x: left, y: top, w: right - left, h: bottom - top };
}

export function boxesIntersect(a: Box, b: Box): boolean {
	return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

export function boxFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Box {
	return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

interface Target {
	pos: number;
	from: number;
	to: number;
}

function xs(box: Box): number[] {
	return [box.x, box.x + box.w / 2, box.x + box.w];
}
function ys(box: Box): number[] {
	return [box.y, box.y + box.h / 2, box.y + box.h];
}

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
