import { InteractionHandler, InteractionHandlerTypes, UserError } from '@sapphire/framework';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { errorView } from '../../../lib/errorView.ts';
import { queueList, QUEUE_PAGE_SIZE } from '../view/queue.ts';
import { getUserQueuedTracks } from '../../../features/music/lavalink/autoPlayRelated.ts';
import { CustomPlayer } from '../../../features/music/lavalink/player/customPlayer.ts';
import { GUARD_MESSAGES, guardPlayerAccess, replyGuardError } from '../utils/interactionGuards.ts';
import { resolveQueueSelection } from '../utils/queueSelection.ts';
import { clampQueuePage, decodeQueueSelectId, QUEUE_VIEW_MESSAGES, type QueueSelectView } from '../utils/queueViewId.ts';

type ParsedSelect = { view: QueueSelectView; selectedValue: string | undefined };

export default class ControllerSelectMenuHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.SelectMenu
		});
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		const view = decodeQueueSelectId(interaction.customId);
		if (!view) return this.none();
		return this.some<ParsedSelect>({ view, selectedValue: interaction.values[0] });
	}

	private async replyEphemeral(interaction: StringSelectMenuInteraction<'cached'>, message: string) {
		await interaction.reply({
			flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
			components: [errorView(message)]
		});
	}

	public async run(interaction: StringSelectMenuInteraction<'cached'>, { view, selectedValue }: ParsedSelect) {
		// 대기열 목록은 연 사람만 쓸 수 있어요.
		if (view.ownerId !== interaction.user.id) {
			await this.replyEphemeral(interaction, QUEUE_VIEW_MESSAGES.notOwner);
			return;
		}

		const player = await guardPlayerAccess(
			interaction,
			this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined,
			GUARD_MESSAGES.djOnlyControl
		);
		if (!player) return;

		let trackIndex: number;
		try {
			trackIndex = resolveQueueSelection(player, selectedValue ?? '');
		} catch (error) {
			if (!(error instanceof UserError)) throw error;
			await this.replyEphemeral(interaction, error.message);
			return;
		}
		if (isNaN(trackIndex) || trackIndex < 0 || trackIndex >= getUserQueuedTracks(player).length) {
			await replyGuardError(interaction, '해당 번호의 곡이 대기열에 없어요.');
			return;
		}

		// 셀렉트 메뉴가 있는 대기열 목록(ephemeral) 메시지를 선택 상태로 다시 렌더한다.
		// 선택값에 곡 위치가 들어 있어, 선택된 곡이 속한 페이지를 보여준다.
		const totalPages = Math.max(1, Math.ceil(getUserQueuedTracks(player).length / QUEUE_PAGE_SIZE));
		const page = clampQueuePage(Math.floor(trackIndex / QUEUE_PAGE_SIZE) + 1, totalPages);

		await interaction.update({
			components: [queueList({ player, page, totalPages, authorId: view.ownerId, selectedIndex: trackIndex })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
