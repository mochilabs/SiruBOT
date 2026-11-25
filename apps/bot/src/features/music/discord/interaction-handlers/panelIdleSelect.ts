import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { StringSelectMenuInteraction } from 'discord.js';
import { panelId } from '../customIds.ts';
import { playPlaylist, playRecent, replyPanelError } from '../utils/panelIdleActions.ts';

type Action = 'recent' | 'playlistPick';

/** 대기 화면 '최근 곡 다시 재생' 셀렉트와 플레이리스트 선택 메뉴 */
export default class PanelIdleSelectHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu });
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		const action = panelId.decode(interaction.customId)?.action;
		return action === 'recent' || action === 'playlistPick' ? this.some<Action>(action) : this.none();
	}

	public async run(interaction: StringSelectMenuInteraction<'cached'>, action: Action) {
		try {
			if (action === 'recent') await playRecent(interaction);
			else await playPlaylist(interaction);
		} catch (error) {
			await replyPanelError(interaction, error);
		}
	}
}
