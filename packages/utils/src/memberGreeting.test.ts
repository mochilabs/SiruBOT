import { describe, expect, it } from 'vitest';

import {
	DEFAULT_GOODBYE_GREETING,
	DEFAULT_GREETINGS,
	DEFAULT_WELCOME_GREETING,
	GREETING_ANIMATIONS,
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
