import { AllFlowsPrecondition } from '@sapphire/framework';
import { CommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { checkDJOrAlone } from '../utils/permissionCheck.ts';

export class DJOrAlone extends AllFlowsPrecondition {
	#message = '🔇 이 명령어는 DJ 역할을 가지고 있거나, 채널에 혼자 있을 때만 사용 가능해요.';
	#ephemeral = true;

	public async check(guildId: string, member: GuildMember) {
		return checkDJOrAlone(guildId, member);
	}

	public override async chatInputRun(interaction: CommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		const canRun = await this.check(interaction.guildId, interaction.member);
		if (!canRun) return this.createError();

		return this.ok();
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		const canRun = await this.check(interaction.guildId, interaction.member);
		if (!canRun) return this.createError();

		return this.ok();
	}

	public override async messageRun(message: Message) {
		if (!message.member || !message.guildId) return this.createError();

		const canRun = await this.check(message.guildId, message.member);
		if (!canRun) return this.createError();

		return this.ok();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
