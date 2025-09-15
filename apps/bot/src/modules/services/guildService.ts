import { container } from '@sapphire/framework';

export class GuildService {
	#knownGuilds: Set<string> = new Set<string>();

	public async updateVolume(guildId: string, volume: number) {
		if (this.isKnownGuild(guildId)) {
			const guild = await container.db.guildSettings.update({
				where: { id: guildId },
				data: { volume }
			});

			return guild;
		}

		const guild = await container.db.guildSettings.upsert({
			where: { id: guildId },
			create: { id: guildId, volume },
			update: { volume }
		});

		this.#knownGuilds.add(guildId);
		return guild;
	}

	private isKnownGuild(guildId: string) {
		if (this.#knownGuilds.has(guildId)) return true;

		return false;
	}
}
