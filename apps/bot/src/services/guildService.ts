import { container } from '@sapphire/framework';
import { Guild } from '@sirubot/prisma';
import { MemoryCache } from '@sirubot/utils';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { RepeatMode } from 'lavalink-client';

export class GuildService {
	// Guild settings cache (60s TTL, max 500)
	private cache = new MemoryCache<string, Guild>({ ttl: 60_000, maxSize: 500 });

	/**
	 * Get guild settings. If cached, return from cache, otherwise upsert from DB.
	 */
	public async getGuild(guildId: string): Promise<Guild> {
		const cached = this.cache.get(guildId);
		if (cached) return cached;

		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId },
			update: {}
		});

		this.cache.set(guildId, guild);
		return guild;
	}

	/** Invalidate cache (used when setter is called) */
	private invalidateCache(guildId: string) {
		this.cache.delete(guildId);
	}

	public async updateVolume(guildId: string, volume: number) {
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, volume },
			update: { volume }
		});

		this.invalidateCache(guildId);
		return guild;
	}

	public async getVolume(guildId: string) {
		const guild = await this.getGuild(guildId);
		return guild.volume;
	}

	public async getDJRole(guildId: string): Promise<string | null> {
		const guild = await this.getGuild(guildId);
		return guild.djRoleId;
	}

	public async setDJRole(guildId: string, djRoleId: string | null) {
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, djRoleId },
			update: { djRoleId }
		});

		this.invalidateCache(guildId);
		return guild;
	}

	public async hasDJRole(guildId: string, member: GuildMember) {
		const djRoleId = await this.getDJRole(guildId);
		if (djRoleId === null || member.permissions.has(PermissionFlagsBits.Administrator)) return true;
		return member.roles.cache.has(djRoleId);
	}

	public async getRepeat(guildId: string): Promise<RepeatMode> {
		const guild = await this.getGuild(guildId);
		return guild.repeat as RepeatMode;
	}

	public async setRepeat(guildId: string, repeat: RepeatMode): Promise<RepeatMode> {
		if (repeat !== 'off' && repeat !== 'track' && repeat !== 'queue') throw new Error('Invalid repeat value');
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, repeat },
			update: { repeat },
			select: { repeat: true }
		});

		this.invalidateCache(guildId);
		return guild.repeat as RepeatMode;
	}

	public async getRelated(guildId: string): Promise<boolean> {
		const guild = await this.getGuild(guildId);
		return guild.related;
	}

	public async setRelated(guildId: string, related: boolean): Promise<boolean> {
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, related },
			update: { related },
			select: { related: true }
		});

		this.invalidateCache(guildId);
		return guild.related;
	}

	public async setDefaultTextChannel(guildId: string, textChannelId: string | null) {
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, textChannelId },
			update: { textChannelId }
		});

		this.invalidateCache(guildId);
		return guild.textChannelId;
	}

	public async getDefaultTextChannel(guildId: string): Promise<string | null> {
		const guild = await this.getGuild(guildId);
		return guild.textChannelId;
	}

	public async setDefaultVoiceChannel(guildId: string, voiceChannelId: string | null) {
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, voiceChannelId },
			update: { voiceChannelId }
		});

		this.invalidateCache(guildId);
		return guild.voiceChannelId;
	}

	public async getDefaultVoiceChannel(guildId: string): Promise<string | null> {
		const guild = await this.getGuild(guildId);
		return guild.voiceChannelId;
	}

	public async getEnableController(guildId: string): Promise<boolean> {
		const guild = await this.getGuild(guildId);
		return guild.enableController;
	}

	public async setEnableController(guildId: string, enableController: boolean) {
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, enableController },
			update: { enableController }
		});

		this.invalidateCache(guildId);
		return guild.enableController;
	}
}
