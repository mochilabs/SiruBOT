import { AllFlowsPrecondition } from '@sapphire/framework';
import type { CommandInteraction, ContextMenuCommandInteraction, Message, Snowflake } from 'discord.js';
import { MUSIC_ACCESS_MESSAGES } from '../../../features/music/application/access.ts';

export class VoiceConnected extends AllFlowsPrecondition {
	// 클래스 필드 대신 getter로 렌더 시점에 평가해야 앱 이모지 매핑이 반영돼요.
	get #message() {
		return MUSIC_ACCESS_MESSAGES.voiceRequired();
	}
	#ephemeral = true;

	public check(channelId: Snowflake | null) {
		return channelId !== null;
	}

	public override chatInputRun(interaction: CommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		return this.check(interaction.member.voice.channelId) ? this.ok() : this.createError();
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		return this.check(interaction.member.voice.channelId) ? this.ok() : this.createError();
	}

	public override messageRun(message: Message) {
		if (!message.inGuild()) return this.createError();

		const channelId = message.member?.voice.channelId ?? null;

		return this.check(channelId) ? this.ok() : this.createError();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
