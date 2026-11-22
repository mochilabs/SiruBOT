import { GREETING_CARD_H, GREETING_CARD_W, GREETING_TEMPLATES, type GreetingImage, type GreetingLayer } from '@sirubot/utils/memberGreeting';
import { describe, expect, it } from 'vitest';
import { type CardChild, type CardElement } from './kit.js';
import { greetingCard, type GreetingCardVars } from './greetingCard.js';

const vars: GreetingCardVars = { displayName: '시루', guildName: '시루봇 서버', memberCount: 42, avatar: null };

function image(layers: GreetingLayer[], presetId: string | null = 'rose', dataUri: string | null = null): GreetingImage {
	return { background: { presetId, dataUri }, layers };
}

const children = (node: CardElement): CardChild[] => {
	const value = node.props.children;
	return Array.isArray(value) ? value : value == null ? [] : [value];
};
const style = (node: CardChild): Record<string, string | number> => (node as CardElement).props.style ?? {};

/** 루트의 자식 중 배경(4개 이하)을 뺀 레이어 노드 — 프리셋 배경은 4장, 업로드 배경은 1장이에요 */
function layerNodes(node: CardElement, backgroundCount = 4): CardElement[] {
	return children(node).slice(backgroundCount) as CardElement[];
}

/** 텍스트 노드의 실제 글자 */
function textOf(node: CardElement): string | null {
	const inner = children(node)[0] as CardElement | null | undefined;
	return inner ? (inner.props.children as string) : null;
}

describe('greetingCard — 좌표 계약', () => {
	it('루트는 1200×675 카드예요', () => {
		const root = greetingCard(image([]), vars);
		expect(style(root)).toMatchObject({ width: GREETING_CARD_W, height: GREETING_CARD_H, position: 'relative', overflow: 'hidden' });
	});

	it('아바타는 x/y %를 중심으로 지름 size, 링은 6px 더 크게 놓여요', () => {
		const root = greetingCard(image([{ id: 'a', type: 'avatar', x: 25, y: 50, size: 200, ringColor: '#ffffff' }]), vars);
		const [avatar] = layerNodes(root);
		// 중심 (300, 337.5), 링 지름 212
		expect(style(avatar!)).toMatchObject({ left: 300 - 106, top: 337.5 - 106, width: 212, height: 212, backgroundColor: '#ffffff' });
	});

	it('아바타 이미지가 없으면 ♪ 자리표시자, 있으면 img를 써요', () => {
		const layer: GreetingLayer = { id: 'a', type: 'avatar', x: 50, y: 50, size: 100, ringColor: '#fff000' };
		const placeholder = children(layerNodes(greetingCard(image([layer]), vars))[0]!)[0] as CardElement;
		expect(placeholder.props.children).toBe('♪');
		const withImage = children(layerNodes(greetingCard(image([layer]), { ...vars, avatar: 'data:image/png;base64,AAAA' }))[0]!)[0] as CardElement;
		expect(withImage.type).toBe('img');
		expect(withImage.props.src).toBe('data:image/png;base64,AAAA');
	});

	it('도형은 중심 기준 래퍼 div 안의 svg이고 opacity를 래퍼에 써요', () => {
		const root = greetingCard(
			image([
				{ id: 'r', type: 'shape', shape: 'rect', x: 50, y: 50, width: 1200, height: 220, color: '#231a10', opacity: 0.55 },
				{ id: 'c', type: 'shape', shape: 'circle', x: 50, y: 38, width: 360, height: 360, color: '#fff0d6', opacity: 0.25 }
			]),
			vars
		);
		const [rect, circle] = layerNodes(root);
		expect(style(rect!)).toMatchObject({ left: 0, top: 337.5 - 110, width: 1200, height: 220, opacity: 0.55 });
		expect(style(circle!)).toMatchObject({ left: 600 - 180, top: 256.5 - 180, width: 360, opacity: 0.25 });
		expect(style(rect!)).not.toHaveProperty('transform');
		const svg = children(circle!)[0] as CardElement;
		expect(svg.type).toBe('svg');
		expect((svg.props.children as CardElement[]).at(-1)!.type).toBe('ellipse');
	});

	it('회전·흐림은 래퍼 스타일에 입혀요 (텍스트는 기준점을 원점으로 회전해요)', () => {
		const shape = layerNodes(
			greetingCard(
				image([
					{
						id: 's',
						type: 'shape',
						shape: 'star',
						x: 50,
						y: 50,
						width: 100,
						height: 100,
						color: '#ffffff',
						opacity: 1,
						rotation: 30,
						blur: 12
					}
				]),
				vars
			)
		)[0]!;
		expect(style(shape)).toMatchObject({ transform: 'rotate(30deg)', filter: 'blur(12px)' });
		const text = layerNodes(
			greetingCard(
				image([{ id: 't', type: 'text', x: 20, y: 40, size: 40, color: '#ffffff', bold: true, align: 'left', text: '안녕', rotation: -10 }]),
				vars
			)
		)[0]!;
		expect(style(text)).toMatchObject({ transform: 'rotate(-10deg)' });
		expect(String(style(text).transformOrigin)).toMatch(/^0px /);
	});

	it('이미지 레이어는 dataUri를 width×height로 중심 기준에 놓아요', () => {
		const root = greetingCard(
			image([{ id: 'i', type: 'image', x: 50, y: 50, width: 200, height: 100, dataUri: 'data:image/png;base64,AAAA', opacity: 0.5 }]),
			vars
		);
		const [sticker] = layerNodes(root);
		expect(sticker!.type).toBe('img');
		expect(style(sticker!)).toMatchObject({ left: 500, top: 337.5 - 50, width: 200, height: 100, opacity: 0.5 });
	});

	it('숨김 레이어는 건너뛰고 나머지는 배열 순서(z-order) 그대로예요', () => {
		const root = greetingCard(
			image([
				{ id: 'a', type: 'shape', shape: 'rect', x: 10, y: 10, width: 10, height: 10, color: '#111111', opacity: 1 },
				{ id: 'b', type: 'shape', shape: 'rect', x: 20, y: 20, width: 10, height: 10, color: '#222222', opacity: 1, hidden: true },
				{ id: 'c', type: 'shape', shape: 'rect', x: 30, y: 30, width: 10, height: 10, color: '#333333', opacity: 1 }
			]),
			vars
		);
		const fills = layerNodes(root).map((node) => ((children(node)[0] as CardElement).props.children as CardElement[]).at(-1)!.props.fill);
		expect(fills).toEqual(['#111111', '#333333']);
	});
});

