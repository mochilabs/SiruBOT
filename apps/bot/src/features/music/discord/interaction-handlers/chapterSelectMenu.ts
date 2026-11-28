import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { errorView } from '../../../../lib/errorView.ts';
import { controllerId } from '../customIds.ts';
import { chapterStartFromPick } from '../../lavalink/player/chapters.ts';
import type { CustomPlayer } from '../../lavalink/player/customPlayer.ts';
import { updateControllerOrFail } from '../utils/controllerRefresh.ts';
import { GUARD_MESSAGES, guardPlayerAccess } from '../utils/interactionGuards.ts';

/** 컨트롤러의 챕터 셀렉트 메뉴: 고른 챕터 시작 위치로 이동해요. */
export default class ChapterSelectMenuHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.SelectMenu
		});
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		const decoded = controllerId.decode(interaction.customId);
		if (decoded?.action !== 'chapterPick') return this.none();
		return this.some(interaction.values[0] ?? '');
	}

	public async run(interaction: StringSelectMenuInteraction<'cached'>, value: string) {
		const player = await guardPlayerAccess(
			interaction,
			this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined,
			GUARD_MESSAGES.djOnlyControl
		);
		if (!player) return;

		const target = chapterStartFromPick(player.chapters ?? [], value);
		if (target === null) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('info')} 곡이 바뀌어서 그 챕터로 이동할 수 없어요.`)]
			});
			return;
		}

		await interaction.deferUpdate();
		await player.seek(target);
		await updateControllerOrFail(interaction, player);
	}
}
