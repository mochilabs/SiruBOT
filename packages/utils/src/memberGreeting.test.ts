import { describe, expect, it } from 'vitest';

import {
	DEFAULT_GOODBYE_GREETING,
	DEFAULT_GREETINGS,
	DEFAULT_WELCOME_GREETING,
	GREETING_ANIMATIONS,
	GREETING_AVATAR_SHAPES,
	GREETING_TEXT_WEIGHTS,
	GREETING_SHAPES,
	greetingAnimationDurationMs,
	hasGreetingAnimation,
	GREETING_TEMPLATES,
	greetingConfigSchema,
	PRESET_BACKGROUNDS,
	renderGreetingTemplate,
	validateGreetingConfig
} from './memberGreeting.ts';

/** v2 초창기에 저장됐던 모양 — layout·accentColor 필드가 없어요 */
const LEGACY_CONFIG = {
	version: 2,
	enabled: true,
	channelId: '123456789012345678',
	template: '{유저}님 반가워요!',
	useImage: false,
	image: null
};

describe('greetingConfigSchema — layout / accentColor', () => {
	it('기본 설정에는 컨테이너 레이아웃과 기본 강조색(null)이 들어 있다', () => {
		for (const config of [DEFAULT_WELCOME_GREETING, DEFAULT_GOODBYE_GREETING]) {
			expect(config.layout).toBe('container');
			expect(config.accentColor).toBeNull();
		}
	});

	it('layout·accentColor가 없는 예전 저장값은 기본값을 채워 통과한다', () => {
		const parsed = validateGreetingConfig(LEGACY_CONFIG);
		expect(parsed).not.toBeNull();
		expect(parsed?.layout).toBe('container');
		expect(parsed?.accentColor).toBeNull();
	});

	it('지정한 layout과 accentColor를 그대로 유지한다', () => {
		const parsed = validateGreetingConfig({ ...LEGACY_CONFIG, layout: 'components', accentColor: '#123456' });
		expect(parsed?.layout).toBe('components');
		expect(parsed?.accentColor).toBe('#123456');
	});

	it('accentColor는 #RRGGBB 형식만 받는다', () => {
		expect(validateGreetingConfig({ ...LEGACY_CONFIG, accentColor: '123456' })).toBeNull();
		expect(validateGreetingConfig({ ...LEGACY_CONFIG, accentColor: '#12345' })).toBeNull();
	});

	it('알 수 없는 layout은 거부한다', () => {
		expect(validateGreetingConfig({ ...LEGACY_CONFIG, layout: 'floating' })).toBeNull();
	});
});

describe('renderGreetingTemplate', () => {
	it('템플릿 변수 4개를 모두 치환한다', () => {
		expect(
			renderGreetingTemplate('{유저} {유저이름} {서버} {멤버수}', {
				mention: '<@123>',
				displayName: '시루',
				guildName: '테스트 서버',
				memberCount: 42
			})
		).toBe('<@123> 시루 테스트 서버 42');
	});

	it('mention이 없으면 표시 이름으로 폴백한다', () => {
		expect(
			renderGreetingTemplate('{유저}님 환영해요', {
				mention: null,
				displayName: '시루',
				guildName: '서버',
				memberCount: 1
			})
		).toBe('시루님 환영해요');
	});
});

describe('greetingImageSchema — 레이어 경계값', () => {
	const textLayer = { id: 't1', type: 'text', x: 10, y: 10, size: 24, color: '#ffffff', bold: false, align: 'center', text: '안녕' };

	function withImage(image: unknown) {
		return validateGreetingConfig({ ...LEGACY_CONFIG, useImage: true, image });
	}

	it('DATA_URI는 png/jpeg/webp base64만 허용한다', () => {
		expect(withImage({ background: { presetId: null, dataUri: 'data:image/png;base64,AAAA' }, layers: [textLayer] })).not.toBeNull();
		expect(withImage({ background: { presetId: null, dataUri: 'data:text/plain;base64,AAAA' }, layers: [textLayer] })).toBeNull();
	});

	it('DATA_URI는 1.5MB 상한을 넘으면 거부한다', () => {
		const huge = `data:image/png;base64,${'A'.repeat(1_500_000)}`;
		expect(withImage({ background: { presetId: null, dataUri: huge }, layers: [textLayer] })).toBeNull();
	});

	it('텍스트 size는 12~160만 허용한다', () => {
		const withSize = (size: number) => withImage({ background: { presetId: 'rose', dataUri: null }, layers: [{ ...textLayer, size }] });
		expect(withSize(12)).not.toBeNull();
		expect(withSize(160)).not.toBeNull();
		expect(withSize(11)).toBeNull();
		expect(withSize(161)).toBeNull();
	});

	it('알 수 없는 배경 프리셋은 거부한다', () => {
		expect(withImage({ background: { presetId: 'nope', dataUri: null }, layers: [textLayer] })).toBeNull();
		expect(withImage({ background: { presetId: 'rose', dataUri: null }, layers: [textLayer] })).not.toBeNull();
	});
});

