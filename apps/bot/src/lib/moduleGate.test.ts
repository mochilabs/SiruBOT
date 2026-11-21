import { describe, expect, it, vi } from 'vitest';
import type { BotModuleId } from '@sirubot/utils/modules';
import { gateCommand, gateNamespace } from './moduleGate.ts';

const disabled = (...ids: BotModuleId[]) => vi.fn(async (id: BotModuleId) => !ids.includes(id));

describe('gateCommand', () => {
	it('놀이 모듈을 끄면 rps를 거절하고 안내 문구를 줘요', async () => {
		const result = await gateCommand('rps', disabled('fun'));
		expect(result).toEqual({
			allowed: false,
			moduleId: 'fun',
			message: '이 서버에서는 놀이 기능이 꺼져 있어요. 관리자는 /설정에서 켤 수 있어요.'
		});
	});

	it('다시 켜면 rps가 통과해요', async () => {
		expect(await gateCommand('rps', disabled())).toEqual({ allowed: true });
	});

	it('다른 모듈이 꺼져 있어도 영향이 없어요', async () => {
		expect(await gateCommand('rps', disabled('music'))).toEqual({ allowed: true });
	});

	it('도움말·개인정보·표에 없는 명령은 조회 없이 통과해요', async () => {
		const lookup = disabled('utility', 'fun');
		expect(await gateCommand('help', lookup)).toEqual({ allowed: true });
		expect(await gateCommand('privacy', lookup)).toEqual({ allowed: true });
		expect(await gateCommand('eval', lookup)).toEqual({ allowed: true });
		expect(lookup).not.toHaveBeenCalled();
	});

	it('관리 모듈 명령은 끌 수 없어서 조회가 켜짐이면 통과해요', async () => {
		expect(await gateCommand('settings', disabled())).toEqual({ allowed: true });
	});
});

describe('gateNamespace', () => {
	it('꺼진 모듈의 namespace를 거절해요', async () => {
		expect(await gateNamespace('game', disabled('fun'))).toMatchObject({ allowed: false, moduleId: 'fun' });
		expect(await gateNamespace('controller', disabled('music'))).toMatchObject({ allowed: false, moduleId: 'music' });
	});

	it('도움말·온보딩·알 수 없는 namespace·null은 통과해요', async () => {
		const lookup = disabled('utility', 'fun', 'music', 'community', 'ai');
		expect(await gateNamespace('help', lookup)).toEqual({ allowed: true });
		expect(await gateNamespace('onboarding', lookup)).toEqual({ allowed: true });
		expect(await gateNamespace('zzz', lookup)).toEqual({ allowed: true });
		expect(await gateNamespace(null, lookup)).toEqual({ allowed: true });
		expect(lookup).not.toHaveBeenCalled();
	});

	it('설정 패널은 관리 모듈이라 통과해요', async () => {
		expect(await gateNamespace('settings', disabled())).toEqual({ allowed: true });
	});
});
