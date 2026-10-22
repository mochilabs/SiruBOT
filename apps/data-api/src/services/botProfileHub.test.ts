import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_PROFILE_STATE_CHANNEL_PREFIX } from '@sirubot/utils';
import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { getBotProfile, handleBotProfileStateMessage } from './botProfileHub.ts';

const SIGNING_KEY = 'bot-profile-hub-test-key';

const channel = (guildId: string): string => `${BOT_PROFILE_STATE_CHANNEL_PREFIX}${guildId}`;

function state(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		guildId: 'g1',
		nickname: null,
		username: 'bot',
		guildAvatarUrl: null,
		guildBannerUrl: null,
		globalAvatarUrl: null,
		canChangeNickname: true,
		lastApply: null,
		updatedAt: 1_000,
		...overrides
	};
}

// 서명 키가 없는 구버전 모드를 보장해요 — 로컬/CI 환경의 AUTH_KEY 유무에 테스트 결과가 달라지지 않게.
beforeEach(() => {
	vi.stubEnv('REDIS_AUTH_KEY', '');
	vi.stubEnv('AUTH_KEY', '');
});
afterEach(() => {
	vi.unstubAllEnvs();
});

describe('handleBotProfileStateMessage', () => {
	it('정상 상태 프레임을 저장하고 getBotProfile로 내려줘요', () => {
		handleBotProfileStateMessage(JSON.stringify(state({ guildId: 'store-guild', nickname: '닉네임' })), channel('store-guild'));
		const profile = getBotProfile('store-guild');
		expect(profile?.nickname).toBe('닉네임');
		expect(profile?.username).toBe('bot');
		expect(profile?.lastApply).toBeNull();
	});

	it('lastApply가 없는 프레임은 null로 정규화해요 (수동 검증 시절 계약 유지)', () => {
		const payload = state({ guildId: 'noapply-guild' });
		delete payload.lastApply;
		handleBotProfileStateMessage(JSON.stringify(payload), channel('noapply-guild'));
		expect(getBotProfile('noapply-guild')?.lastApply).toBeNull();
	});

	it('lastApply가 있으면 결과와 시각을 그대로 보관해요', () => {
		handleBotProfileStateMessage(
			JSON.stringify(state({ guildId: 'apply-guild', lastApply: { ok: false, error: 'missing_permission', at: 42 } })),
			channel('apply-guild')
		);
		expect(getBotProfile('apply-guild')?.lastApply).toEqual({ ok: false, error: 'missing_permission', at: 42 });
	});

	it('필드 타입이 계약과 다르면 조용히 버려요', () => {
		handleBotProfileStateMessage(JSON.stringify(state({ guildId: 'bad-guild', canChangeNickname: 'yes' })), channel('bad-guild'));
		expect(getBotProfile('bad-guild')).toBeNull();
	});

	it('payload.guildId가 채널의 길드와 다르면 무시해요', () => {
		handleBotProfileStateMessage(JSON.stringify(state({ guildId: 'other-guild' })), channel('mismatch-guild'));
		expect(getBotProfile('mismatch-guild')).toBeNull();
	});

	it('봇 프로필 채널이 아니면 무시해요', () => {
		handleBotProfileStateMessage(JSON.stringify(state({ guildId: 'misc-guild' })), 'sirubot:other:misc-guild');
		expect(getBotProfile('misc-guild')).toBeNull();
	});
});

describe('서명 검증 (SEC-006)', () => {
	beforeEach(() => {
		vi.stubEnv('AUTH_KEY', SIGNING_KEY);
	});

	it('키가 설정되면 서명 없는 프레임을 거부해요', () => {
		handleBotProfileStateMessage(JSON.stringify(state({ guildId: 'unsigned-guild' })), channel('unsigned-guild'));
		expect(getBotProfile('unsigned-guild')).toBeNull();
	});

	it('올바른 키로 서명된 프레임은 받아들여요', () => {
		const signed = wrapRedisMessage(SIGNING_KEY, state({ guildId: 'signed-guild', username: '서명봇' }));
		handleBotProfileStateMessage(signed, channel('signed-guild'));
		expect(getBotProfile('signed-guild')?.username).toBe('서명봇');
	});

	it('다른 키로 서명된 프레임도 거부해요', () => {
		const signed = wrapRedisMessage('다른-키', state({ guildId: 'wrongkey-guild' }));
		handleBotProfileStateMessage(signed, channel('wrongkey-guild'));
		expect(getBotProfile('wrongkey-guild')).toBeNull();
	});
});
