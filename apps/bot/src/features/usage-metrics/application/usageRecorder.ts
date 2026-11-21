/**
 * 기능 사용 지표 — 서버×KST 날짜×feature로 횟수와 고유 사용자 수를 모아요 (FeatureDailyUse).
 *
 * - `record()`는 메모리에만 쌓아요 (hot path에서 I/O 없음). `flushIntervalMs`마다 한 번에 DB로 보내요.
 * - 고유 사용자 수: 사용자 ID를 Redis Set(`sirubot:usage:users:{day}:{guildId}:{feature}`, TTL 48시간)에 모으고
 *   그 크기만 DB에 써요. DB에는 사용자 ID가 남지 않아요. 샤드 여러 개가 같은 Set을 보니까 값이 일관돼요.
 * - Redis가 없으면 새 행은 이번 묶음의 메모리 Set 크기로 근사하고, 이미 있는 행의 users는 그대로 둬요.
 * - feature 키 규칙은 `@sirubot/utils/modules`의 `usageFeatureKey`예요.
 */
import type { PrismaClient } from '@sirubot/prisma';
import { kstDay } from '@sirubot/utils/trackIdentity';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { Stoppable } from '../../../lib/lifecycle.ts';
import type { RedisStore } from '../../music/index.ts';

export const USAGE_FLUSH_INTERVAL_MS = 60_000;
export const USAGE_USER_SET_TTL_SECONDS = 48 * 60 * 60;
/** 봇이 스스로 한 일이라 "첫 사용"으로 치지 않는 feature (온보딩 안내 발송) */
export const USAGE_NOT_FIRST_USE = new Set(['onboarding:sent']);
/** 한 번에 보내는 upsert 수 */
const UPSERT_CHUNK = 20;

export function usageUserSetKey(dayKey: string, guildId: string, feature: string): string {
	return `sirubot:usage:users:${dayKey}:${guildId}:${feature}`;
}

/** 첫 사용 시각 기록 (GuildLifecycle). 온보딩 서비스가 구현해요. */
export interface FirstUsePort {
	markFirstUse(guildIds: readonly string[], at: Date): Promise<void>;
}

export interface UsageRecorderDeps {
	db: Pick<PrismaClient, 'featureDailyUse'>;
	/** redisStore는 setupServices 뒤에 만들어져서 호출 시점에 읽어요 */
	getRedisStore: () => Pick<RedisStore, 'addToSetAndCount'>;
	firstUse: FirstUsePort;
	logger: AppLogger;
	now?: () => Date;
	flushIntervalMs?: number;
}

interface Bucket {
	guildId: string;
	day: Date;
	dayKey: string;
	feature: string;
	count: number;
	users: Set<string>;
}

export class UsageRecorder implements Stoppable {
	public readonly name = '사용 지표';

	private buffer = new Map<string, Bucket>();
	/** 이 프로세스에서 이미 첫 사용을 기록한 서버 — 같은 서버에 updateMany를 반복하지 않아요 */
	private readonly firstUseMarked = new Set<string>();
	private readonly inFlight = new Set<Promise<void>>();
	private timer: ReturnType<typeof setInterval> | null = null;
	private stopped = false;

	public constructor(private readonly deps: UsageRecorderDeps) {}

	/** 주기 flush 시작 (clientReady에서 불러요). 두 번 불러도 타이머는 하나예요. */
	public start(): void {
		if (this.stopped || this.timer) return;
		this.timer = setInterval(() => void this.flush(), this.deps.flushIntervalMs ?? USAGE_FLUSH_INTERVAL_MS);
		this.timer.unref?.();
	}

	/** 사용 1회 기록. DM(guildId 없음)과 종료 뒤 기록은 버려요. */
	public record(guildId: string | null | undefined, feature: string, userId?: string | null): void {
		if (this.stopped || !guildId) return;
		const day = kstDay(this.now());
		const dayKey = day.toISOString().slice(0, 10);
		const key = `${dayKey}|${guildId}|${feature}`;
		let bucket = this.buffer.get(key);
		if (!bucket) {
			bucket = { guildId, day, dayKey, feature, count: 0, users: new Set() };
			this.buffer.set(key, bucket);
		}
		bucket.count++;
		if (userId) bucket.users.add(userId);
	}

	/** 지금까지 모은 것을 DB로 보내요. 실패한 묶음은 버려요 (지표라 재시도하지 않아요). */
	public flush(): Promise<void> {
		if (this.buffer.size === 0) return Promise.resolve();
		const buckets = [...this.buffer.values()];
		this.buffer = new Map();
		const write: Promise<void> = this.write(buckets)
			.catch((error) => this.deps.logger.warn(`[usage] flush failed (${buckets.length} rows): ${error}`))
			.finally(() => this.inFlight.delete(write));
		this.inFlight.add(write);
		return write;
	}

	/** 종료: 타이머를 멈추고 남은 것을 지금 보내고 진행 중인 쓰기를 기다려요. 이후 기록은 받지 않아요. */
	public async stop(): Promise<void> {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		await this.flush();
		this.stopped = true;
		await Promise.all([...this.inFlight]);
	}

	private now(): Date {
		return this.deps.now?.() ?? new Date();
	}

	private async write(buckets: Bucket[]): Promise<void> {
		for (let i = 0; i < buckets.length; i += UPSERT_CHUNK) {
			await Promise.all(buckets.slice(i, i + UPSERT_CHUNK).map((bucket) => this.upsert(bucket)));
		}
		const usedGuilds = buckets.filter((b) => !USAGE_NOT_FIRST_USE.has(b.feature)).map((b) => b.guildId);
		const newGuilds = [...new Set(usedGuilds)].filter((id) => !this.firstUseMarked.has(id));
		if (newGuilds.length > 0) {
			await this.deps.firstUse.markFirstUse(newGuilds, this.now());
			for (const id of newGuilds) this.firstUseMarked.add(id);
		}
	}

	private async upsert(bucket: Bucket): Promise<void> {
		const users = await this.deps
			.getRedisStore()
			.addToSetAndCount(usageUserSetKey(bucket.dayKey, bucket.guildId, bucket.feature), [...bucket.users], USAGE_USER_SET_TTL_SECONDS)
			.catch(() => null);
		await this.deps.db.featureDailyUse.upsert({
			where: { guildId_day_feature: { guildId: bucket.guildId, day: bucket.day, feature: bucket.feature } },
			create: { guildId: bucket.guildId, day: bucket.day, feature: bucket.feature, count: bucket.count, users: users ?? bucket.users.size },
			update: { count: { increment: bucket.count }, ...(users !== null ? { users } : {}) }
		});
	}
}