describe('greetingCard — 텍스트', () => {
	const text = (align: 'left' | 'center' | 'right', x: number): CardElement =>
		layerNodes(greetingCard(image([{ id: 't', type: 'text', x, y: 40, size: 40, color: '#ffffff', bold: true, align, text: '안녕' }]), vars))[0]!;

	it('가까운 가장자리까지의 폭으로 최대 폭을 제한하고 align에 따라 기준점을 잡아요', () => {
		// x=50% → cx 600, maxW = 2*600 - 64 = 1136
		expect(style(text('center', 50))).toMatchObject({ left: 600 - 568, width: 1136, justifyContent: 'center' });
		expect(style(text('left', 50))).toMatchObject({ left: 600, justifyContent: 'flex-start' });
		expect(style(text('right', 50))).toMatchObject({ left: 600 - 1136, justifyContent: 'flex-end' });
		// x=8% → cx 96, maxW = max(120, 192 - 64) = 128
		expect(style(text('left', 8))).toMatchObject({ left: 96, width: 128 });
		// 가장자리에 아주 가까우면 최소 폭 120
		expect(style(text('left', 1))).toMatchObject({ width: 120 });
	});

	it('y %는 텍스트 상자의 세로 중심이에요', () => {
		const box = style(text('center', 50));
		expect(Number(box.top) + Number(box.height) / 2).toBeCloseTo(0.4 * GREETING_CARD_H, 5);
	});

	it('굵기는 bold면 900, 아니면 600이에요 (두 런타임이 공유하는 정적 서브셋)', () => {
		const bold = children(text('center', 50))[0] as CardElement;
		expect(bold.props.style).toMatchObject({ fontWeight: 900, fontSize: 40, color: '#ffffff' });
		const regular = layerNodes(
			greetingCard(image([{ id: 't', type: 'text', x: 50, y: 40, size: 24, color: '#eeeeee', bold: false, align: 'center', text: 'x' }]), vars)
		)[0]!;
		expect((children(regular)[0] as CardElement).props.style).toMatchObject({ fontWeight: 600 });
	});

	it('템플릿 변수를 치환하고 {유저}는 표시 이름으로 폴백해요', () => {
		const root = greetingCard(
			image([
				{
					id: 't',
					type: 'text',
					x: 50,
					y: 50,
					size: 30,
					color: '#fff000',
					bold: false,
					align: 'center',
					text: '{유저} {유저이름} {서버} {멤버수}'
				}
			]),
			vars
		);
		expect(textOf(layerNodes(root)[0]!)).toBe('시루 시루 시루봇 서버 42');
	});

	it('색 이모지는 그대로 두고(렌더러가 Twemoji로 그려요), 비면 글자 노드를 만들지 않아요', () => {
		const make = (value: string) =>
			layerNodes(
				greetingCard(
					image([{ id: 't', type: 'text', x: 50, y: 50, size: 30, color: '#fff000', bold: false, align: 'center', text: value }]),
					vars
				)
			)[0]!;
		expect(textOf(make('환영해요 🎉'))).toBe('환영해요 🎉');
		expect(textOf(make('🎉'))).toBe('🎉');
		expect(textOf(make('   '))).toBeNull();
	});
});

