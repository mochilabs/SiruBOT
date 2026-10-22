import { container } from '@sapphire/framework';
import { Guild, Prisma } from '@sirubot/prisma';
import { MemoryCache } from '@sirubot/utils';

/**
 * 길드 설정 캐시와 DB 접근의 뼈대 — GuildService가 상속하고, 도메인 모듈(재생·채널·JTC·믹서·챗 정책)이
 * getGuild/upsert* 공용 헬퍼로 읽고 써요.
 *
 * 캐시 규칙:
 * - 60초 TTL(최대 500 길드), 같은 길드의 냉각 읽기는 pendingReads로 1회만 병합해요.
 * - 무효화 1회마다 세대를 1 올려, 무효화 "이전"에 시작된 in-flight 조회가 완료돼도
 *   stale 값을 캐시에 다시 심지 않게 해요.
 */
export class GuildSettingsStore {
	// Guild settings cache (60s TTL, max 500)
	private cache = new MemoryCache<string, Guild>({ ttl: 60_000, maxSize: 500 });
	private readonly pendingReads = new Map<string, Promise<Guild>>();
	/** 길드별 무효화 세대 — 무효화 1회마다 1씩 증가해요 (단조 증가, 삭제하지 않아요) */
	private readonly invalidationGeneration = new Map<string, number>();

	/**
	 * Get guild settings. If cached, return from cache, otherwise upsert from DB.
	 */
	public async getGuild(guildId: string): Promise<Guild> {
		const cached = this.cache.get(guildId);
		if (cached) return cached;

		const existing = this.pendingReads.get(guildId);
		if (existing) return existing;

		const pending = this.loadGuild(guildId);
		this.pendingReads.set(guildId, pending);
		try {
			return await pending;
		} finally {
			if (this.pendingReads.get(guildId) === pending) this.pendingReads.delete(guildId);
		}
	}

	private async loadGuild(guildId: string): Promise<Guild> {
		/** DB 조회 시작 시점의 무효화 세대 — 완료 시점과 비교해 stale 재심기를 막아요 */
		const myGeneration = this.invalidationGeneration.get(guildId) ?? 0;
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId },
			update: {}
		});

		// 조회 중 setter가 갱신한 설정을 오래된 조회 결과로 덮어쓰지 않는다.
		const updated = this.cache.get(guildId);
		if (updated) return updated;

		// 조회 중 무효화가 일어나 세대가 올라갔으면 이 결과는 무효화 이전 read-시점 값 —
		// 캐시에 심지 않고 호출자에게만 돌려요 (다음 조회는 DB에서 최신을 읽어요).
		if ((this.invalidationGeneration.get(guildId) ?? 0) !== myGeneration) return guild;

		// 세대가 그대로면 이 조회는 최신 무효화 이후의 DB read라 fresh — 캐시에 심어요.
		this.updateCache(guild);
		return guild;
	}

	/**
	 * 캐시에서 특정 길드 설정을 비워요 — 대시보드 저장을 Redis Pub/Sub으로 전파받으면 호출해요.
	 *
	 * pendingReads 경쟁 처리: 무효화 때 세대를 1 올려 둬서, 무효화 "이전"에 DB read를 시작해
	 * "이후"에 끝나는 in-flight 조회(loadGuild)가 stale 값을 캐시에 다시 심지 않게 해요.
	 * 그런 조회는 세대 불일치로 감지되어 캐시 미스로 남겨 다음 조회가 DB에서 다시 읽어요.
	 */
	public invalidate(guildId: string): void {
		this.cache.delete(guildId);
		this.invalidationGeneration.set(guildId, (this.invalidationGeneration.get(guildId) ?? 0) + 1);
	}

	/** Update cache with fresh data (used when setter is called) — 도메인 모듈이 쓰는 공용 헬퍼 */
	public updateCache(guild: Guild) {
		this.cache.set(guild.id, guild);
	}

	/** 단일 필드 upsert — 성공하면 캐시도 함께 갱신해요 (도메인 모듈 공용 헬퍼) */
	public async upsertField<K extends keyof Omit<Guild, 'id'>>(guildId: string, field: K, value: Guild[K]): Promise<Guild> {
		const data = { [field]: value } as Prisma.GuildUpdateInput;
		return this.upsertData(guildId, data);
	}

	/** 여러 필드 upsert — upsertField와 같은 캐시 갱신 규칙을 따라요 (도메인 모듈 공용 헬퍼) */
	public async upsertData(guildId: string, data: Prisma.GuildUpdateInput): Promise<Guild> {
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, ...data } as Prisma.GuildCreateInput,
			update: data
		});

		this.updateCache(guild);
		return guild;
	}
}
