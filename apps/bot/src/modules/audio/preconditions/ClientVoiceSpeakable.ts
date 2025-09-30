import { AllFlowsPrecondition } from '@sapphire/framework';
import { CommandInteraction, ContextMenuCommandInteraction, Guild, GuildMember, PermissionsBitField } from 'discord.js';
import { Message } from 'discord.js';

export class ClientVoiceSpeakable extends AllFlowsPrecondition {
	#message = '🔇 봇이 음성 채널에서 말할 수 없어요. 음성 채널 권한을 확인해주세요.';
	#ephemeral = true;

	private checkSpeakPermissions(member: GuildMember | null, guild: Guild | null) {
		if (!member?.voice.channel) return false;
		if (!guild?.members.me) return false;

		const channel = member.voice.channel;
		return channel.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.Speak);
	}

	public override chatInputRun(interaction: CommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		if (!this.checkSpeakPermissions(interaction.member, interaction.guild)) {
			return this.createError();
		}

		return this.ok();
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		if (!this.checkSpeakPermissions(interaction.member, interaction.guild)) {
			return this.createError();
		}

		return this.ok();
	}

	public override messageRun(message: Message) {
		if (!message.inGuild()) return this.createError();

		if (!this.checkSpeakPermissions(message.member, message.guild)) {
			return this.createError();
		}

		return this.ok();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
