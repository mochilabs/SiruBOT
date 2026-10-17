import { describe, expect, it } from 'vitest';

import { DEFAULT_GOODBYE_GREETING, DEFAULT_WELCOME_GREETING, validateGreetingConfig } from './memberGreeting.ts';

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
