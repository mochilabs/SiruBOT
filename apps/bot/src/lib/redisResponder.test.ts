import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineRedisEvent, defineRedisRpc } from '@sirubot/utils';
import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { AppError } from './appError.ts';
import {
	createGlobalRedisResponder,
	createRedisEventListener,
	createRedisResponder,
	DEFAULT_RESPONDER_ERROR_MESSAGE,
	type RedisRuntime
} from './redisResponder.ts';

const REQUEST_ID = 'c9d3a1b2-4e5f-4a6b-8c7d-2b1e3f4a5c61';
const KEY = 'test-signing-key';

const contract = defineRedisRpc({
	name: '테스트',
	requestChannel: 'test:request',
	responseChannel: 'test:response',
	requestSchema: z.object({ requestId: z.string().uuid(), guildId: z.string(), kind: z.enum(['a', 'b']), n: z.number().optional() }),
	responseSchema: z.object({
		requestId: z.string(),
		guildId: z.string(),
		kind: z.string(),
		error: z.string().optional(),
		echo: z.number().optional()
	})
});

const adminContract = defineRedisRpc({
	name: '관리',
	requestChannel: 'admin:request',
	responseChannel: 'admin:response',
	requestSchema: z.object({ requestId: z.string().uuid(), kind: z.literal('ping') }),
	responseSchema: z.object({ requestId: z.string(), kind: z.string(), error: z.string().optional(), message: z.string().optional() })
});

function makeRuntime(options: { guild?: boolean; signingKey?: string } = {}) {
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
	const publish = vi.fn();
	const guild = { id: 'g1' };
	const runtime: RedisRuntime = {
		logger,
		signingKey: options.signingKey ?? KEY,
		publisher: { publish },
		resolveGuild: (id) => (options.guild === false ? undefined : id === 'g1' ? (guild as never) : undefined)
	};
	return { runtime, logger, publish, guild };
}

const request = (extra: Record<string, unknown> = {}) => ({ requestId: REQUEST_ID, guildId: 'g1', kind: 'a', ...extra });
const signed = (payload: unknown) => wrapRedisMessage(KEY, payload);

describe('createRedisResponder', () => {
	it('채널은 계약의 요청 채널이에요', () => {
		expect(createRedisResponder(contract, async () => ({})).channel).toBe('test:request');
	});

	it('서명이 틀리면 거부하고 핸들러·응답이 없어요', async () => {
		const { runtime, logger, publish } = makeRuntime();
		const handler = vi.fn(async () => ({}));
		await createRedisResponder(contract, handler).handle(wrapRedisMessage('other-key', request()), runtime);
		expect(handler).not.toHaveBeenCalled();
		expect(publish).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('서명 검증 실패'));
	});

	it('서명이 없는 평문은 키가 있으면 거부해요', async () => {
		const { runtime, publish } = makeRuntime();
		await createRedisResponder(contract, async () => ({})).handle(JSON.stringify(request()), runtime);
		expect(publish).not.toHaveBeenCalled();
	});

	it('JSON이 아니면 조용히 무시해요', async () => {
		const { runtime, publish, logger } = makeRuntime({ signingKey: '' });
		const handler = vi.fn(async () => ({}));
		await createRedisResponder(contract, handler).handle('not json', runtime);
		expect(handler).not.toHaveBeenCalled();
		expect(publish).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalled();
	});

	it('스키마가 맞지 않으면 조용히 무시해요', async () => {
		const { runtime, publish } = makeRuntime();
		const handler = vi.fn(async () => ({}));
		await createRedisResponder(contract, handler).handle(signed(request({ kind: 'zzz' })), runtime);
		expect(handler).not.toHaveBeenCalled();
		expect(publish).not.toHaveBeenCalled();
	});

	it('이 프로세스가 보유하지 않은 길드는 조용히 무시해요', async () => {
		const { runtime, publish, logger } = makeRuntime({ guild: false });
		const handler = vi.fn(async () => ({}));
		await createRedisResponder(contract, handler).handle(signed(request()), runtime);
		expect(handler).not.toHaveBeenCalled();
		expect(publish).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('성공하면 상관 필드를 채워 응답 채널로 퍼블리시해요', async () => {
		const { runtime, publish, guild } = makeRuntime();
		const handler = vi.fn(async ({ request: req }: { request: { n?: number } }) => ({ echo: req.n }));
		await createRedisResponder(contract, handler as never).handle(signed(request({ n: 7 })), runtime);
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ guild, request: expect.objectContaining({ n: 7 }) }));
		expect(publish).toHaveBeenCalledWith('test:response', { requestId: REQUEST_ID, guildId: 'g1', kind: 'a', echo: 7 }, '테스트 응답');
	});

	it('핸들러가 null을 돌려주면 응답하지 않아요', async () => {
		const { runtime, publish } = makeRuntime();
		await createRedisResponder(contract, async () => null).handle(signed(request()), runtime);
		expect(publish).not.toHaveBeenCalled();
	});

	it('AppError는 이모지 마크업을 뗀 사용자 문구로 응답하고 error 로그는 남기지 않아요', async () => {
		const { runtime, publish, logger } = makeRuntime();
		const responder = createRedisResponder(contract, async () => {
			throw new AppError('forbidden', '<:error:123456> 권한이 없어요.');
		});
		await responder.handle(signed(request()), runtime);
		expect(publish).toHaveBeenCalledWith(
			'test:response',
			{ requestId: REQUEST_ID, guildId: 'g1', kind: 'a', error: '권한이 없어요.' },
			'테스트 응답'
		);
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('그 밖의 예외는 error 로그를 남기고 일반 안내 문구로 응답해요', async () => {
		const { runtime, publish, logger } = makeRuntime();
		await createRedisResponder(contract, async () => {
			throw new Error('boom');
		}).handle(signed(request()), runtime);
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
		expect(publish).toHaveBeenCalledWith(
			'test:response',
			{ requestId: REQUEST_ID, guildId: 'g1', kind: 'a', error: DEFAULT_RESPONDER_ERROR_MESSAGE },
			'테스트 응답'
		);
	});

	it('errorMessage 옵션으로 일반 안내 문구를 바꿀 수 있어요 (고정 문자열·함수)', async () => {
		const failing = async () => {
			throw new Error('boom');
		};
		const fixed = makeRuntime();
		await createRedisResponder(contract, failing, { errorMessage: '고정 문구' }).handle(signed(request()), fixed.runtime);
		expect(fixed.publish.mock.calls[0][1]).toMatchObject({ error: '고정 문구' });

		const dynamic = makeRuntime();
		await createRedisResponder(contract, failing, { errorMessage: (req, error) => `${req.kind}:${(error as Error).message}` }).handle(
			signed(request({ kind: 'b' })),
			dynamic.runtime
		);
		expect(dynamic.publish.mock.calls[0][1]).toMatchObject({ error: 'b:boom' });
	});

	it('핸들러 실행 중 어떤 일이 있어도 handle은 reject하지 않아요', async () => {
		const { runtime } = makeRuntime();
		runtime.publisher = {
			publish: () => {
				throw new Error('publish exploded');
			}
		};
		await expect(createRedisResponder(contract, async () => ({})).handle(signed(request()), runtime)).resolves.toBeUndefined();
	});
});

