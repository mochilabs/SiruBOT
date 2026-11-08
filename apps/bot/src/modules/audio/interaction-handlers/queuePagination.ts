import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { errorView } from '../../../lib/errorView.ts';
import { getUserQueuedTracks } from '../lavalink/autoPlayRelated.ts';
import { queueCustomIdPrefix, queueList, queueEmpty, QUEUE_PAGE_SIZE } from '../view/queue.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';

export default class QueuePaginationHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.Button
		});
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith(queueCustomIdPrefix)) return this.none();
		// Ignore the disabled page indicator button
		if (interaction.customId === 'queue:page:indicator') return this.none();

		const suffix = interaction.customId.replace(queueCustomIdPrefix, '');
		// Format: {authorId}:{pageNum}
		const colonIndex = suffix.indexOf(':');
		if (colonIndex === -1) return this.none();

		const authorId = suffix.slice(0, colonIndex);
		const page = parseInt(suffix.slice(colonIndex + 1), 10);
		if (isNaN(page)) return this.none();

		// 다른 사람의 클릭도 핸들러로 보내 안내해요 — none()이면 클릭한 사람 화면에 "상호작용 실패"만 떠요.
		return this.some({ page, authorId });
	}

	public async run(interaction: ButtonInteraction<'cached'>, { page, authorId }: { page: number; authorId: string }) {
		if (authorId !== interaction.user.id) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 명령어를 실행한 사람만 사용할 수 있어요.`)]
			});
			return;
		}

		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
		if (!player || getUserQueuedTracks(player).length === 0) {
			await interaction.update({
				components: [queueEmpty()],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		const totalPages = Math.ceil(getUserQueuedTracks(player).length / QUEUE_PAGE_SIZE);
		const safePage = Math.max(1, Math.min(page, totalPages));
		// 점프/삭제 버튼의 기본 인덱스((page-1)*10)와 동기화
		player.queuePage = safePage;
		player.queueSelectedIndex = null;

		await interaction.update({
			components: [queueList({ player, page: safePage, totalPages, authorId })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
