import { container } from '@sapphire/framework';
import { GuildMember, PermissionFlagsBits } from 'discord.js';

export class GuildService {
	public async updateVolume(guildId: string, volume: number) {
		const guild = await container.db.guildSettings.upsert({
			where: { id: guildId },
			create: { id: guildId, volume },
			update: { volume }
		});

		return guild;
	}

	public async getVolume(guildId: string) {
		const guild = await container.db.guildSettings.findUnique({
			where: { id: guildId },
			select: { volume: true }
		});

		if (guild) {
			return guild.volume;
		}

		const newGuild = await container.db.guildSettings.create({
			data: { id: guildId },
			select: { volume: true }
		});

		return newGuild.volume;
	}

	public async getDJRole(guildId: string): Promise<string | null> {
		const guild = await container.db.guildSettings.findUnique({
			where: { id: guildId },
			select: { djRoleId: true }
		});

		if (guild) {
			return guild.djRoleId;
		}

		const newGuild = await container.db.guildSettings.create({
			data: { id: guildId, djRoleId: null },
			select: { djRoleId: true }
		});

		return newGuild.djRoleId;
	}

	public async setDJRole(guildId: string, djRoleId: string) {
		const guild = await container.db.guildSettings.update({
			where: { id: guildId },
			data: { djRoleId }
		});

		return guild;
	}

	public async hasDJRole(guildId: string, member: GuildMember) {
		const djRoleId = await this.getDJRole(guildId);
		if (djRoleId === null || member.permissions.has(PermissionFlagsBits.Administrator)) return true;
		return member.roles.cache.has(djRoleId);
	}
}
