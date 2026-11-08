import { emoji } from '@sirubot/utils';
import { MessageFlags, type MessageComponentInteraction } from 'discord.js';
import { errorView } from './errorView.ts';

/**
 * 컬렉터 filter용 — 명령어를 실행한 사람만 통과시키고, 다른 사람에게는 ephemeral 안내를 보내요.
 * 응답 없이 걸러내면 클릭한 사람 화면에 "상호작용 실패"만 떠요.
 */
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