describe('greetingCard — 배경', () => {
	it('프리셋은 바닥색 → 대각 그라디언트 → 코너 글로우 → 스크림 4장이에요', () => {
		const root = greetingCard(image([], 'rose'), vars);
		const [base, linear, glow, scrim] = children(root);
		expect(style(base!).backgroundColor).toBe('#3d2328');
		// canvas 그라디언트 (0,675)→(1200,0)와 같은 벡터: CSS 각도 atan2(1200, 675)
		expect(style(linear!).backgroundImage).toBe('linear-gradient(60.64deg, #d1608a 0%, #ff85c1 100%)');
		expect(style(glow!).backgroundImage).toBe(
			'radial-gradient(circle 660px at 936px 148.5px, rgba(255,228,240,0.2) 0%, rgba(255,228,240,0) 100%)'
		);
		expect(style(scrim!).backgroundColor).toBe('rgba(26,14,18,0.32)');
	});

	it('알 수 없는 프리셋·null은 plum으로 폴백해요', () => {
		for (const presetId of [null, 'nope']) {
			const [base] = children(greetingCard(image([], presetId), vars));
			expect(style(base!).backgroundColor).toBe('#1a0e12');
		}
	});

	it('업로드 배경은 cover-fit img 한 장이고 프리셋 배경을 깔지 않아요', () => {
		const root = greetingCard(image([], 'rose', 'data:image/jpeg;base64,AAAA'), vars);
		expect(children(root)).toHaveLength(1);
		const [bg] = children(root) as CardElement[];
		expect(bg!.type).toBe('img');
		expect(style(bg!)).toMatchObject({ width: '100%', height: '100%', objectFit: 'cover' });
	});
});

describe('greetingCard — 모든 템플릿', () => {
	it('GREETING_TEMPLATES 전부 예외 없이 노드를 만들고 직렬화돼요', () => {
		expect(GREETING_TEMPLATES.length).toBeGreaterThan(0);
		for (const template of GREETING_TEMPLATES) {
			const node = greetingCard(template.image, vars);
			expect(node.type).toBe('div');
			// 숨김이 없는 템플릿은 배경 4장 + 레이어 수만큼 자식이 있어요
			expect(children(node)).toHaveLength(4 + template.image.layers.filter((layer) => !layer.hidden).length);
			// Takumi에 넘길 순수 데이터예요 — 함수·순환이 없어야 해요
			expect(() => JSON.stringify(node)).not.toThrow();
		}
	});
});

