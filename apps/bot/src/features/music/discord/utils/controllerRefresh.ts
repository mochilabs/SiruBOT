import { container } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { MessageFlags, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { errorView } from '../../../../lib/errorView.ts';
import { thrownCode } from '../../../../lib/thrownError.ts';
import { buildControllerCardPayload } from '../../lavalink/player/controllerPayload.ts';
import type { CustomPlayer } from '../../lavalink/player/customPlayer.ts';

type ControllerInteraction = ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>;

/** 컨트롤러 메시지를 지금 상태로 다시 그려요. 메시지나 인터랙션이 만료됐으면 false. */
async function refreshController(interaction: ControllerInteraction, player: CustomPlayer): Promise<boolean> {
	try {
		// 채널 설정 조회가 끝나기 전에 interaction을 ACK해 Discord의 3초 제한을 피한다.
		if (!interaction.deferred) await interaction.deferUpdate();
		const { components, attachments, files } = await buildControllerCardPayload(container.lavalink, player, {
			volume: player.volume,
			textChannelId: interaction.message.channelId,
			message: interaction.message
		});
		const updated = await interaction.message.edit({
			components: [components],
			attachments,
			files,
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
		if (player.messageId === interaction.message.id) {
			player.controller = updated;
		}
		return true;
	} catch (error) {
		const code = thrownCode(error);
		if (code === 10008 || code === 10062 || code === 40060) return false;
		throw error;
	}
}

/** 컨트롤러를 다시 그리고, 만료됐으면 `/현재곡`으로 새로 불러오라고 알려요. */
export async function updateControllerOrFail(interaction: ControllerInteraction, player: CustomPlayer): Promise<void> {
	if (!(await refreshController(interaction, player))) {
		await interaction
			.followUp({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 컨트롤러가 만료되었어요. \`/현재곡\`으로 새로 불러와주세요.`)]
			})
			.catch(() => null);
	}
}
