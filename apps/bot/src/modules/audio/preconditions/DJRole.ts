import { AllFlowsPrecondition, container } from '@sapphire/framework';
import { CommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';

export class DJRole extends AllFlowsPrecondition {
	#message = '🔇 이 명령어는 DJ 역할을 가지고 있는 멤버만 사용 가능해요.';
	#ephemeral = false;

	public async check(guildId: string, member: GuildMember) {
		return await container.guildService.hasDJRole(guildId, member);
	}

	public override async chatInputRun(interaction: CommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		const hasDJRole = await this.check(interaction.guildId, interaction.member);
		if (!hasDJRole) return this.createError();

		return this.ok();
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		const hasDJRole = await this.check(interaction.guildId, interaction.member);
		if (!hasDJRole) return this.createError();

		return this.ok();
	}

	public override async messageRun(message: Message) {
		if (!message.member || !message.guildId) return this.createError();

		const hasDJRole = await this.check(message.guildId, message.member);
		if (!hasDJRole) return this.createError();

		return this.ok();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