describe('GREETING_TEMPLATES', () => {
	it('모든 템플릿이 스키마를 통과하고 존재하는 배경 프리셋만 써요', () => {
		const presetIds = PRESET_BACKGROUNDS.map((preset) => preset.id);
		const ids = new Set<string>();
		for (const template of GREETING_TEMPLATES) {
			expect(ids.has(template.id)).toBe(false);
			ids.add(template.id);
			expect(presetIds).toContain(template.image.background.presetId);
			expect(validateGreetingConfig({ ...DEFAULT_WELCOME_GREETING, image: template.image })).not.toBeNull();
			const layerIds = template.image.layers.map((layer) => layer.id);
			expect(new Set(layerIds).size).toBe(layerIds.length);
		}
	});
});

describe('도형 레이어 확장 필드', () => {
	const shape = { id: 's', type: 'shape', shape: 'star', x: 50, y: 50, width: 100, height: 100, color: '#ffffff', opacity: 1 } as const;
	const withLayers = (layers: unknown[]) => ({ ...DEFAULT_GREETINGS.welcome, image: { background: { presetId: 'rose', dataUri: null }, layers } });

	it('필수 필드만 있는 예전 도형도 그대로 통과해요', () => {
		expect(greetingConfigSchema.safeParse(withLayers([{ ...shape, shape: 'rect' }])).success).toBe(true);
	});

	it('모든 도형 종류와 선택 필드(회전·둥글기·그라디언트·테두리·흐림)를 받아요', () => {
		for (const kind of GREETING_SHAPES) {
			const layer = {
				...shape,
				shape: kind,
				rotation: -30,
				radius: 24,
				gradientTo: '#000000',
				gradientAngle: 90,
				strokeColor: '#ff0000',
				strokeWidth: 6,
				filled: false,
				blur: 20
			};
			expect(greetingConfigSchema.safeParse(withLayers([layer])).success, kind).toBe(true);
		}
	});

	it('범위를 벗어난 값과 알 수 없는 도형은 거부해요', () => {
		expect(greetingConfigSchema.safeParse(withLayers([{ ...shape, shape: 'blob' }])).success).toBe(false);
		expect(greetingConfigSchema.safeParse(withLayers([{ ...shape, rotation: 400 }])).success).toBe(false);
		expect(greetingConfigSchema.safeParse(withLayers([{ ...shape, strokeWidth: 90 }])).success).toBe(false);
		expect(greetingConfigSchema.safeParse(withLayers([{ ...shape, gradientTo: 'red' }])).success).toBe(false);
	});

	it('텍스트·이미지 레이어도 회전을 받아요', () => {
		const text = { id: 't', type: 'text', x: 50, y: 50, size: 30, color: '#ffffff', bold: false, align: 'center', text: 'a', rotation: 12 };
		expect(greetingConfigSchema.safeParse(withLayers([text])).success).toBe(true);
	});

	it('모든 템플릿이 스키마를 통과해요', () => {
		for (const template of GREETING_TEMPLATES) {
			expect(greetingConfigSchema.safeParse({ ...DEFAULT_GREETINGS.welcome, image: template.image }).success, template.id).toBe(true);
		}
	});
});

