import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { emoji, WARN_COLOR } from '@sirubot/utils';
import {
	MessageFlags,
	type ButtonInteraction,
	type StringSelectMenuInteraction,
	type RoleSelectMenuInteraction,
	type ChannelSelectMenuInteraction
} from 'discord.js';
import { settingsId } from '../customIds.ts';
import { settingsView } from '../views/settings.ts';
import { SETTINGS_ACTIONS, isSettingsModalAction } from '../settings/index.ts';
import type { SettingsComponentAction, SettingsContext, SettingsEntry, SettingsInteraction } from '../settings/types.ts';
import { checkManageGuild } from '../utils/permissionCheck.ts';
import { errorView } from '../../../../lib/errorView.ts';
import { notice } from '../../../../lib/notice.ts';

export { SETTINGS_ACTIONS };

export default class SettingsInteractionHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.MessageComponent
		});
	}

	public override parse(interaction: ButtonInteraction | StringSelectMenuInteraction | RoleSelectMenuInteraction | ChannelSelectMenuInteraction) {
		const decoded = settingsId.decode(interaction.customId);
		if (!decoded || isSettingsModalAction(decoded.action)) return this.none();
		return this.some({ action: decoded.action });
	}

	public async run(interaction: SettingsInteraction, { action }: { action: SettingsComponentAction }) {
		if (!checkManageGuild(interaction.member)) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 서버 설정은 서버 관리 권한이 있는 멤버만 변경할 수 있어요.`)]
			});
			return;
		}

		const ctx: SettingsContext = { interaction, guildId: interaction.guildId, channelId: interaction.channelId, services: this.container };
		const entry: SettingsEntry = SETTINGS_ACTIONS[action];

		// 모달은 응답 자체여야 하므로 deferUpdate 전에 연다.
		if ('preDefer' in entry) {
			await entry.preDefer(ctx);
			return;
		}

		await interaction.deferUpdate();

		const mode = typeof entry.mode === 'function' ? entry.mode(ctx) : entry.mode;
		const result = await entry.apply?.(ctx);

		const guild = await this.container.guildService.getGuild(interaction.guildId);

		await interaction.editReply({
			components: [settingsView(guild, mode, { channelId: interaction.channelId })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});

		if (result) {
			await interaction.followUp({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [notice(result.notice, result.warn ? WARN_COLOR : undefined)],
				allowedMentions: { parse: [] }
			});
		}
	}
}
