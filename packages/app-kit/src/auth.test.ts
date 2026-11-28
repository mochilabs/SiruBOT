import { describe, expect, it, vi } from 'vitest';
import { createKeyAuthHook, createKeyPreHandler, timingSafeKeyEqual } from './auth.ts';

describe('timingSafeKeyEqual', () => {
	it('같은 키는 true, 다른 키는 false예요', () => {
		expect(timingSafeKeyEqual('secret-key', 'secret-key')).toBe(true);
		expect(timingSafeKeyEqual('secret-key', 'secret-kex')).toBe(false);
	});

	it('길이가 달라도 throw하지 않고 false를 돌려줘요 (sha256 다이제스트 비교)', () => {
		expect(timingSafeKeyEqual('short', 'much-longer-key')).toBe(false);
		expect(timingSafeKeyEqual('', 'key')).toBe(false);
	});

	it('유니코드 키도 일관되게 비교해요', () => {
		expect(timingSafeKeyEqual('비밀키-🔑', '비밀키-🔑')).toBe(true);
		expect(timingSafeKeyEqual('비밀키-🔑', '비밀키-🗝️')).toBe(false);
	});
});

describe('createKeyPreHandler', () => {
	function reply() {
		return {
			code: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis()
		};
	}

	/** preHandler는 fastify this-바인딩 시그니처라 테스트에서는 평문 함수로 호출해요 */
	function plainHandler(options: { key: string; appName: string }): (req: unknown, reply: unknown) => Promise<unknown> {
		return createKeyPreHandler(options) as unknown as (req: unknown, reply: unknown) => Promise<unknown>;
	}

	it('빈 키면 생성 시점에 throw — 인증 없는 서비스로 기동하지 않아요', () => {
		expect(() => plainHandler({ key: '', appName: 'storage' })).toThrow(/auth key가 비어 있어요/);
	});

	it('Authorization 헤더가 없으면 401이에요', async () => {
		const handler = plainHandler({ key: 'k', appName: 'storage' });
		const res = reply();
		await handler({ headers: {} }, res);
		expect(res.code).toHaveBeenCalledWith(401);
		expect(res.send).toHaveBeenCalledWith({ error: '인증 정보가 없어요.' });
	});

	it('잘못된 키면 401이에요', async () => {
		const handler = plainHandler({ key: 'k', appName: 'storage' });
		const res = reply();
		await handler({ headers: { authorization: 'wrong' } }, res);
		expect(res.code).toHaveBeenCalledWith(401);
		expect(res.send).toHaveBeenCalledWith({ error: '인증에 실패했어요.' });
	});

	it('올바른 키(원문, Bearer 없음)면 통과해요', async () => {
		const handler = plainHandler({ key: 'k', appName: 'storage' });
		const res = reply();
		const result = await handler({ headers: { authorization: 'k' } }, res);
		expect(result).toBeUndefined();
		expect(res.code).not.toHaveBeenCalled();
	});
});

describe('createKeyAuthHook', () => {
	function fakeFastify() {
		return { addHook: vi.fn() };
	}

	it('키가 없으면 등록 시 throw — fail-closed로 기동을 거부해요', async () => {
		const plugin = createKeyAuthHook({ key: undefined, appName: 'Test', excludePaths: [] });
		await expect(plugin(fakeFastify() as never)).rejects.toThrow(/AUTH_KEY is not set/);
	});

	it('키가 있으면 onRequest 훅을 등록해요', async () => {
		const plugin = createKeyAuthHook({ key: 'secret', appName: 'Test', excludePaths: ['/api/health'] });
		const fastify = fakeFastify();
		await plugin(fastify as never);
		expect(fastify.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
	});

	it('제외 경로는 인증을 건너뛰고, 보호 경로는 키를 검증해요', async () => {
		const plugin = createKeyAuthHook({ key: 'secret', appName: 'Test', excludePaths: ['/api/health'] });
		const fastify = fakeFastify();
		await plugin(fastify as never);
		const hook = fastify.addHook.mock.calls[0]![1] as (req: unknown, reply: unknown) => Promise<void>;
		const res = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };

		await hook({ url: '/api/health', headers: {} }, res);
		expect(res.send).not.toHaveBeenCalled();

		await hook({ url: '/x', headers: { authorization: 'secret' } }, res);
		expect(res.send).not.toHaveBeenCalled();

		await hook({ url: '/x', headers: {} }, res);
		expect(res.code).toHaveBeenCalledWith(401);
		expect(res.send).toHaveBeenCalledWith({ error: '인증 정보가 없어요.' });

		await hook({ url: '/x', headers: { authorization: 'wrong' } }, res);
		expect(res.code).toHaveBeenLastCalledWith(401);
		expect(res.send).toHaveBeenLastCalledWith({ error: '인증에 실패했어요.' });

		await hook({ url: '/api/health?x=1', headers: {} }, res);
		expect(res.code).toHaveBeenLastCalledWith(401);
	});
});
