import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_GREETING_STATE_CHANNEL_PREFIX } from '@sirubot/utils';
import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { getGreetingTestResult, handleMemberGreetingStateMessage } from './memberGreetingHub.ts';

const SIGNING_KEY = 'member-greeting-hub-test-key';

const channel = (guildId: string): string => `${MEMBER_GREETING_STATE_CHANNEL_PREFIX}${guildId}`;

function frame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		requestId: 'req-1',
		kind: 'welcome',
		ok: true,
		sentAt: 1_000,
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

describe('handleMemberGreetingStateMessage', () => {
	it('정상 결과 프레임을 길드별로 저장해요', () => {
		handleMemberGreetingStateMessage(JSON.stringify(frame()), channel('g1'));
		expect(getGreetingTestResult('g1')).toEqual({ found: true, requestId: 'req-1', kind: 'welcome', ok: true, error: null, sentAt: 1_000 });
	});

	it('sentAt 계약은 epoch milliseconds(number) — 숫자는 그대로 받아들여요', () => {
		handleMemberGreetingStateMessage(JSON.stringify(frame({ sentAt: 1_700_000_000_000 })), channel('num-sentat'));
		const result = getGreetingTestResult('num-sentat');
		expect(result).toMatchObject({ found: true, sentAt: 1_700_000_000_000 });
	});

	it('레거시 ISO 문자열 sentAt은 epoch ms로 정규화해요 (봇 시각 보존)', () => {
		handleMemberGreetingStateMessage(JSON.stringify(frame({ sentAt: '2026-10-21T00:00:00.000Z' })), channel('iso-sentat'));
		const result = getGreetingTestResult('iso-sentat');
		expect(result).toMatchObject({ found: true, sentAt: Date.parse('2026-10-21T00:00:00.000Z') });
	});

	it('sentAt이 없거나 깨졌으면 수신 시각으로 대체해요 (payload 전체는 버리지 않아요)', () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(1_800_000_000_000);
			handleMemberGreetingStateMessage(JSON.stringify(frame({ sentAt: 'not-a-date' })), channel('bad-sentat'));
			handleMemberGreetingStateMessage(JSON.stringify(frame({ requestId: 'req-2', sentAt: undefined })), channel('missing-sentat'));
			expect(getGreetingTestResult('bad-sentat')).toMatchObject({ found: true, sentAt: 1_800_000_000_000 });
			expect(getGreetingTestResult('missing-sentat')).toMatchObject({ found: true, sentAt: 1_800_000_000_000 });
		} finally {
			vi.useRealTimers();
		}
	});

	it('오류 없이 성공한 결과의 error는 null이에요', () => {
		handleMemberGreetingStateMessage(JSON.stringify(frame({ ok: false, error: '요청자를 이 서버에서 찾지 못했어요' })), channel('err-guild'));
		expect(getGreetingTestResult('err-guild')).toMatchObject({ found: true, ok: false, error: '요청자를 이 서버에서 찾지 못했어요' });
	});

	it('필드 타입이 계약과 다르면 조용히 버려요', () => {
		handleMemberGreetingStateMessage(JSON.stringify(frame({ requestId: '' })), channel('bad-guild'));
		handleMemberGreetingStateMessage(JSON.stringify(frame({ kind: 'holiday' })), channel('bad-kind-guild'));
		expect(getGreetingTestResult('bad-guild')).toEqual({ found: false });
		expect(getGreetingTestResult('bad-kind-guild')).toEqual({ found: false });
	});

	it('멤버 인사 채널이 아니면 무시해요', () => {
		handleMemberGreetingStateMessage(JSON.stringify(frame()), 'sirubot:other:notours-guild');
		expect(getGreetingTestResult('notours-guild')).toEqual({ found: false });
	});
});

describe('서명 검증 (SEC-006)', () => {
	beforeEach(() => {
		vi.stubEnv('AUTH_KEY', SIGNING_KEY);
	});

	it('키가 설정되면 서명 없는 프레임을 거부해요', () => {
		handleMemberGreetingStateMessage(JSON.stringify(frame()), channel('unsigned-guild'));
		expect(getGreetingTestResult('unsigned-guild')).toEqual({ found: false });
	});

	it('올바른 키로 서명된 프레임은 받아들여요', () => {
		handleMemberGreetingStateMessage(wrapRedisMessage(SIGNING_KEY, frame({ requestId: 'req-signed' })), channel('signed-guild'));
		expect(getGreetingTestResult('signed-guild')).toMatchObject({ found: true, requestId: 'req-signed' });
	});

	it('다른 키로 서명된 프레임도 거부해요', () => {
		handleMemberGreetingStateMessage(wrapRedisMessage('다른-키', frame()), channel('wrongkey-guild'));
		expect(getGreetingTestResult('wrongkey-guild')).toEqual({ found: false });
	});
});
