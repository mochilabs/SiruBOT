import { AllFlowsPrecondition } from '@sapphire/framework';
import { ChatInputCommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';
import { emoji } from '@sirubot/utils';

export class SongPlaying extends AllFlowsPrecondition {
	// 클래스 필드 대신 getter로 렌더 시점에 평가해야 앱 이모지 매핑이 반영돼요.
	get #message() {
		return `${emoji('music_note')} 현재 곡이 없어요. 먼저 /재생으로 곡을 추가해 주세요.`;
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
