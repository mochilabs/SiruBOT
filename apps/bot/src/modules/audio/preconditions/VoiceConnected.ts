import { AllFlowsPrecondition } from '@sapphire/framework';
import type { CommandInteraction, ContextMenuCommandInteraction, Message, Snowflake } from 'discord.js';

export class VoiceConnected extends AllFlowsPrecondition {
	#message = '🎵  이 명령어는 음성 채널에 접속한 사용자만 사용 가능해요.';
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
