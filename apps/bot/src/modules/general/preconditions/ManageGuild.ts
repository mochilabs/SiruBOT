import { AllFlowsPrecondition } from '@sapphire/framework';
import { appEmoji } from '@sirubot/utils';
import { CommandInteraction, ContextMenuCommandInteraction, Message, PermissionsBitField } from 'discord.js';

export class ManageGuildPrecondition extends AllFlowsPrecondition {
	// 스토어 로드 시점엔 이모지 매핑이 아직 안 로드되므로 접근 때 평가해요
	get #message(): string {
		return `${appEmoji('error', '🚫')}  이 명령어는 서버 관리자만 사용할 수 있어요.`;
	}

	public override chatInputRun(interaction: CommandInteraction) {
		return this.check(interaction.memberPermissions);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.check(interaction.memberPermissions);
	}

	public override messageRun(message: Message) {
		return this.check(message.member?.permissions);
	}

	private check(permissions: Readonly<PermissionsBitField> | string | null | undefined) {
		if (!permissions || typeof permissions === 'string') {
			return this.error({ message: this.#message, context: { silent: true } });
		}

		return permissions.has(PermissionsBitField.Flags.ManageGuild) ? this.ok() : this.error({ message: this.#message, context: { silent: true } });
	}
}
