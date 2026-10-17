import { describe, expect, it } from 'vitest';
import { scrubSecrets } from './sentry.ts';

describe('scrubSecrets — Sentry 비밀 마스킹', () => {
	it('비밀 키 이름의 값을 마스킹해요', () => {
		const scrubbed = scrubSecrets({
			authorization: 'super-secret-key',
			token: 'abc',
			apiKey: 'xyz',
			password: 'pw',
			credential: 'cred',
			guildId: '1234',
			message: 'ok'
		});
		expect(scrubbed).toEqual({
			authorization: '[redacted]',
			token: '[redacted]',
			apiKey: '[redacted]',
			password: '[redacted]',
			credential: '[redacted]',
			guildId: '1234',
			message: 'ok'
		});
	});

	it('문자열 안의 Bearer 토큰만 마스킹해요', () => {
		expect(scrubSecrets({ header: 'Authorization: Bearer abcdef.ghij.klmn' })).toEqual({ header: 'Authorization: Bearer [redacted]' });
		expect(scrubSecrets({ note: 'user 1234 joined' })).toEqual({ note: 'user 1234 joined' });
	});

	it('중첩 객체·배열을 재귀적으로 처리하고 순환 참조를 견뎌요', () => {
		const cyclic: Record<string, unknown> = { extra: { headers: { Authorization: 'Bearer toptoken' } }, list: [{ secret: 's' }] };
		cyclic.self = cyclic;
		const scrubbed = scrubSecrets(cyclic) as Record<string, unknown>;
		expect((scrubbed.extra as { headers: { Authorization: string } }).headers.Authorization).toBe('[redacted]');
		expect((scrubbed.list as { secret: string }[])[0]).toEqual({ secret: '[redacted]' });
		expect(scrubbed.self).toBe('[circular]');
	});
});
