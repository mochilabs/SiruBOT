import { AllFlowsPrecondition, container } from '@sapphire/framework';
import { CommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';

export class DJRole extends AllFlowsPrecondition {
	#message = '🔇 이 명령어는 DJ 역할을 가지고 있는 멤버만 사용 가능해요.';

	public override async chatInputRun(interaction: CommandInteraction) {
		if (!interaction.inCachedGuild()) return this.error({ message: this.#message });

		const hasDJRole = await container.guildService.hasDJRole(interaction.guildId, interaction.member);
		if (!hasDJRole) return this.error({ message: this.#message });

		return this.ok();
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inCachedGuild()) return this.error({ message: this.#message });

		const hasDJRole = await container.guildService.hasDJRole(interaction.guildId, interaction.member);
		if (!hasDJRole) return this.error({ message: this.#message });

		return this.ok();
	}

	public override async messageRun(message: Message) {
		if (!message.member || !message.guildId) return this.error({ message: this.#message });

		const hasDJRole = await container.guildService.hasDJRole(message.guildId, message.member);
		if (!hasDJRole) return this.error({ message: this.#message });

		return this.ok();
	}
}
