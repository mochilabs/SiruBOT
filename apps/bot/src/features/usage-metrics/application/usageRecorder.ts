/**
 * 익명 기능 사용 지표 — 서버·사용자 식별자 없이 KST 날짜×feature 전체 횟수만 모아요 (FeatureDailyUse).
 *
 * - `record()`는 메모리에만 쌓아요 (hot path에서 I/O 없음). `flushIntervalMs`마다 한 번에 DB로 보내요.
 * - DB와 Redis 어디에도 서버별 사용량이나 사용자 ID를 남기지 않아요.
 * - feature 키 규칙은 `@sirubot/utils/modules`의 `usageFeatureKey`예요.
 */
import type { PrismaClient } from '@sirubot/prisma';
import { kstDay } from '@sirubot/utils/trackIdentity';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { Stoppable } from '../../../lib/lifecycle.ts';

export const USAGE_FLUSH_INTERVAL_MS = 60_000;
/** 봇이 스스로 한 일이라 "첫 사용"으로 치지 않는 feature (온보딩 안내 발송) */
export const USAGE_NOT_FIRST_USE = new Set(['onboarding:sent']);
/** 한 번에 보내는 upsert 수 */
const UPSERT_CHUNK = 20;

/** 첫 사용 시각 기록 (GuildLifecycle). 온보딩 서비스가 구현해요. */
export interface FirstUsePort {
	markFirstUse(guildIds: readonly string[], at: Date): Promise<void>;
}

export interface UsageRecorderDeps {
	db: Pick<PrismaClient, 'featureDailyUse'>;
	firstUse: FirstUsePort;
	logger: AppLogger;
	now?: () => Date;
	flushIntervalMs?: number;
}

interface Bucket {
	day: Date;
	feature: string;
	count: number;
}

export class UsageRecorder implements Stoppable {
	public readonly name = '사용 지표';

	private buffer = new Map<string, Bucket>();
	/** 이번 flush 묶음에서 첫 사용 확인이 필요한 서버 ID(메모리 전용, FeatureDailyUse에는 쓰지 않아요) */
	private pendingFirstUseGuilds = new Set<string>();
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

	/** 익명 사용 1회 기록. DM(guildId 없음)과 종료 뒤 기록은 버려요. userId는 저장하지 않아요. */
	public record(guildId: string | null | undefined, feature: string, _userId?: string | null): void {
		if (this.stopped || !guildId) return;
		const day = kstDay(this.now());
		const dayKey = day.toISOString().slice(0, 10);
		const key = `${dayKey}|${feature}`;
		let bucket = this.buffer.get(key);
		if (!bucket) {
			bucket = { day, feature, count: 0 };
			this.buffer.set(key, bucket);
		}
		bucket.count++;
		if (!USAGE_NOT_FIRST_USE.has(feature) && !this.firstUseMarked.has(guildId)) {
			this.pendingFirstUseGuilds.add(guildId);
		}
	}

	/** 지금까지 모은 것을 DB로 보내요. 실패한 묶음은 버려요 (지표라 재시도하지 않아요). */
	public flush(): Promise<void> {
		if (this.buffer.size === 0 && this.pendingFirstUseGuilds.size === 0) return Promise.resolve();
		const buckets = [...this.buffer.values()];
		const newGuilds = [...this.pendingFirstUseGuilds];
		this.buffer = new Map();
		this.pendingFirstUseGuilds = new Set();
		const write: Promise<void> = this.write(buckets, newGuilds)
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

	private async write(buckets: Bucket[], newGuilds: string[]): Promise<void> {
		for (let i = 0; i < buckets.length; i += UPSERT_CHUNK) {
			await Promise.all(buckets.slice(i, i + UPSERT_CHUNK).map((bucket) => this.upsert(bucket)));
		}
		if (newGuilds.length > 0) {
			await this.deps.firstUse.markFirstUse(newGuilds, this.now());
			for (const id of newGuilds) this.firstUseMarked.add(id);
		}
	}

	private async upsert(bucket: Bucket): Promise<void> {
		await this.deps.db.featureDailyUse.upsert({
			where: { day_feature: { day: bucket.day, feature: bucket.feature } },
			create: { day: bucket.day, feature: bucket.feature, count: bucket.count },
			update: { count: { increment: bucket.count } }
		});
	}
}
