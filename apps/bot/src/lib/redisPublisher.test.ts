import { describe, expect, it, vi } from 'vitest';
import { unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { RedisPublisher, type RawRedisPublisher } from './redisPublisher.ts';

const makeLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() });

describe('RedisPublisher', () => {
	it('서명 키가 있으면 서명 봉투로 감싸 같은 채널·라벨로 보내요', () => {
		const store: RawRedisPublisher = { publish: vi.fn() };
		new RedisPublisher({ getStore: () => store, signingKey: 'secret', logger: makeLogger() }).publish('ch', { a: 1 }, 'label');
		const [channel, payload, label] = vi.mocked(store.publish).mock.calls[0];
		expect(channel).toBe('ch');
		expect(label).toBe('label');
		expect(unwrapRedisMessage('secret', payload)).toBe(JSON.stringify({ a: 1 }));
	});

	it('서명 키가 없으면 본문 JSON을 그대로 보내요 (구버전 모드)', () => {
		const store: RawRedisPublisher = { publish: vi.fn() };
		new RedisPublisher({ getStore: () => store, signingKey: '', logger: makeLogger() }).publish('ch', { a: 1 }, 'label');
		expect(store.publish).toHaveBeenCalledWith('ch', '{"a":1}', 'label');
	});

	it('연결(redisStore)이 없으면 경고만 남기고 던지지 않아요', () => {
		const logger = makeLogger();
		expect(() => new RedisPublisher({ getStore: () => undefined, signingKey: '', logger }).publish('ch', {}, '길드 데이터 응답')).not.toThrow();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('길드 데이터 응답'));
	});

	it('연결은 호출 시점에 읽어요 (부팅 순서와 무관)', () => {
		const logger = makeLogger();
		let store: RawRedisPublisher | undefined;
		const publisher = new RedisPublisher({ getStore: () => store, signingKey: '', logger });
		publisher.publish('ch', 1, 'x');
		store = { publish: vi.fn() };
		publisher.publish('ch', 2, 'x');
		expect(store.publish).toHaveBeenCalledTimes(1);
	});
});
