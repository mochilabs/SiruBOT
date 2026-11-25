import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { panelId } from '../customIds.ts';
import { openPlaylists, replyPanelError } from '../utils/panelIdleActions.ts';

/** 대기 화면 '내 플레이리스트 불러오기' 버튼 */
export default class PanelIdleButtonHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		return panelId.decode(interaction.customId)?.action === 'playlist' ? this.some() : this.none();
	}

	public async run(interaction: ButtonInteraction<'cached'>) {
		try {
			await openPlaylists(interaction);
		} catch (error) {
			await replyPanelError(interaction, error);
		}
	}
}