describe('greetingCard — 텍스트 효과 (P-17)', () => {
	const text = (extra: Partial<Extract<GreetingLayer, { type: 'text' }>> = {}): GreetingLayer => ({
		id: 't',
		type: 'text',
		x: 50,
		y: 50,
		size: 40,
		color: '#ffffff',
		bold: false,
		align: 'center',
		text: '안녕',
		...extra
	});
	const inner = (layer: GreetingLayer): Record<string, string | number> => style(children(layerNodes(greetingCard(image([layer]), vars))[0]!)[0]!);
	const outer = (layer: GreetingLayer): Record<string, string | number> => style(layerNodes(greetingCard(image([layer]), vars))[0]!);

	it('효과 필드가 없으면 예전 스타일 그대로예요 (600/900, 줄 간격 1.25, 기본 그림자, 한 줄 말줄임)', () => {
		expect(inner(text())).toEqual({
			display: 'flex',
			maxWidth: 1200 - 64,
			fontSize: 40,
			fontWeight: 600,
			lineHeight: 1.25,
			color: '#ffffff',
			overflow: 'hidden',
			textOverflow: 'ellipsis',
			whiteSpace: 'nowrap',
			textShadow: '0 2px 10px rgba(0,0,0,0.45)'
		});
		expect(inner(text({ bold: true })).fontWeight).toBe(900);
		expect(outer(text())).toMatchObject({ width: 1200 - 64, height: 60 });
	});

	it('weight가 bold보다 우선해요', () => {
		for (const weight of [400, 600, 700, 900] as const) expect(inner(text({ bold: true, weight })).fontWeight).toBe(weight);
	});

	it('글자 간격·줄 간격을 반영해요', () => {
		expect(inner(text({ letterSpacing: 6, lineHeight: 1.6 }))).toMatchObject({ letterSpacing: '6px', lineHeight: 1.6 });
		expect(inner(text({ letterSpacing: 0 }))).not.toHaveProperty('letterSpacing');
	});

	it('그림자: 지정하면 교체, null이면 제거해요', () => {
		const shadow = { color: '#ff0000', opacity: 0.5, blur: 4, offsetX: 3, offsetY: -2 };
		expect(inner(text({ shadow })).textShadow).toBe('3px -2px 4px rgba(255, 0, 0, 0.5)');
		expect(inner(text({ shadow: null }))).not.toHaveProperty('textShadow');
	});

	it('외곽선은 -webkit-text-stroke이고 두께 0이면 그리지 않아요', () => {
		expect(inner(text({ stroke: { color: '#000000', width: 4 } })).WebkitTextStroke).toBe('4px #000000');
		expect(inner(text({ stroke: { color: '#000000', width: 0 } }))).not.toHaveProperty('WebkitTextStroke');
	});

	it('그라디언트 글자는 background-clip: text와 투명 글자색이에요 (0° = 왼→오른쪽)', () => {
		const style0 = inner(text({ color: '#ff0000', gradient: { to: '#0000ff' } }));
		expect(style0).toMatchObject({ backgroundClip: 'text', color: 'transparent', backgroundImage: 'linear-gradient(90deg, #ff0000, #0000ff)' });
		expect(inner(text({ gradient: { to: '#0000ff', angle: 90 } })).backgroundImage).toContain('180deg');
	});

	it('maxWidth + wrap은 줄바꿈 박스이고 maxLines는 높이를 잘라요', () => {
		const wrapped = text({ maxWidth: 300, size: 30, lineHeight: 1.2, maxLines: 2 });
		expect(outer(wrapped)).toMatchObject({ width: 300, left: 450, height: Math.ceil(30 * 1.2 * 2) });
		expect(inner(wrapped)).toMatchObject({ maxWidth: 300, textAlign: 'center', maxHeight: 72, overflow: 'hidden', textOverflow: 'ellipsis' });
		expect(inner(wrapped)).not.toHaveProperty('whiteSpace');
		// 줄 수 제한이 없으면 높이를 자르지 않아요
		expect(inner(text({ maxWidth: 300 }))).not.toHaveProperty('maxHeight');
	});

	it("overflow 'ellipsis'면 maxWidth 폭의 한 줄 말줄임이에요", () => {
		const layer = text({ maxWidth: 200, overflow: 'ellipsis', align: 'left', x: 10 });
		expect(outer(layer)).toMatchObject({ width: 200, left: 120, height: 60 });
		expect(inner(layer)).toMatchObject({ whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 200 });
	});

	it('회전의 변환 원점은 기준점이에요 (정렬별)', () => {
		expect(outer(text({ rotation: 10, maxWidth: 300, align: 'left' })).transformOrigin).toMatch(/^0px /);
		expect(outer(text({ rotation: 10, maxWidth: 300, align: 'right' })).transformOrigin).toMatch(/^300px /);
	});
});

