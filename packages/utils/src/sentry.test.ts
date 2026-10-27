import * as Sentry from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initSentry, registerProcessErrorHandlers, scrubSecrets } from './sentry.ts';

vi.mock('@sentry/node', () => ({
	init: vi.fn(),
	setTag: vi.fn(),
	captureException: vi.fn(),
	flush: vi.fn(() => Promise.resolve(true))
}));
vi.mock('@sentry/profiling-node', () => ({ nodeProfilingIntegration: vi.fn(() => ({ name: 'nodeProfiling' })) }));

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

	it('URL 안에 실린 웹훅 토큰·쿼리 크리덴셜·userinfo를 마스킹해요', () => {
		const scrubbed = scrubSecrets({
			url: 'https://discord.com/api/webhooks/123456789012345678/abcdEFGH-token_value',
			endpoint: 'https://api.example.com/v1/weather?location=서울&token=secret123&scope=now',
			dsn: 'https://user:password@example.com/1'
		});

		expect(scrubbed).toEqual({
			url: 'https://discord.com/api/webhooks/123456789012345678/[redacted]',
			endpoint: 'https://api.example.com/v1/weather?location=서울&token=[redacted]&scope=now',
			dsn: 'https://[redacted]@example.com/1'
		});
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

describe('initSentry', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('SENTRY_DSN가 없으면 Sentry를 초기화하지 않아요', () => {
		const originalDsn = process.env.SENTRY_DSN;
		delete process.env.SENTRY_DSN;
		try {
			initSentry();
			expect(Sentry.init).not.toHaveBeenCalled();
		} finally {
			if (originalDsn !== undefined) process.env.SENTRY_DSN = originalDsn;
		}
	});

	it('dsn이 있으면 초기화하고 서비스 태그를 걸어요', () => {
		initSentry({ dsn: 'https://public@example.com/1', service: 'bot', environment: 'test' });
		expect(Sentry.init).toHaveBeenCalledTimes(1);
		expect(Sentry.setTag).toHaveBeenCalledWith('service', 'bot');
	});

	it('SENTRY_RELEASE가 있으면 VERSION과 무관하게 릴리스로 사용해요', () => {
		const originalRelease = process.env.SENTRY_RELEASE;
		const originalVersion = process.env.VERSION;
		process.env.SENTRY_RELEASE = 'beta-abc1234';
		process.env.VERSION = 'beta';
		try {
			initSentry({ dsn: 'https://public@example.com/1' });
			expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ release: 'beta-abc1234' }));
		} finally {
			if (originalRelease === undefined) delete process.env.SENTRY_RELEASE;
			else process.env.SENTRY_RELEASE = originalRelease;
			if (originalVersion === undefined) delete process.env.VERSION;
			else process.env.VERSION = originalVersion;
		}
	});
});

describe('registerProcessErrorHandlers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('unhandledRejection은 보고만 하고, uncaughtException은 flush(2000) 후 exit(1)해요', async () => {
		const listeners: Record<string, (...args: unknown[]) => void> = {};
		const onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, listener: (...args: unknown[]) => void) => {
			listeners[event] = listener;
			return process;
		}) as unknown as typeof process.on);
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as typeof process.exit);
		const logger = { error: vi.fn() };
		try {
			registerProcessErrorHandlers(logger);

			const rejection = new Error('handled rejection');
			listeners.unhandledRejection?.(rejection);
			expect(Sentry.captureException).toHaveBeenCalledWith(rejection);
			expect(logger.error).toHaveBeenCalledWith('Unhandled Rejection:', rejection);
			expect(exitSpy).not.toHaveBeenCalled();

			const fatal = new Error('fatal');
			listeners.uncaughtException?.(fatal);
			expect(Sentry.captureException).toHaveBeenCalledWith(fatal);
			expect(logger.error).toHaveBeenCalledWith('Uncaught Exception:', fatal);
			expect(Sentry.flush).toHaveBeenCalledWith(2000);
			await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));
		} finally {
			onSpy.mockRestore();
			exitSpy.mockRestore();
		}
	});
});
