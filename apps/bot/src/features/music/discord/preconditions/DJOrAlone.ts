import { AllFlowsPrecondition } from '@sapphire/framework';
import { CommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { MUSIC_ACCESS_MESSAGES } from '../../application/access.ts';
import { checkDJOrAlone } from '../utils/permissionCheck.ts';

export class DJOrAlone extends AllFlowsPrecondition {
	get #message() {
		return MUSIC_ACCESS_MESSAGES.djOnly();
	}
	#ephemeral = true;

	public async check(guildId: string, member: GuildMember) {
		return checkDJOrAlone(guildId, member);
	}

	public override async chatInputRun(interaction: CommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		const canRun = await this.check(interaction.guildId, interaction.member);
		if (!canRun) return this.createError();

		return this.ok();
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		const canRun = await this.check(interaction.guildId, interaction.member);
		if (!canRun) return this.createError();

		return this.ok();
	}

	public override async messageRun(message: Message) {
		if (!message.member || !message.guildId) return this.createError();

		const canRun = await this.check(message.guildId, message.member);
		if (!canRun) return this.createError();

		return this.ok();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
