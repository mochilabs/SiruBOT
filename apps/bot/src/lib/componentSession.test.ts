import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createComponentSession } from './componentSession.ts';

/** InteractionCollector 흉내 — filter를 지키고 stop하면 end를 내보내요. */
class FakeCollector extends EventEmitter {
	ended = false;
	stop = vi.fn((reason?: string) => {
		if (this.ended) return;
		this.ended = true;
		this.emit('end', new Map(), reason ?? 'user');
	});
	constructor(readonly options: { filter: (i: never) => boolean; time: number; idle?: number; componentType?: number }) {
		super();
	}
	press(interaction: object) {
		if (this.ended || !this.options.filter(interaction as never)) return undefined;
		return this.listeners('collect')[0]!(interaction);
	}
}

function setup(options: Record<string, unknown>) {
	let created!: FakeCollector;
	const source = {
		createMessageComponentCollector: vi.fn((o: FakeCollector['options']) => (created = new FakeCollector(o)))
	};
	const onCollect = vi.fn();
	const onTimeout = vi.fn();
	const session = createComponentSession(source as never, { time: 30_000, onCollect, onTimeout, filter: () => true, ...options } as never);
	return { session, collector: created, source, onCollect, onTimeout };
}

const press = (id: string, userId = 'owner') => ({ customId: id, user: { id: userId }, reply: vi.fn().mockResolvedValue(undefined) });

describe('createComponentSession', () => {
	it('시간·idle·componentType을 그대로 넘기고, 없는 옵션은 넘기지 않아요', () => {
		const a = setup({ time: 10, idle: 5, componentType: 2 });
		expect(a.collector.options).toMatchObject({ time: 10, idle: 5, componentType: 2 });
		const b = setup({});
		expect(Object.keys(b.collector.options).sort()).toEqual(['filter', 'time']);
	});

	it('filter를 통과한 입력만 onCollect로 가요', () => {
		const { collector, onCollect } = setup({ filter: (i: { customId: string }) => i.customId === 'ok' });
		collector.press(press('no'));
		collector.press(press('ok'));
		expect(onCollect).toHaveBeenCalledTimes(1);
		expect(onCollect.mock.calls[0]![0].customId).toBe('ok');
	});

	it('owner 옵션은 다른 사람을 걸러내고 ephemeral 안내를 보내요', () => {
		const { collector, onCollect } = setup({
			filter: undefined,
			owner: { userId: 'owner', accept: (i: { customId: string }) => i.customId === 'ok' }
		});
		const stranger = press('ok', 'stranger');
		expect(collector.press(stranger)).toBeUndefined();
		expect(stranger.reply).toHaveBeenCalledTimes(1);
		const outsideScope = press('other', 'owner');
		collector.press(outsideScope);
		expect(outsideScope.reply).not.toHaveBeenCalled();
		collector.press(press('ok', 'owner'));
		expect(onCollect).toHaveBeenCalledTimes(1);
	});

	it('settle은 한 번만 성공하고 사유와 함께 컬렉터를 멈추며 onTimeout은 부르지 않아요', () => {
		const { session, collector, onTimeout } = setup({});
		expect(session.settled).toBe(false);
		expect(session.settle('select')).toBe(true);
		expect(session.settle('cancel')).toBe(false);
		expect(collector.stop).toHaveBeenCalledTimes(1);
		expect(collector.stop).toHaveBeenCalledWith('select');
		expect(session.settled).toBe(true);
		expect(onTimeout).not.toHaveBeenCalled();
	});

	it('settle되지 않은 채 끝나면 onTimeout이 한 번만, 끝나는 순간 동기로 불려요', () => {
		const { session, collector, onTimeout } = setup({});
		collector.emit('end', new Map(), 'time');
		expect(onTimeout).toHaveBeenCalledTimes(1);
		expect(onTimeout).toHaveBeenCalledWith(session);
		expect(session.settled).toBe(true);
		expect(session.settle()).toBe(false);
	});

	it('onTimeout이 없어도 끝나면 settled가 돼요', () => {
		const { session, collector } = setup({ onTimeout: undefined });
		collector.emit('end', new Map(), 'time');
		expect(session.settled).toBe(true);
	});

	it('핸들러가 settle하지 않으면 여러 번 눌러도 계속 받아요 (여러 번 누르는 패널)', () => {
		const { collector, onCollect, onTimeout } = setup({});
		collector.press(press('a'));
		collector.press(press('b'));
		expect(onCollect).toHaveBeenCalledTimes(2);
		expect(onTimeout).not.toHaveBeenCalled();
	});

	it('핸들러 오류는 삼키지 않고 Promise 거부로 그대로 돌려줘요 (세션 상태도 건드리지 않아요)', async () => {
		const { session, collector, onTimeout } = setup({
			onCollect: () => Promise.reject(new Error('boom'))
		});
		await expect(collector.press(press('a'))).rejects.toThrow('boom');
		expect(session.settled).toBe(false);
		collector.emit('end', new Map(), 'time');
		expect(onTimeout).toHaveBeenCalledTimes(1);
	});

	it('onCollect에서 settle하면 이후 시간 초과 처리는 건너뛰어요', () => {
		const { collector, onTimeout } = setup({
			onCollect: (_i: unknown, s: { settle: (r: string) => boolean }) => void s.settle('done')
		});
		collector.press(press('a'));
		expect(collector.ended).toBe(true);
		expect(onTimeout).not.toHaveBeenCalled();
	});
});
