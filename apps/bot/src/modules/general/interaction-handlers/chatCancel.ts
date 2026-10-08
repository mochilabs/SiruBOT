import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { abortChatTurn } from '../../../services/aiChatService.ts';
import { emoji } from '@sirubot/utils';
import { CHAT_CANCEL_PREFIX } from '../utils/chatView.ts';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.MessageComponent
})
export class ChatCancelHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith(CHAT_CANCEL_PREFIX)) return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction) {
		const key = interaction.customId.slice(CHAT_CANCEL_PREFIX.length);
		const result = abortChatTurn(key, interaction.user.id);

		if (result !== 'ok') {
			const message =
				result === 'forbidden'
					? `${emoji('warning')} 이 답변은 다른 사용자의 대화예요.`
					: `${emoji('warning')} 이미 완료되었거나 만료된 요청이에요.`;
			await interaction.reply({ flags: [MessageFlags.Ephemeral], content: message }).catch(() => undefined);
			return;
		}

		// 실제 화면 변경은 진행 중인 턴이 chat_cancelled를 잡아 알아서 해요
		await interaction.deferUpdate().catch(() => undefined);
	}
}
