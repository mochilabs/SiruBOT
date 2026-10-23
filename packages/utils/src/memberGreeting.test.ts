import { describe, expect, it } from 'vitest';

import { DEFAULT_GOODBYE_GREETING, DEFAULT_WELCOME_GREETING, renderGreetingTemplate, validateGreetingConfig } from './memberGreeting.ts';

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
