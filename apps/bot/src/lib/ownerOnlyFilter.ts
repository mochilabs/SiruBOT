import { emoji } from '@sirubot/utils';
import { MessageFlags, type MessageComponentInteraction } from 'discord.js';
import { errorView } from './errorView.ts';

export function ownerOnly(ownerId: string, accept: (interaction: MessageComponentInteraction) => boolean = () => true) {
	return (interaction: MessageComponentInteraction): boolean => {
		if (!accept(interaction)) return false;
		if (interaction.user.id === ownerId) return true;
		void interaction
			.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 명령어를 실행한 사람만 사용할 수 있어요.`)]
			})
			.catch(() => undefined);
		return false;
	};
}