describe('createGlobalRedisResponder', () => {
	it('길드 없이 실행하고 요청의 kind만 상관 필드로 실어요', async () => {
		const { runtime, publish } = makeRuntime({ guild: false });
		await createGlobalRedisResponder(adminContract, async () => ({ message: 'pong' })).handle(
			signed({ requestId: REQUEST_ID, kind: 'ping' }),
			runtime
		);
		expect(publish).toHaveBeenCalledWith('admin:response', { requestId: REQUEST_ID, kind: 'ping', message: 'pong' }, '관리 응답');
	});

	it('null이면 응답하지 않아요 (대표 프로세스만 응답)', async () => {
		const { runtime, publish } = makeRuntime();
		await createGlobalRedisResponder(adminContract, async () => null).handle(signed({ requestId: REQUEST_ID, kind: 'ping' }), runtime);
		expect(publish).not.toHaveBeenCalled();
	});
});

describe('createRedisEventListener', () => {
	const schema = z.object({ guildId: z.string().min(1) });
	const signedEvent = defineRedisEvent({ name: '이벤트', channel: 'evt:signed', schema });
	const plainEvent = defineRedisEvent({ name: '평문 이벤트', channel: 'evt:plain', schema, signed: false });

	it('서명된 이벤트는 검증을 통과한 것만 핸들러에 넘겨요', async () => {
		const { runtime, logger } = makeRuntime();
		const handler = vi.fn();
		const listener = createRedisEventListener(signedEvent, handler);
		expect(listener.channel).toBe('evt:signed');
		await listener.handle(wrapRedisMessage('other', { guildId: 'g1' }), runtime);
		await listener.handle(signed({ nope: 1 }), runtime);
		expect(handler).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('서명 검증 실패'));
		await listener.handle(signed({ guildId: 'g1' }), runtime);
		expect(handler).toHaveBeenCalledWith({ event: { guildId: 'g1' }, logger: runtime.logger });
	});

	it('signed:false 이벤트는 서명 없이 평문으로 받아요', async () => {
		const { runtime } = makeRuntime();
		const handler = vi.fn();
		await createRedisEventListener(plainEvent, handler).handle(JSON.stringify({ guildId: 'g1' }), runtime);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('핸들러 예외는 삼키고 error 로그만 남겨요', async () => {
		const { runtime, logger } = makeRuntime();
		await createRedisEventListener(plainEvent, () => {
			throw new Error('listener boom');
		}).handle(JSON.stringify({ guildId: 'g1' }), runtime);
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('listener boom'));
	});
});
