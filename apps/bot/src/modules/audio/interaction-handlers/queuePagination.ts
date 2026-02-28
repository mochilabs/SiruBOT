import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { queueCustomIdPrefix, queueList, queueEmpty } from '../view/queue.ts';

const QUEUE_PAGE_SIZE = 10;

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

		const pageStr = interaction.customId.replace(queueCustomIdPrefix, '');
		const page = parseInt(pageStr, 10);
		if (isNaN(page)) return this.none();

		return this.some({ page });
	}

	public async run(interaction: ButtonInteraction<'cached'>, { page }: { page: number }) {
		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player || player.queue.tracks.length === 0) {
			await interaction.update({
				components: [queueEmpty()],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		const totalPages = Math.ceil(player.queue.tracks.length / QUEUE_PAGE_SIZE);
		const safePage = Math.max(1, Math.min(page, totalPages));

		await interaction.update({
			components: [queueList({ player, page: safePage, totalPages })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
