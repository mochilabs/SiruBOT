import { describe, expect, it } from 'vitest';
import { pickWelcomeTarget } from './welcomeTarget.ts';

describe('pickWelcomeTarget', () => {
	it('시스템 채널에 쓸 수 있으면 거기로 보내요', () => {
		expect(
			pickWelcomeTarget([
				{ id: 't1', kind: 'text', canSend: true },
				{ id: 's', kind: 'system', canSend: true }
			])
		).toEqual({ type: 'channel', channelId: 's', kind: 'system' });
	});

	it('시스템 채널 권한이 없으면 공지 채널, 그다음 첫 텍스트 채널이에요', () => {
		expect(
			pickWelcomeTarget([
				{ id: 's', kind: 'system', canSend: false },
				{ id: 'p', kind: 'publicUpdates', canSend: true },
				{ id: 't1', kind: 'text', canSend: true }
			])
		).toEqual({ type: 'channel', channelId: 'p', kind: 'publicUpdates' });
		expect(
			pickWelcomeTarget([
				{ id: 's', kind: 'system', canSend: false },
				{ id: 't1', kind: 'text', canSend: false },
				{ id: 't2', kind: 'text', canSend: true }
			])
		).toEqual({ type: 'channel', channelId: 't2', kind: 'text' });
	});

	it('쓸 수 있는 채널이 없으면 주인 DM이에요', () => {
		expect(pickWelcomeTarget([{ id: 't1', kind: 'text', canSend: false }])).toEqual({ type: 'ownerDm' });
		expect(pickWelcomeTarget([])).toEqual({ type: 'ownerDm' });
	});
});