describe('greetingCard — 아바타 옵션 (P-17)', () => {
	const avatar = (extra: Partial<Extract<GreetingLayer, { type: 'avatar' }>> = {}): GreetingLayer => ({
		id: 'a',
		type: 'avatar',
		x: 50,
		y: 50,
		size: 200,
		ringColor: '#ffffff',
		...extra
	});
	const ring = (layer: GreetingLayer, avatarSrc: string | null = null) =>
		layerNodes(greetingCard(image([layer]), { ...vars, avatar: avatarSrc }))[0]!;
	const content = (layer: GreetingLayer, avatarSrc: string | null = null) => children(ring(layer, avatarSrc))[0] as CardElement;

	it('옵션이 없으면 예전 원형 링(+6px)이에요', () => {
		expect(style(ring(avatar()))).toMatchObject({ width: 212, height: 212, borderRadius: 9999 });
		expect(style(ring(avatar()))).not.toHaveProperty('boxShadow');
		expect(style(content(avatar())).borderRadius).toBe(9999);
	});

	it('ringWidth는 링 지름을 바꾸고 0이면 이미지 크기와 같아요', () => {
		expect(style(ring(avatar({ ringWidth: 14 })))).toMatchObject({ width: 228, left: 600 - 114 });
		expect(style(ring(avatar({ ringWidth: 0 })))).toMatchObject({ width: 200, height: 200 });
	});

	it('모양: rounded는 cornerRadius(기본 22%)와 링 두께만큼 바깥 반경, square는 0이에요', () => {
		expect(style(ring(avatar({ shape: 'rounded' })))).toMatchObject({ borderRadius: 44 + 6 });
		expect(style(content(avatar({ shape: 'rounded' }))).borderRadius).toBe(44);
		expect(style(ring(avatar({ shape: 'rounded', cornerRadius: 30, ringWidth: 10 })))).toMatchObject({ borderRadius: 40 });
		expect(style(ring(avatar({ shape: 'square' }))).borderRadius).toBe(0);
		// 이미지가 있어도 같은 반경으로 잘라요
		expect(style(content(avatar({ shape: 'rounded', cornerRadius: 30 }), 'data:image/png;base64,AAAA')).borderRadius).toBe(30);
	});

	it('그림자와 글로우는 box-shadow 한 줄로 합쳐져요', () => {
		const shadow = { color: '#000000', opacity: 0.6, blur: 20, offsetX: 4, offsetY: 8 };
		const glow = { color: '#ff0000', opacity: 0.9, blur: 30, spread: 6 };
		expect(style(ring(avatar({ shadow }))).boxShadow).toBe('4px 8px 20px rgba(0, 0, 0, 0.6)');
		expect(style(ring(avatar({ glow }))).boxShadow).toBe('0 0 30px 6px rgba(255, 0, 0, 0.9)');
		expect(style(ring(avatar({ shadow, glow }))).boxShadow).toBe('4px 8px 20px rgba(0, 0, 0, 0.6), 0 0 30px 6px rgba(255, 0, 0, 0.9)');
		expect(style(ring(avatar({ shadow: null, glow: null })))).not.toHaveProperty('boxShadow');
	});
});
