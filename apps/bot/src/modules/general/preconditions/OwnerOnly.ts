import { AllFlowsPrecondition } from '@sapphire/framework';
import { envParseArray } from '@skyra/env-utilities';
import type { CommandInteraction, ContextMenuCommandInteraction, Message, Snowflake } from 'discord.js';

const OWNERS = envParseArray('OWNERS');

export class OwnerOnlyPrecondition extends AllFlowsPrecondition {
	#message = '🚫  이 명령어는 봇 제작자만 사용 가능한 명령어에요.';

	public override chatInputRun(interaction: CommandInteraction) {
		return this.check(interaction.user.id);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.check(interaction.user.id);
	}

	public override messageRun(message: Message) {
		return this.check(message.author.id);
	}

	public check(userId: Snowflake) {
		return OWNERS.includes(userId) ? this.ok() : this.error({ message: this.#message, context: { silent: true } });
	}
}
