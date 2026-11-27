import { Guild, Prisma, type PrismaClient } from '@sirubot/prisma';
import { MemoryCache } from '@sirubot/utils';

export interface GuildSettingsStoreDeps {
	db: Pick<PrismaClient, 'guild'>;
}

export class GuildSettingsStore {
	private cache = new MemoryCache<string, Guild>({ ttl: 60_000, maxSize: 500 });
	private readonly pendingReads = new Map<string, Promise<Guild>>();
	private readonly invalidationGeneration = new Map<string, number>();

	constructor(private readonly deps: GuildSettingsStoreDeps) {}

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
		const myGeneration = this.invalidationGeneration.get(guildId) ?? 0;
		const guild = await this.deps.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId },
			update: {}
		});

		// 조회 중 setter가 갱신한 설정을 오래된 조회 결과로 덮어쓰지 않는다.
		const updated = this.cache.get(guildId);
		if (updated) return updated;

		// 무효화 이전에 시작된 조회 결과는 캐시에 다시 심지 않아요
		if ((this.invalidationGeneration.get(guildId) ?? 0) !== myGeneration) return guild;

		this.updateCache(guild);
		return guild;
	}

	public peekCached(guildId: string): Guild | undefined {
		return this.cache.get(guildId);
	}

	public invalidate(guildId: string): void {
		this.cache.delete(guildId);
		this.invalidationGeneration.set(guildId, (this.invalidationGeneration.get(guildId) ?? 0) + 1);
	}

	public updateCache(guild: Guild) {
		this.cache.set(guild.id, guild);
	}

	public async upsertField<K extends keyof Omit<Guild, 'id'>>(guildId: string, field: K, value: Guild[K]): Promise<Guild> {
		const data = { [field]: value } as Prisma.GuildUpdateInput;
		return this.upsertData(guildId, data);
	}

	public updateRow(guildId: string, data: Prisma.GuildUpdateInput): Promise<Guild> {
		return this.deps.db.guild.update({ where: { id: guildId }, data });
	}

	public async upsertData(guildId: string, data: Prisma.GuildUpdateInput): Promise<Guild> {
		const guild = await this.deps.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, ...data } as Prisma.GuildCreateInput,
			update: data
		});

		this.updateCache(guild);
		return guild;
	}
}
