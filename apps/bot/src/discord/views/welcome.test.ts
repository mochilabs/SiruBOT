import { ComponentType, type APIActionRowComponent, type APIButtonComponent, type APIContainerComponent } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { onboardingId } from '../customIds.ts';
import { welcomeView, type WelcomeViewOptions } from './welcome.ts';

const base: WelcomeViewOptions = { kind: 'first', index: new Map(), dashboardUrl: 'https://siru.example', supportServerUrl: null };

function buttonsOf(json: APIContainerComponent): APIButtonComponent[] {
	const row = json.components.find((c) => c.type === ComponentType.ActionRow) as APIActionRowComponent<APIButtonComponent> | undefined;
	return row?.components ?? [];
}

describe('welcomeView', () => {
	it('처음 들어오면 설정·대시보드·둘러보기 버튼 3개예요', () => {
		const buttons = buttonsOf(welcomeView(base).toJSON());
		expect(buttons.map((b) => b.label)).toEqual(['서버 설정 시작', '대시보드 열기', '기능 둘러보기']);
		const actions = buttons.filter((b) => 'custom_id' in b).map((b) => onboardingId.decode((b as { custom_id: string }).custom_id)?.action);
		expect(actions).toEqual(['settings', 'tour']);
	});

	it('대시보드 주소가 없으면 링크 버튼을 숨겨요', () => {
		const buttons = buttonsOf(welcomeView({ ...base, dashboardUrl: null }).toJSON());
		expect(buttons.map((b) => b.label)).toEqual(['서버 설정 시작', '기능 둘러보기']);
	});

	it('다시 들어오면 짧은 안내와 설정 버튼만 보내요', () => {
		const json = welcomeView({ ...base, kind: 'rejoin' }).toJSON();
		expect(buttonsOf(json).map((b) => b.label)).toEqual(['서버 설정 시작']);
		expect(JSON.stringify(json)).toContain('다시 와 주셔서 고마워요');
	});

	it('지원 서버 주소가 있을 때만 안내해요', () => {
		expect(JSON.stringify(welcomeView(base).toJSON())).not.toContain('지원 서버');
		expect(JSON.stringify(welcomeView({ ...base, supportServerUrl: 'https://discord.gg/abc' }).toJSON())).toContain('https://discord.gg/abc');
	});
});
