import { AllFlowsPrecondition } from '@sapphire/framework';
import { ChatInputCommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';
import { emoji } from '@sirubot/utils';

export class SongPlaying extends AllFlowsPrecondition {
	// 클래스 필드 대신 getter로 렌더 시점에 평가해야 앱 이모지 매핑이 반영돼요.
	get #message() {
		return `${emoji('music_note')} 이 명령어는 노래 재생 중에만 사용이 가능해요.`;
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
		if (player.queue.current && !player.paused) return true;

		return false;
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
