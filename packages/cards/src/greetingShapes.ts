// Shapes are inset by half the stroke width so borders stay inside the box.
import type { GreetingShapeKind, GreetingShapeLayer } from '@sirubot/utils/memberGreeting';
import type { CardElement } from './kit.js';

type Attrs = Record<string, string | number>;

const round = (value: number): number => Math.round(value * 100) / 100;

function svgEl(type: string, attrs: Attrs, children?: CardElement[]): CardElement {
	return { type, props: { ...attrs, ...(children ? { children } : {}) } } as unknown as CardElement;
}

function polygon(points: [number, number][]): string {
	return points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
}

function starPoints(x: number, y: number, w: number, h: number): [number, number][] {
	const cx = x + w / 2;
	const cy = y + h / 2;
	const points: [number, number][] = [];
	for (let i = 0; i < 10; i += 1) {
		const angle = -Math.PI / 2 + (i * Math.PI) / 5;
		const k = i % 2 === 0 ? 1 : 0.45;
		points.push([cx + Math.cos(angle) * (w / 2) * k, cy + Math.sin(angle) * (h / 2) * k]);
	}
	return points;
}

/** Coordinates are scaled directly (not via a transform) so the stroke width stays constant. */
function heartPath(x: number, y: number, w: number, h: number): string {
	const sx = (n: number) => round(x + (n / 100) * w);
	const sy = (n: number) => round(y + (n / 100) * h);
	return (
		`M${sx(50)} ${sy(92)} C${sx(12)} ${sy(62)} ${sx(0)} ${sy(36)} ${sx(14)} ${sy(18)} ` +
		`C${sx(27)} ${sy(2)} ${sx(45)} ${sy(8)} ${sx(50)} ${sy(26)} ` +
		`C${sx(55)} ${sy(8)} ${sx(73)} ${sy(2)} ${sx(86)} ${sy(18)} ` +
		`C${sx(100)} ${sy(36)} ${sx(88)} ${sy(62)} ${sx(50)} ${sy(92)} Z`
	);
}

function shapeElement(kind: GreetingShapeKind, w: number, h: number, inset: number, radius: number, paint: Attrs): CardElement {
	const x = inset;
	const y = inset;
	const iw = Math.max(1, w - inset * 2);
	const ih = Math.max(1, h - inset * 2);
	switch (kind) {
		case 'rect': {
			const r = Math.min(radius, iw / 2, ih / 2);
			return svgEl('rect', { x, y, width: iw, height: ih, rx: r, ry: r, ...paint });
		}
		case 'circle':
			return svgEl('ellipse', { cx: round(x + iw / 2), cy: round(y + ih / 2), rx: round(iw / 2), ry: round(ih / 2), ...paint });
		case 'triangle':
			return svgEl('polygon', {
				points: polygon([
					[x + iw / 2, y],
					[x + iw, y + ih],
					[x, y + ih]
				]),
				strokeLinejoin: 'round',
				...paint
			});
		case 'diamond':
			return svgEl('polygon', {
				points: polygon([
					[x + iw / 2, y],
					[x + iw, y + ih / 2],
					[x + iw / 2, y + ih],
					[x, y + ih / 2]
				]),
				strokeLinejoin: 'round',
				...paint
			});
		case 'hexagon':
			return svgEl('polygon', {
				points: polygon([
					[x + iw * 0.25, y],
					[x + iw * 0.75, y],
					[x + iw, y + ih / 2],
					[x + iw * 0.75, y + ih],
					[x + iw * 0.25, y + ih],
					[x, y + ih / 2]
				]),
				strokeLinejoin: 'round',
				...paint
			});
		case 'star':
			return svgEl('polygon', { points: polygon(starPoints(x, y, iw, ih)), strokeLinejoin: 'round', ...paint });
		case 'heart':
			return svgEl('path', { d: heartPath(x, y, iw, ih), strokeLinejoin: 'round', ...paint });
	}
}

export function shapeSvg(layer: GreetingShapeLayer): CardElement {
	const w = layer.width;
	const h = layer.height;
	const strokeWidth = layer.strokeColor && (layer.strokeWidth ?? 0) > 0 ? (layer.strokeWidth ?? 0) : 0;
	const filled = layer.filled !== false;
	const gradientId = `g-${layer.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const useGradient = filled && Boolean(layer.gradientTo);

	let fill = 'none';
	if (filled) fill = useGradient ? `url(#${gradientId})` : layer.color;
	const paint: Attrs = { fill };
	if (strokeWidth > 0 && layer.strokeColor) {
		paint.stroke = layer.strokeColor;
		paint.strokeWidth = strokeWidth;
	}

	const children: CardElement[] = [];
	if (useGradient && layer.gradientTo) {
		const angle = ((layer.gradientAngle ?? 45) * Math.PI) / 180;
		const x2 = 0.5 + 0.5 * Math.cos(angle);
		const y2 = 0.5 + 0.5 * Math.sin(angle);
		children.push(
			svgEl('defs', {}, [
				svgEl('linearGradient', { id: gradientId, x1: round(1 - x2), y1: round(1 - y2), x2: round(x2), y2: round(y2) }, [
					svgEl('stop', { offset: 0, stopColor: layer.color }),
					svgEl('stop', { offset: 1, stopColor: layer.gradientTo })
				])
			])
		);
	}
	children.push(shapeElement(layer.shape, w, h, strokeWidth / 2, layer.radius ?? 0, paint));
	return svgEl('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}` }, children);
}