describe('레이어 움직임(animation)', () => {
	const base = { id: 's', type: 'shape', shape: 'circle', x: 50, y: 50, width: 100, height: 100, color: '#ffffff', opacity: 1 } as const;
	const animation = { type: 'pulse', durationMs: 2000, delayMs: 0, intensity: 0.5 } as const;
	const withLayers = (layers: unknown[]) => ({ ...DEFAULT_GREETINGS.welcome, image: { background: { presetId: 'rose', dataUri: null }, layers } });
	const asImage = (layers: unknown[]) => withLayers(layers).image as never;

	it('모든 레이어 종류가 animation을 받아요', () => {
		const text = { id: 't', type: 'text', x: 50, y: 50, size: 30, color: '#ffffff', bold: false, align: 'center', text: 'a' };
		const avatar = { id: 'a', type: 'avatar', x: 50, y: 50, size: 100, ringColor: '#ffffff' };
		for (const kind of GREETING_ANIMATIONS) {
			for (const layer of [base, text, avatar]) {
				expect(
					greetingConfigSchema.safeParse(withLayers([{ ...layer, animation: { ...animation, type: kind } }])).success,
					`${layer.type}/${kind}`
				).toBe(true);
			}
		}
	});

	it('범위를 벗어난 값과 알 수 없는 종류는 거부해요', () => {
		for (const bad of [
			{ ...animation, type: 'bounce' },
			{ ...animation, durationMs: 100 },
			{ ...animation, durationMs: 6000 },
			{ ...animation, intensity: 2 },
			{ ...animation, delayMs: -1 }
		]) {
			expect(greetingConfigSchema.safeParse(withLayers([{ ...base, animation: bad }])).success).toBe(false);
		}
	});

	it('hasGreetingAnimation은 보이는 움직임이 있을 때만 true예요', () => {
		expect(hasGreetingAnimation(asImage([base]))).toBe(false);
		expect(hasGreetingAnimation(asImage([{ ...base, animation }]))).toBe(true);
		expect(hasGreetingAnimation(asImage([{ ...base, animation, hidden: true }]))).toBe(false);
	});

	it('greetingAnimationDurationMs는 가장 긴 주기이고 5초를 넘지 않아요', () => {
		expect(greetingAnimationDurationMs(asImage([base]))).toBe(0);
		expect(
			greetingAnimationDurationMs(
				asImage([
					{ ...base, animation },
					{ ...base, id: 'b', animation: { ...animation, durationMs: 3500 } }
				])
			)
		).toBe(3500);
		expect(greetingAnimationDurationMs(asImage([{ ...base, animation: { ...animation, durationMs: 5000 } }]))).toBe(5000);
	});
});

describe('GIF 배경', () => {
	/** 2프레임 GIF(각 100ms) 최소 바이트 */
	const gif = (frames: number, delayCs = 10) => {
		const out: number[] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 4, 0, 4, 0, 0, 0, 0];
		for (let i = 0; i < frames; i += 1) {
			out.push(0x21, 0xf9, 0x04, 0, delayCs, 0, 0, 0, 0x2c, 0, 0, 0, 0, 4, 0, 4, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00);
		}
		out.push(0x3b);
		return `data:image/gif;base64,${Buffer.from(out).toString('base64')}`;
	};
	const withBackground = (dataUri: string | null, layers: unknown[] = []) => ({
		...DEFAULT_GREETINGS.welcome,
		image: { background: { presetId: null, dataUri }, layers }
	});
	const asImage = (config: ReturnType<typeof withBackground>) => config.image as never;
	const pulse = (durationMs: number) => ({
		id: 's',
		type: 'shape',
		shape: 'circle',
		x: 50,
		y: 50,
		width: 10,
		height: 10,
		color: '#ffffff',
		opacity: 1,
		animation: { type: 'pulse', durationMs, delayMs: 0, intensity: 0.5 }
	});

	it('배경 dataUri는 GIF를 받고 이미지 레이어는 GIF를 받지 않아요', () => {
		expect(greetingConfigSchema.safeParse(withBackground(gif(2))).success).toBe(true);
		const imageLayer = { id: 'i', type: 'image', x: 50, y: 50, width: 10, height: 10, dataUri: gif(2), opacity: 1 };
		expect(greetingConfigSchema.safeParse(withBackground(null, [imageLayer])).success).toBe(false);
	});

	it('움직이는 GIF 배경이면 레이어 움직임이 없어도 애니메이션이에요', () => {
		expect(hasGreetingAnimation(asImage(withBackground(gif(2))))).toBe(true);
		// 프레임이 하나뿐인 GIF는 정지 이미지예요
		expect(hasGreetingAnimation(asImage(withBackground(gif(1))))).toBe(false);
		expect(hasGreetingAnimation(asImage(withBackground(null)))).toBe(false);
	});

	it('한 바퀴 길이는 GIF 한 바퀴의 정수배예요', () => {
		// GIF 1초(10프레임 × 100ms)
		const oneSecond = gif(10);
		expect(greetingAnimationDurationMs(asImage(withBackground(oneSecond)))).toBe(1000);
		// 레이어 주기 4초에 가장 가까운 배수(4바퀴)
		expect(greetingAnimationDurationMs(asImage(withBackground(oneSecond, [pulse(4000)])))).toBe(4000);
		// 상한 5초 안에서만 반복해요
		expect(greetingAnimationDurationMs(asImage(withBackground(oneSecond, [pulse(5000)])))).toBe(5000);
		// 레이어 주기가 GIF보다 짧으면 GIF 한 바퀴
		expect(greetingAnimationDurationMs(asImage(withBackground(oneSecond, [pulse(500)])))).toBe(1000);
	});

	it('GIF가 5초 이상이면 5초에서 잘라요', () => {
		expect(greetingAnimationDurationMs(asImage(withBackground(gif(80))))).toBe(5000);
	});
});

