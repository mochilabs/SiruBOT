import { container } from '@sapphire/framework';

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
}
