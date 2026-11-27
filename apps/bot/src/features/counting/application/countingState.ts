import type { RedisStore } from '../../music/index.ts';
import type { Stoppable } from '../../../lib/lifecycle.ts';
import { type CountingState, COUNTING_STATE_DEFAULT } from '@sirubot/utils';

const COUNTING_KEY_PREFIX = 'sirubot:counting:';

export function countingStateKey(guildId: string): string {
	return `${COUNTING_KEY_PREFIX}${guildId}`;
}

export interface CountingStateDeps {
	getRedisStore: () => Pick<RedisStore, 'getCacheHashFields' | 'setCacheHashFields' | 'deleteCacheValue'>;
}

export class CountingStateStore implements Stoppable {
	public readonly name = '카운팅 상태';

	private readonly memory = new Map<string, CountingState>();
	private readonly flushScheduled = new Set<string>();
	private readonly inFlight = new Set<Promise<void>>();
	private stopped = false;

	public constructor(private readonly deps: CountingStateDeps) {}

	public async load(guildId: string): Promise<CountingState> {
		const cached = this.memory.get(guildId);
		if (cached) return cached;

		const fields = await this.deps
			.getRedisStore()
			.getCacheHashFields(countingStateKey(guildId))
			.catch(() => null);
		if (fields && fields.current !== undefined) {
			const state: CountingState = {
				current: Number.parseInt(fields.current, 10) || 0,
				lastUserId: fields.lastUserId && fields.lastUserId.length > 0 ? fields.lastUserId : null,
				best: Number.parseInt(fields.best, 10) || 0
			};
			this.memory.set(guildId, state);
			return state;
		}
		return COUNTING_STATE_DEFAULT;
	}

	public save(guildId: string, state: CountingState): void {
		this.memory.set(guildId, state);
		this.scheduleFlush(guildId);
	}

	private scheduleFlush(guildId: string): void {
		if (this.stopped || this.flushScheduled.has(guildId)) return;
		this.flushScheduled.add(guildId);
		queueMicrotask(() => void this.flush(guildId));
	}

	private flush(guildId: string): Promise<void> {
		if (!this.flushScheduled.delete(guildId)) return Promise.resolve();
		const state = this.memory.get(guildId);
		if (!state) return Promise.resolve();
		const write: Promise<void> = (async () => {
			await this.deps
				.getRedisStore()
				.setCacheHashFields(countingStateKey(guildId), {
					current: String(state.current),
					lastUserId: state.lastUserId ?? '',
					best: String(state.best)
				})
				.catch(() => undefined);
		})().finally(() => this.inFlight.delete(write));
		this.inFlight.add(write);
		return write;
	}

	public async reset(guildId: string): Promise<void> {
		this.memory.delete(guildId);
		await this.deps
			.getRedisStore()
			.deleteCacheValue(countingStateKey(guildId))
			.catch(() => undefined);
	}

	public async stop(): Promise<void> {
		await Promise.all([...this.flushScheduled].map((guildId) => this.flush(guildId)));
		this.stopped = true;
		await Promise.all([...this.inFlight]);
	}
}
