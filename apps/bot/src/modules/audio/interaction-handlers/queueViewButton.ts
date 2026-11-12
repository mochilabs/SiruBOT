import { InteractionHandler, InteractionHandlerTypes, UserError } from '@sapphire/framework';
import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { errorView } from '../../../lib/errorView.ts';
import { getUserQueuedTracks } from '../../../features/music/lavalink/autoPlayRelated.ts';
import { queueList, queueEmpty, QUEUE_PAGE_SIZE } from '../view/queue.ts';
import { CustomPlayer } from '../../../features/music/lavalink/player/customPlayer.ts';
import { GUARD_MESSAGES, guardPlayerAccess } from '../utils/interactionGuards.ts';
import { resolveQueueSelection } from '../utils/queueSelection.ts';
import { clampQueuePage, decodeQueueButtonId, QUEUE_VIEW_MESSAGES, type QueueButtonView } from '../utils/queueViewId.ts';

type ParsedQueueButton = { view: QueueButtonView };

/**
 * 대기열 목록(ephemeral)의 버튼 — 이전/다음 페이지, 선택한 곡 재생, 선택한 곡 제거.
 * 화면 상태는 customId(queueViewId)에만 있고 플레이어에는 저장하지 않아요.
 */
export default class QueueViewButtonHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.Button
		});
	}

	public override parse(interaction: ButtonInteraction) {
		const view = decodeQueueButtonId(interaction.customId);
		if (!view) return this.none();
		return this.some<ParsedQueueButton>({ view });
	}

	private async replyEphemeral(interaction: ButtonInteraction<'cached'>, message: string) {
		await interaction.reply({
			flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
			components: [errorView(message)]
		});
	}

	public async run(interaction: ButtonInteraction<'cached'>, { view }: ParsedQueueButton) {
		// 다른 사람의 클릭도 안내해요 — 대기열 목록은 연 사람만 쓸 수 있어요.
		if (view.ownerId !== interaction.user.id) {
			await this.replyEphemeral(interaction, QUEUE_VIEW_MESSAGES.notOwner);
			return;
		}

		if (view.action === 'page') {
			await this.handlePage(interaction, view);
			return;
		}

		const player = await guardPlayerAccess(
			interaction,
			this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined,
			GUARD_MESSAGES.djOnlyControl
		);
		if (!player) return;

		if (view.token === null) {
			await this.replyEphemeral(interaction, QUEUE_VIEW_MESSAGES.noSelection);
			return;
		}
		let trackIndex: number;
		try {
			trackIndex = resolveQueueSelection(player, view.token);
		} catch (error) {
			if (!(error instanceof UserError)) throw error;
			await this.replyEphemeral(interaction, error.message);
			return;
		}

		if (view.action === 'rm') await this.handleRemove(interaction, player, view, trackIndex);
		else await this.handleJumpTo(interaction, player, trackIndex);
	}

	private async handlePage(interaction: ButtonInteraction<'cached'>, view: QueueButtonView) {
		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
		const tracks = player ? getUserQueuedTracks(player) : [];
		if (!player || tracks.length === 0) {
			await interaction.update({
				components: [queueEmpty()],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		const totalPages = Math.ceil(tracks.length / QUEUE_PAGE_SIZE);
		const page = clampQueuePage(view.page, totalPages);
		await interaction.update({
			components: [queueList({ player, page, totalPages, authorId: view.ownerId })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleRemove(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, view: QueueButtonView, trackIndex: number) {
		await interaction.deferUpdate();
		await player.queue.splice(trackIndex, 1);
		void this.container.mixerService.preloadUpcoming(player).catch(() => null);

		const remaining = getUserQueuedTracks(player);
		const totalPages = Math.max(1, Math.ceil(remaining.length / QUEUE_PAGE_SIZE));
		const page = clampQueuePage(view.page, totalPages);

		// 대기열 목록(ephemeral) 메시지를 갱신한다 (컨트롤러가 아님).
		await interaction
			.editReply({
				components: [remaining.length === 0 ? queueEmpty() : queueList({ player, page, totalPages, authorId: view.ownerId })],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { roles: [], users: [] }
			})
			.catch(() => null);
	}

	private async handleJumpTo(interaction: ButtonInteraction<'cached'>, player: CustomPlayer, trackIndex: number) {
		// 새 곡의 trackStart가 컨트롤러를 새로 보내므로 컨트롤러 edit는 생략하고,
		// 대기열 목록(ephemeral) 메시지만 첫 페이지로 새로고침한다.
		await interaction.deferUpdate();
		await this.container.mixerService.skip(player, trackIndex + 1);

		const remaining = getUserQueuedTracks(player);
		const totalPages = Math.max(1, Math.ceil(remaining.length / QUEUE_PAGE_SIZE));
		await interaction
			.editReply({
				components: [remaining.length === 0 ? queueEmpty() : queueList({ player, page: 1, totalPages, authorId: interaction.user.id })],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { roles: [], users: [] }
			})
			.catch(() => null);
	}
}
