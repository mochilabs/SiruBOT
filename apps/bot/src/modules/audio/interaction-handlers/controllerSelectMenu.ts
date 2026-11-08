import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { queueList, queueSelectCustomId, QUEUE_PAGE_SIZE } from '../view/queue.ts';
import { getUserQueuedTracks } from '../lavalink/autoPlayRelated.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { GUARD_MESSAGES, guardPlayerAccess, replyGuardError } from '../utils/interactionGuards.ts';
import { resolveQueueSelection } from '../utils/queueSelection.ts';

export default class ControllerSelectMenuHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.SelectMenu
		});
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (interaction.customId === queueSelectCustomId) {
			return this.some({ selectedValue: interaction.values[0] });
		}
		return this.none();
	}

	public async run(interaction: StringSelectMenuInteraction<'cached'>, { selectedValue }: { selectedValue: string }) {
		const player = await guardPlayerAccess(
			interaction,
			this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined,
			GUARD_MESSAGES.djOnlyControl
		);
		if (!player) return;

		const trackIndex = resolveQueueSelection(player, selectedValue);
		if (isNaN(trackIndex) || trackIndex < 0 || trackIndex >= getUserQueuedTracks(player).length) {
			await replyGuardError(interaction, '해당 번호의 곡이 대기열에 없어요.');
			return;
		}

		player.queueSelectedIndex = trackIndex;

		// 셀렉트 메뉴가 있는 대기열 목록(ephemeral) 메시지를 선택 상태로 다시 렌더한다.
		// 선택된 곡이 속한 페이지로 queuePage도 맞춰 둔다 (점프/삭제 버튼의 기본 인덱스 동기화).
		const tracks = getUserQueuedTracks(player);
		const totalPages = Math.max(1, Math.ceil(tracks.length / QUEUE_PAGE_SIZE));
		const page = Math.min(Math.floor(trackIndex / QUEUE_PAGE_SIZE) + 1, totalPages);
		player.queuePage = page;

		await interaction.update({
			components: [queueList({ player, page, totalPages, authorId: interaction.user.id, selectedIndex: trackIndex })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
