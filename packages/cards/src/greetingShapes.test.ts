import { describe, expect, it } from 'vitest';
import { GREETING_SHAPES, type GreetingShapeLayer } from '@sirubot/utils/memberGreeting';
import type { CardElement } from './kit.js';
import { shapeSvg } from './greetingShapes.js';

const layer = (patch: Partial<GreetingShapeLayer> = {}): GreetingShapeLayer => ({
	id: 'sh 1',
	type: 'shape',
	shape: 'rect',
	x: 50,
	y: 50,
	width: 200,
	height: 100,
	color: '#ff0000',
	opacity: 1,
	...patch
});

const kids = (node: CardElement): CardElement[] => (node.props.children as CardElement[] | undefined) ?? [];
const shapeOf = (node: CardElement): CardElement => kids(node).at(-1)!;

describe('shapeSvg', () => {
	it('모든 도형 종류를 박스 크기의 svg 하나로 만들어요', () => {
		for (const kind of GREETING_SHAPES) {
			const svg = shapeSvg(layer({ shape: kind }));
			expect(svg.type).toBe('svg');
			expect(svg.props).toMatchObject({ width: 200, height: 100, viewBox: '0 0 200 100' });
			expect(shapeOf(svg).props.fill).toBe('#ff0000');
		}
	});

	it('사각형 둥글기는 짧은 변의 절반을 넘지 않아요', () => {
		expect(shapeOf(shapeSvg(layer({ radius: 24 }))).props).toMatchObject({ rx: 24, ry: 24 });
		expect(shapeOf(shapeSvg(layer({ radius: 999 }))).props).toMatchObject({ rx: 50, ry: 50 });
	});

	it('gradientTo가 있으면 linearGradient를 정의하고 fill이 그걸 가리켜요', () => {
		const svg = shapeSvg(layer({ gradientTo: '#0000ff', gradientAngle: 90 }));
		const [defs] = kids(svg);
		expect(defs!.type).toBe('defs');
		const gradient = kids(defs!)[0]!;
		// 90도 = 위→아래
		expect(gradient.props).toMatchObject({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
		expect(shapeOf(svg).props.fill).toBe(`url(#${gradient.props.id})`);
		expect(String(gradient.props.id)).not.toMatch(/\s/);
	});

	it('filled:false는 안쪽을 비우고 테두리만 그려요', () => {
		const props = shapeOf(shapeSvg(layer({ filled: false, strokeColor: '#00ff00', strokeWidth: 8 }))).props;
		expect(props).toMatchObject({ fill: 'none', stroke: '#00ff00', strokeWidth: 8 });
	});

	it('테두리는 박스 안쪽으로 두께의 절반만큼 줄여서 그려요', () => {
		expect(shapeOf(shapeSvg(layer({ strokeColor: '#00ff00', strokeWidth: 10 }))).props).toMatchObject({ x: 5, y: 5, width: 190, height: 90 });
	});

	it('strokeWidth가 0이거나 색이 없으면 테두리를 안 그려요', () => {
		expect(shapeOf(shapeSvg(layer({ strokeColor: '#00ff00', strokeWidth: 0 }))).props).not.toHaveProperty('stroke');
		expect(shapeOf(shapeSvg(layer({ strokeWidth: 6 }))).props).not.toHaveProperty('stroke');
	});
});
