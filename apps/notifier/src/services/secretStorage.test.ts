import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret, deriveKeyFromSecret } from '@sirubot/utils/secretBox';
import { openWebhookToken, sealWebhookToken } from './secretStorage.ts';

const KEY = 'test-auth-key-for-notifier';
const ROTATED = 'rotated-auth-key';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('sealWebhookToken / openWebhookToken', () => {
	it('키가 있으면 암호문으로 저장하고 원문을 복원해요', () => {
		vi.stubEnv('AUTH_KEY', KEY);
		vi.stubEnv('DATA_ENCRYPTION_KEY', '');

		const sealed = sealWebhookToken('super-secret-token');

		expect(sealed).not.toContain('super-secret-token');
		expect(sealed.startsWith('enc:v1:')).toBe(true);
		expect(openWebhookToken(sealed)).toBe('super-secret-token');
	});

	it('키가 없으면 평문을 그대로 저장·반환해요 (개발/초기 배포 호환)', () => {
		vi.stubEnv('AUTH_KEY', '');
		vi.stubEnv('DATA_ENCRYPTION_KEY', '');
		vi.stubEnv('NOTIFIER_AUTH_KEY', '');

		expect(sealWebhookToken('plain')).toBe('plain');
		expect(openWebhookToken('plain')).toBe('plain');
	});

	it('구 데이터(평문)도 그대로 읽혀요', () => {
		vi.stubEnv('AUTH_KEY', KEY);
		expect(openWebhookToken('legacy-plain-token')).toBe('legacy-plain-token');
	});

	it('키를 회전할 때 옛 키를 DATA_ENCRYPTION_KEY에 남기면 기존 행을 읽어요 (재봉인은 이 모듈이 강제하지 않아요)', () => {
		const legacySealed = `enc:v1:${encryptSecret('legacy-token', deriveKeyFromSecret(KEY))}`;

		vi.stubEnv('AUTH_KEY', ROTATED);
		vi.stubEnv('DATA_ENCRYPTION_KEY', KEY);
		expect(openWebhookToken(legacySealed)).toBe('legacy-token');

		vi.stubEnv('DATA_ENCRYPTION_KEY', '');
		vi.stubEnv('NOTIFIER_AUTH_KEY', '');
		expect(openWebhookToken(legacySealed)).toBe('');
	});

	it('키가 없거나 복호 실패면 빈 문자열 — 전송 중단 신호로 써요', () => {
		vi.stubEnv('AUTH_KEY', KEY);
		const sealed = sealWebhookToken('token');
		vi.stubEnv('AUTH_KEY', 'another-key-entirely');
		vi.stubEnv('DATA_ENCRYPTION_KEY', '');
		vi.stubEnv('NOTIFIER_AUTH_KEY', '');

		expect(openWebhookToken(sealed)).toBe('');
	});
});
