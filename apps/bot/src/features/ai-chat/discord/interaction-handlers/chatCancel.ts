import { notice } from '../../../../lib/notice.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { abortChatTurn } from '../../application/aiChatService.ts';
import { emoji } from '@sirubot/utils';
import { chatCancelId } from '../customIds.ts';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.MessageComponent
})
export class ChatCancelHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const decoded = chatCancelId.decode(interaction.customId);
		return decoded ? this.some({ cancelKey: decoded.cancelKey }) : this.none();
	}

	public override async run(interaction: ButtonInteraction, { cancelKey }: { cancelKey: string }) {
		const result = abortChatTurn(cancelKey, interaction.user.id);

		if (result !== 'ok') {
			const message =
				result === 'forbidden'
					? `${emoji('warning')} 이 답변은 다른 사용자의 대화예요.`
					: `${emoji('warning')} 이미 완료되었거나 만료된 요청이에요.`;
			await interaction
				.reply({ flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral], components: [notice(message)] })
				.catch(() => undefined);
			return;
		}

		// 실제 화면 변경은 진행 중인 턴이 chat_cancelled를 잡아 알아서 해요
		await interaction.deferUpdate().catch(() => undefined);
	}
}
