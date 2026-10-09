import { AllFlowsPrecondition } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { envParseArray } from '@skyra/env-utilities';
import type { CommandInteraction, ContextMenuCommandInteraction, Message, Snowflake } from 'discord.js';

const OWNERS = envParseArray('OWNERS');

export class OwnerOnlyPrecondition extends AllFlowsPrecondition {
	// 스토어 로드 시점엔 이모지 매핑이 아직 안 로드되므로 접근 때 평가해요
	get #message(): string {
		return `${emoji('error')}  이 명령어는 봇 제작자만 사용 가능한 명령어에요.`;
	}

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
