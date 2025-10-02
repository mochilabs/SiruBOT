import { container } from '@sapphire/framework';
import { Guild } from '@sirubot/prisma';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { RepeatMode } from 'lavalink-client';

export class GuildService {
	public async updateVolume(guildId: string, volume: number) {
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, volume },
			update: { volume }
		});

		return guild;
	}

	public async getVolume(guildId: string) {
		const guild = await container.db.guild.findUnique({
			where: { id: guildId },
			select: { volume: true }
		});

		if (guild) {
			return guild.volume;
		}

		const newGuild = await container.db.guild.create({
			data: { id: guildId },
			select: { volume: true }
		});

		return newGuild.volume;
	}

	public async getDJRole(guildId: string): Promise<string | null> {
		const guild = await container.db.guild.findUnique({
			where: { id: guildId },
			select: { djRoleId: true }
		});

		if (guild) {
			return guild.djRoleId;
		}

		const newGuild = await container.db.guild.create({
			data: { id: guildId, djRoleId: null },
			select: { djRoleId: true }
		});

		return newGuild.djRoleId;
	}

	public async setDJRole(guildId: string, djRoleId: string) {
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, djRoleId },
			update: { djRoleId }
		});

		return guild;
	}

	public async hasDJRole(guildId: string, member: GuildMember) {
		const djRoleId = await this.getDJRole(guildId);
		if (djRoleId === null || member.permissions.has(PermissionFlagsBits.Administrator)) return true;
		return member.roles.cache.has(djRoleId);
	}

	public async getRepeat(guildId: string): Promise<RepeatMode> {
		const guild = await container.db.guild.findUnique({
			select: {
				repeat: true
			},
			where: {
				id: guildId
			}
		});

		if (guild) {
			return guild.repeat as RepeatMode;
		}

		const newGuild = await container.db.guild.create({
			data: { id: guildId, repeat: 'off' },
			select: { repeat: true }
		});

		return newGuild.repeat as RepeatMode;
	}

	public async setRepeat(guildId: string, repeat: RepeatMode): Promise<RepeatMode> {
		if (repeat !== 'off' && repeat !== 'track' && repeat !== 'queue') throw new Error('Invalid repeat value');
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, repeat },
			update: { repeat },
			select: { repeat: true }
		});

		return guild.repeat as RepeatMode;
	}

	public async getRelated(guildId: string): Promise<boolean> {
		const guild = await container.db.guild.findUnique({
			where: { id: guildId },
			select: { related: true }
		});

		if (guild) {
			return guild.related;
		}

		const newGuild = await container.db.guild.create({
			data: { id: guildId, related: false },
			select: { related: true }
		});

		return newGuild.related;
	}

	public async setRelated(guildId: string, related: boolean): Promise<boolean> {
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, related },
			update: { related },
			select: { related: true }
		});

		return guild.related;
	}

	public async getGuild(guildId: string): Promise<Guild> {
		const guild = await container.db.guild.findUnique({
			where: { id: guildId }
		});

		if (guild) {
			return guild;
		}

		const newGuild = await container.db.guild.create({
			data: { id: guildId }
		});

		return newGuild;
	}
}