describe('텍스트 효과·아바타 옵션 (P-17)', () => {
	const withLayers = (layers: unknown[]) => ({ ...DEFAULT_GREETINGS.welcome, image: { background: { presetId: 'rose', dataUri: null }, layers } });
	const text = { id: 't', type: 'text', x: 50, y: 50, size: 30, color: '#ffffff', bold: false, align: 'center', text: 'a' };
	const avatar = { id: 'a', type: 'avatar', x: 50, y: 50, size: 180, ringColor: '#ffffff' };
	const ok = (layer: unknown) => greetingConfigSchema.safeParse(withLayers([layer])).success;
	const shadow = { color: '#000000', opacity: 0.5, blur: 8, offsetX: 0, offsetY: 2 };

	it('새 필드가 없는 예전 텍스트·아바타 레이어도 그대로 통과하고 값이 늘어나지 않아요', () => {
		const parsed = greetingConfigSchema.parse(withLayers([text, avatar]));
		expect(parsed.image?.layers[0]).toEqual(text);
		expect(parsed.image?.layers[1]).toEqual(avatar);
	});

	it('텍스트 효과 필드를 모두 받아요', () => {
		const full = {
			...text,
			weight: 700,
			letterSpacing: -2,
			lineHeight: 1.6,
			maxWidth: 600,
			overflow: 'wrap',
			maxLines: 3,
			shadow,
			stroke: { color: '#112233', width: 4 },
			gradient: { to: '#ff00ff', angle: 90 }
		};
		expect(ok(full)).toBe(true);
		// null은 "끄기"예요 (shadow: null은 기본 그림자도 없애요)
		expect(ok({ ...text, shadow: null, stroke: null, gradient: null })).toBe(true);
	});

	it('굵기는 400/600/700/900 단계만 받아요', () => {
		for (const weight of GREETING_TEXT_WEIGHTS) expect(ok({ ...text, weight }), String(weight)).toBe(true);
		for (const weight of [100, 500, 800, '700']) expect(ok({ ...text, weight }), String(weight)).toBe(false);
	});

	it('텍스트 효과의 범위를 벗어난 값은 거부해요', () => {
		expect(ok({ ...text, letterSpacing: 100 })).toBe(false);
		expect(ok({ ...text, lineHeight: 0.2 })).toBe(false);
		expect(ok({ ...text, maxWidth: 10 })).toBe(false);
		expect(ok({ ...text, maxWidth: 5000 })).toBe(false);
		expect(ok({ ...text, overflow: 'clip' })).toBe(false);
		expect(ok({ ...text, maxLines: 0 })).toBe(false);
		expect(ok({ ...text, maxLines: 2.5 })).toBe(false);
		expect(ok({ ...text, shadow: { ...shadow, blur: 90 } })).toBe(false);
		expect(ok({ ...text, shadow: { ...shadow, opacity: 2 } })).toBe(false);
		expect(ok({ ...text, shadow: { ...shadow, color: 'black' } })).toBe(false);
		expect(ok({ ...text, stroke: { color: '#000000', width: 50 } })).toBe(false);
		expect(ok({ ...text, gradient: { to: 'pink' } })).toBe(false);
		expect(ok({ ...text, gradient: { to: '#ffffff', angle: 400 } })).toBe(false);
	});

	it('아바타 모양·링·그림자·글로우를 받아요', () => {
		for (const shape of GREETING_AVATAR_SHAPES) {
			expect(
				ok({ ...avatar, shape, cornerRadius: 40, ringWidth: 12, shadow, glow: { color: '#ffffff', opacity: 0.8, blur: 30, spread: 6 } }),
				shape
			).toBe(true);
		}
		expect(ok({ ...avatar, ringWidth: 0, shadow: null, glow: null })).toBe(true);
	});

	it('아바타의 범위를 벗어난 값은 거부해요', () => {
		expect(ok({ ...avatar, shape: 'hexagon' })).toBe(false);
		expect(ok({ ...avatar, ringWidth: 100 })).toBe(false);
		expect(ok({ ...avatar, ringWidth: -1 })).toBe(false);
		expect(ok({ ...avatar, cornerRadius: 999 })).toBe(false);
		expect(ok({ ...avatar, glow: { color: '#ffffff', opacity: 1, blur: 500, spread: 0 } })).toBe(false);
	});
});
