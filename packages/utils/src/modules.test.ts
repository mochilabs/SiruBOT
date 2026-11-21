import { describe, expect, it } from 'vitest';
import { BOT_MODULES, commandModule, featureModule, usageFeatureKey, USAGE_FEATURE_MAX_LENGTH } from './modules.ts';

describe('BOT_MODULES', () => {
	it('명령·네임스페이스·메시지 기능이 모듈 하나에만 속해요', () => {
		for (const key of ['commands', 'componentNamespaces'] as const) {
			const all = BOT_MODULES.flatMap((m) => m[key]);
			expect(new Set(all).size).toBe(all.length);
		}
		const features = BOT_MODULES.flatMap((m) => m.messageFeatures.map((f) => f.id));
		expect(new Set(features).size).toBe(features.length);
	});

	it('셀렉트 설명은 디스코드 한도(100자) 안이에요', () => {
		for (const m of BOT_MODULES) expect(m.description.length).toBeLessThanOrEqual(100);
	});

	it('관리 모듈만 끌 수 없어요', () => {
		expect(BOT_MODULES.filter((m) => !m.toggleable).map((m) => m.id)).toEqual(['admin']);
	});
});

describe('featureModule', () => {
	it('키 접두어별로 모듈을 찾아요', () => {
		expect(commandModule('play')).toBe('music');
		expect(featureModule('cmd:music.play')).toBe('music');
		expect(featureModule('cmd:settings')).toBe('admin');
		expect(featureModule('ns:ticket')).toBe('community');
		expect(featureModule('msg:ai-mention')).toBe('ai');
		expect(featureModule('playback:track_error')).toBe('music');
		expect(featureModule('onboarding:sent')).toBe('utility');
	});

	it('모르는 키는 null이에요', () => {
		expect(featureModule('cmd:unknown')).toBeNull();
		expect(featureModule('nope')).toBeNull();
		expect(featureModule('zzz:play')).toBeNull();
	});

	it('키 길이를 제한해요', () => {
		expect(usageFeatureKey('cmd', 'x'.repeat(200)).length).toBe(USAGE_FEATURE_MAX_LENGTH);
	});
});
