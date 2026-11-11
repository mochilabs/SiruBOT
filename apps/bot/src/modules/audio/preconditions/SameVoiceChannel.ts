import { AllFlowsPrecondition } from '@sapphire/framework';
import type { CommandInteraction, ContextMenuCommandInteraction, Message, Snowflake } from 'discord.js';
import { MUSIC_ACCESS_MESSAGES } from '../../../features/music/application/access.ts';

export class SameVoiceChannel extends AllFlowsPrecondition {
	// 클래스 필드 대신 getter로 렌더 시점에 평가해야 앱 이모지 매핑이 반영돼요.
	get #message() {
		return MUSIC_ACCESS_MESSAGES.sameVoiceRequired();
	}
	#ephemeral = true;

	public check(userChannelId: Snowflake | null, botChannelId: Snowflake | null) {
		// 봇이 음성 채널에 연결되어 있지 않으면 통과 (연결 전 상태)
		if (!botChannelId) return true;
		// 사용자와 봇이 같은 채널에 있으면 통과
		return userChannelId === botChannelId;
	}

	public override chatInputRun(interaction: CommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		const userChannelId = interaction.member.voice.channelId;
		const botChannelId = interaction.guild?.members.me?.voice.channelId ?? null;

		if (!this.check(userChannelId, botChannelId)) {
			return this.createError();
		}

		return this.ok();
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		const userChannelId = interaction.member.voice.channelId;
		const botChannelId = interaction.guild?.members.me?.voice.channelId ?? null;

		if (!this.check(userChannelId, botChannelId)) {
			return this.createError();
		}

		return this.ok();
	}

	public override messageRun(message: Message) {
		if (!message.inGuild()) return this.createError();

		const userChannelId = message.member?.voice.channelId ?? null;
		const botChannelId = message.guild?.members.me?.voice.channelId ?? null;

		if (!this.check(userChannelId, botChannelId)) {
			return this.createError();
		}

		return this.ok();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
