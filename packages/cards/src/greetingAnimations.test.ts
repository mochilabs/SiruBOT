import { describe, expect, it } from 'vitest';
import { GREETING_ANIMATIONS, type GreetingAnimation, type GreetingImage, type GreetingLayer } from '@sirubot/utils/memberGreeting';
import { animationDeclaration, animationName, animationPeriodMs, greetingAnimationCss } from './greetingAnimations.js';
import { greetingCard, type GreetingCardVars } from './greetingCard.js';
import type { CardElement } from './kit.js';

const anim = (patch: Partial<GreetingAnimation> = {}): GreetingAnimation => ({
	type: 'float',
	durationMs: 2000,
	delayMs: 0,
	intensity: 0.5,
	...patch
});
const shape = (id: string, animation?: GreetingAnimation, extra: Partial<GreetingLayer> = {}): GreetingLayer =>
	({
		id,
		type: 'shape',
		shape: 'circle',
		x: 50,
		y: 50,
		width: 100,
		height: 100,
		color: '#ffffff',
		opacity: 1,
		...(animation ? { animation } : {}),
		...extra
	}) as GreetingLayer;
const image = (layers: GreetingLayer[]): GreetingImage => ({ background: { presetId: 'rose', dataUri: null }, layers });
const vars: GreetingCardVars = { displayName: '시루', guildName: '서버', memberCount: 3, avatar: null };

describe('greetingAnimationCss', () => {
	it('움직임이 없으면 빈 문자열이에요', () => {
		expect(greetingAnimationCss(image([shape('a')]))).toBe('');
	});

	it('같은 (종류, 세기)는 키프레임을 한 번만 만들어요', () => {
		const css = greetingAnimationCss(image([shape('a', anim()), shape('b', anim()), shape('c', anim({ intensity: 1 }))]));
		expect(css.match(/@keyframes/g)).toHaveLength(2);
	});

	it('숨김 레이어의 움직임은 건너뛰어요', () => {
		expect(greetingAnimationCss(image([shape('a', anim(), { hidden: true })]))).toBe('');
	});

	it('모든 종류가 0%와 100%가 같은 닫힌 키프레임이에요', () => {
		for (const type of GREETING_ANIMATIONS) {
			const css = greetingAnimationCss(image([shape('a', anim({ type }))]));
			const zero = /0% \{ ([^}]*) \}/.exec(css)?.[1];
			const hundred = /100% \{ ([^}]*) \}/.exec(css)?.[1];
			if (type === 'spin') continue; // 0deg ↔ 360deg는 값이 달라야 해요 — 아래 테스트가 따로 검증
			expect(zero, type).toBe(hundred);
		}
	});

	it('회전은 0/50/100% 3분할이에요 (두 키프레임 0→360은 정지 프레임이 돼요)', () => {
		const css = greetingAnimationCss(image([shape('a', anim({ type: 'spin' }))]));
		expect(css).toContain('0% { transform: rotate(0deg); }');
		expect(css).toContain('50% { transform: rotate(180deg); }');
		expect(css).toContain('100% { transform: rotate(360deg); }');
	});

	it('세기가 클수록 이동 거리가 커져요', () => {
		const px = (intensity: number) =>
			Number(/translateY\(-([\d.]+)px\)/.exec(greetingAnimationCss(image([shape('a', anim({ intensity }))])))![1]);
		expect(px(1)).toBeGreaterThan(px(0));
	});
});

describe('animationPeriodMs / animationDeclaration', () => {
	it('주기를 한 바퀴 길이의 약수로 맞춰요', () => {
		expect(animationPeriodMs(anim({ durationMs: 4000 }), 4000)).toBe(4000);
		expect(animationPeriodMs(anim({ durationMs: 2000 }), 4000)).toBe(2000);
		expect(animationPeriodMs(anim({ durationMs: 1500 }), 4000)).toBeCloseTo(4000 / 3, 1);
		// 한 바퀴보다 긴 주기는 1배로 줄어요
		expect(animationPeriodMs(anim({ durationMs: 9000 }), 4000)).toBe(4000);
	});

	it('지연은 음수 위상 지연으로 바뀌어 반복 경계가 끊기지 않아요', () => {
		expect(animationDeclaration(anim({ durationMs: 2000, delayMs: 500 }), 2000)).toBe(
			`${animationName(anim())} 2000ms ease-in-out -500ms infinite`
		);
		// 주기보다 큰 지연은 주기 안으로 순환해요
		expect(animationDeclaration(anim({ durationMs: 2000, delayMs: 2500 }), 2000)).toContain(' -500ms ');
	});

	it('회전은 linear, 나머지는 ease-in-out이에요', () => {
		expect(animationDeclaration(anim({ type: 'spin' }), 2000)).toContain(' linear ');
		expect(animationDeclaration(anim({ type: 'pulse' }), 2000)).toContain(' ease-in-out ');
	});
});

describe('greetingCard — 움직임 래퍼', () => {
	const kids = (node: CardElement): CardElement[] => [node.props.children ?? []].flat() as CardElement[];
	const style = (node: CardElement) => node.props.style ?? {};

	it('움직임이 있으면 같은 박스의 바깥 div에 animation을 입히고 안쪽은 0,0에 놓아요', () => {
		const root = greetingCard(image([shape('a', anim({ durationMs: 2000 }), { rotation: 30, opacity: 0.4 })]), vars);
		const wrapper = kids(root)[4]!;
		expect(style(wrapper)).toMatchObject({ position: 'absolute', left: 550, top: 287.5, width: 100, height: 100 });
		expect(String(style(wrapper).animation)).toMatch(
			/^ga-float-50 2000ms ease-in-out -0ms infinite$|^ga-float-50 2000ms ease-in-out 0ms infinite$/
		);
		const inner = kids(wrapper)[0]!;
		// 안쪽 레이어의 회전·투명도는 그대로예요 — 움직임과 곱해져요
		expect(style(inner)).toMatchObject({ left: 0, top: 0, opacity: 0.4, transform: 'rotate(30deg)' });
	});

	it('움직임이 없는 레이어는 감싸지 않아요', () => {
		const root = greetingCard(image([shape('a')]), vars);
		expect(style(kids(root)[4]!)).not.toHaveProperty('animation');
	});

	it('텍스트 움직임은 기준점을 변환 원점으로 써요', () => {
		const root = greetingCard(
			image([
				{
					id: 't',
					type: 'text',
					x: 20,
					y: 40,
					size: 40,
					color: '#ffffff',
					bold: true,
					align: 'left',
					text: '안녕',
					animation: anim({ type: 'sway' })
				}
			]),
			vars
		);
		expect(String(style(kids(root)[4]!).transformOrigin)).toMatch(/^0px /);
	});
});
