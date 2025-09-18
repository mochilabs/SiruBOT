import { AllFlowsPrecondition } from '@sapphire/framework';
import { ChatInputCommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';

export class SongPlaying extends AllFlowsPrecondition {
	#message = '🎵  이 명령어는 노래 재생 중에만 사용이 가능해요.';

	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		if (this.checkPlayerExists(interaction.guildId!)) {
			return this.ok();
		}

		return this.error({ message: this.#message });
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (this.checkPlayerExists(interaction.guildId!)) {
			return this.ok();
		}

		return this.error({ message: this.#message });
	}

	public override messageRun(message: Message) {
		if (this.checkPlayerExists(message.guildId!)) {
			return this.ok();
		}

		return this.error({ message: this.#message });
	}

	private checkPlayerExists(guildId: string) {
		const player = this.container.audio.getPlayer(guildId);
		if (!player) return false;
		if (player.queue.current && !player.paused) return true;

		return false;
	}
}
