import { AllFlowsPrecondition } from '@sapphire/framework';
import type { CommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { MUSIC_ACCESS_MESSAGES } from '../../application/access.ts';
import { checkRemoteControl } from '../utils/permissionCheck.ts';

export class SameVoiceChannel extends AllFlowsPrecondition {
	get #message() {
		return MUSIC_ACCESS_MESSAGES.sameVoiceRequired();
	}
	#ephemeral = true;

	public async check(guildId: string, member: GuildMember | null, botChannelId: string | null) {
		if (!botChannelId) return true;
		if (!member) return false;
		if (member.voice.channelId === botChannelId) return true;
		return checkRemoteControl(guildId, member);
	}

	public override async chatInputRun(interaction: CommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		const botChannelId = interaction.guild.members.me?.voice.channelId ?? null;
		return (await this.check(interaction.guildId, interaction.member, botChannelId)) ? this.ok() : this.createError();
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		const botChannelId = interaction.guild.members.me?.voice.channelId ?? null;
		return (await this.check(interaction.guildId, interaction.member, botChannelId)) ? this.ok() : this.createError();
	}

	public override async messageRun(message: Message) {
		if (!message.inGuild()) return this.createError();

		const botChannelId = message.guild.members.me?.voice.channelId ?? null;
		return (await this.check(message.guildId, message.member, botChannelId)) ? this.ok() : this.createError();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
