import { AllFlowsPrecondition } from '@sapphire/framework';
import { CommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { emoji } from '@sirubot/utils';

export class MemberListenable extends AllFlowsPrecondition {
	get #message() {
		return `${emoji('volume_muted')} 음성 채널에서 듣기 상태가 꺼져있어요. 듣기 상태를 켜주세요.`;
	}
	#ephemeral = true;

	public check(member: GuildMember | null) {
		if (!member) return false;
		if (!member.voice.channelId) return true;
		return !member.voice.deaf;
	}

	public override chatInputRun(interaction: CommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		if (!this.check(interaction.member)) {
			return this.createError();
		}

		return this.ok();
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		if (!this.check(interaction.member)) {
			return this.createError();
		}

		return this.ok();
	}

	public override messageRun(message: Message) {
		if (!message.inGuild()) return this.createError();

		if (!this.check(message.member)) {
			return this.createError();
		}

		return this.ok();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
