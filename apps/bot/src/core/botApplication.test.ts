import { describe, expect, it } from 'vitest';
import { BotApplication } from './botApplication.ts';

describe('BotApplication — 전역 allowedMentions 기본값 (멘션 주입 방지)', () => {
	it('트랙 제목 등 외부 문자열의 멘션 마크업이 알림으로 이어지지 않게 기본값이 꺼져 있어요', () => {
		const client = new BotApplication({ intents: [] });
		expect(client.options.allowedMentions).toEqual({ parse: [], users: [], roles: [], repliedUser: false });
		void client.destroy();
	});
});
