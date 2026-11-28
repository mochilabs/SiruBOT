import { describe, expect, it } from 'vitest';
import {
	BOT_MODULES,
	commandModule,
	featureModule,
	gatedModuleForCommand,
	gatedModuleForNamespace,
	isModuleDisabled,
	messageFeatureModule,
	moduleDisabledMessage,
	sanitizeDisabledModules,
	usageFeatureKey,
	USAGE_FEATURE_MAX_LENGTH
} from './modules.ts';

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

describe('모듈 켜기/끄기 판정', () => {
	it('저장 값에서 모르는 id·관리 모듈·중복을 버리고 모듈 표 순서로 정리해요', () => {
		expect(sanitizeDisabledModules(['fun', 'admin', 'nope', 'fun', 'music'])).toEqual(['music', 'fun']);
		expect(sanitizeDisabledModules(null)).toEqual([]);
		expect(sanitizeDisabledModules(['admin'])).toEqual([]);
	});

	it('끈 모듈만 꺼진 것으로 보고, 관리 모듈은 목록에 있어도 켜져 있어요', () => {
		expect(isModuleDisabled(['fun'], 'fun')).toBe(true);
		expect(isModuleDisabled(['fun'], 'music')).toBe(false);
		expect(isModuleDisabled(['admin'], 'admin')).toBe(false);
		expect(isModuleDisabled(undefined, 'fun')).toBe(false);
	});

	it('명령 이름으로 검사 대상 모듈을 찾고, 도움말·개인정보·모르는 명령은 제외해요', () => {
		expect(gatedModuleForCommand('rps')).toBe('fun');
		expect(gatedModuleForCommand('play')).toBe('music');
		expect(gatedModuleForCommand('help')).toBeNull();
		expect(gatedModuleForCommand('privacy')).toBeNull();
		expect(gatedModuleForCommand('some-custom-command')).toBeNull();
	});

	it('컴포넌트 namespace로 검사 대상 모듈을 찾고, 도움말·온보딩은 제외해요', () => {
		expect(gatedModuleForNamespace('game')).toBe('fun');
		expect(gatedModuleForNamespace('controller')).toBe('music');
		expect(gatedModuleForNamespace('ticket')).toBe('community');
		expect(gatedModuleForNamespace('help')).toBeNull();
		expect(gatedModuleForNamespace('onboarding')).toBeNull();
		expect(gatedModuleForNamespace('unknown')).toBeNull();
	});

	it('메시지 기능 id로 모듈을 찾아요', () => {
		expect(messageFeatureModule('greeting')).toBe('community');
		expect(messageFeatureModule('temp-voice')).toBe('community');
		expect(messageFeatureModule('ai-mention')).toBe('ai');
		expect(messageFeatureModule('embed-fix')).toBe('utility');
		expect(messageFeatureModule('nope')).toBeNull();
	});

	it('거절 문구에 모듈 이름이 들어가요', () => {
		expect(moduleDisabledMessage('fun')).toBe('이 서버에서는 놀이 기능이 꺼져 있어요. 관리자는 /설정에서 켤 수 있어요.');
	});
});
