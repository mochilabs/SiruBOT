import { AllFlowsPrecondition } from '@sapphire/framework';
import { ChatInputCommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';
import { MUSIC_ACCESS_MESSAGES } from '../../application/access.ts';

export class SongPlaying extends AllFlowsPrecondition {
	get #message() {
		return MUSIC_ACCESS_MESSAGES.noSong();
	}
	#ephemeral = true;

	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inGuild()) return this.createError();
		return this.check(interaction.guildId!) ? this.ok() : this.createError();
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inGuild()) return this.createError();
		return this.check(interaction.guildId!) ? this.ok() : this.createError();
	}

	public override messageRun(message: Message) {
		if (!message.inGuild()) return this.createError();
		return this.check(message.guildId!) ? this.ok() : this.createError();
	}

	public check(guildId: string) {
		const player = this.container.audio.getPlayer(guildId);
		if (!player) return false;
		if (player.queue.current) return true;

		return false;
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
