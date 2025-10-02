import { AllFlowsPrecondition } from '@sapphire/framework';
import { ChatInputCommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';

export class SongPlaying extends AllFlowsPrecondition {
	#message = '🎵  이 명령어는 노래 재생 중에만 사용이 가능해요.';
	#ephemeral = true;

	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		if (interaction.inGuild()) return this.createError();
		return this.check(interaction.guildId!) ? this.ok() : this.createError();
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (interaction.inGuild()) return this.createError();
		return this.check(interaction.guildId!) ? this.ok() : this.createError();
	}

	public override messageRun(message: Message) {
		if (message.inGuild()) return this.createError();
		return this.check(message.guildId!) ? this.ok() : this.createError();
	}

	public check(guildId: string) {
		const player = this.container.audio.getPlayer(guildId);
		if (!player) return false;
		if (player.queue.current && !player.paused) return true;

		return false;
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
