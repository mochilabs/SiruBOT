import type { PrismaClient } from '@sirubot/prisma';
import { kstDay } from '@sirubot/utils/trackIdentity';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { Stoppable } from '../../../lib/lifecycle.ts';

export const USAGE_FLUSH_INTERVAL_MS = 60_000;
export const USAGE_NOT_FIRST_USE = new Set(['onboarding:sent']);
const UPSERT_CHUNK = 20;

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
	private pendingFirstUseGuilds = new Set<string>();
	private readonly firstUseMarked = new Set<string>();
	private readonly inFlight = new Set<Promise<void>>();
	private timer: ReturnType<typeof setInterval> | null = null;
	private stopped = false;

	public constructor(private readonly deps: UsageRecorderDeps) {}

	public start(): void {
		if (this.stopped || this.timer) return;
		this.timer = setInterval(() => void this.flush(), this.deps.flushIntervalMs ?? USAGE_FLUSH_INTERVAL_MS);
		this.timer.unref?.();
	}

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
