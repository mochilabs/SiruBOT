import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
	MessageFlags,
	type ButtonInteraction,
	type StringSelectMenuInteraction,
	type RoleSelectMenuInteraction,
	type ChannelSelectMenuInteraction
} from 'discord.js';
import { settingsView, SettingsMode } from '../view/settings.ts';
import { RepeatMode } from 'lavalink-client';
import { checkManageGuild } from '../utils/permissionCheck.ts';

export default class SettingsInteractionHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.MessageComponent
		});
	}

	public override parse(interaction: ButtonInteraction | StringSelectMenuInteraction | RoleSelectMenuInteraction | ChannelSelectMenuInteraction) {
		if (!interaction.customId.startsWith('settings:')) return this.none();

		return this.some();
	}

	public async run(
		interaction:
			| ButtonInteraction<'cached'>
			| StringSelectMenuInteraction<'cached'>
			| RoleSelectMenuInteraction<'cached'>
			| ChannelSelectMenuInteraction<'cached'>
	) {
		// ManageGuild 권한 체크
		if (!checkManageGuild(interaction.member)) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral],
				content: '⚙️ 서버 설정은 서버 관리 권한이 있는 멤버만 변경할 수 있어요.'
			});
			return;
		}

		await interaction.deferUpdate();

		const action = interaction.customId.replace('settings:', '');
		let mode: SettingsMode = 'main';

		// ── Navigation ───────────────────────────
		if (action === 'music' || action.startsWith('toggle:')) mode = 'music';
		else if (action === 'sponsorblock' || action === 'select:sponsorblock' || action === 'reset:sponsorblock') mode = 'sponsorblock';
		else if (action === 'dj' || action === 'select:dj' || action === 'remove:dj') mode = 'dj';
		else if (
			action === 'channel' ||
			action.startsWith('select:text') ||
			action.startsWith('select:voice') ||
			action.startsWith('remove:text') ||
			action.startsWith('remove:voice')
		)
			mode = 'channel';
		else if (action === 'back') mode = 'main';

		// ── Actions ──────────────────────────────

		// Music toggles
		if (action === 'toggle:controller') {
			const guild = await this.container.guildService.getGuild(interaction.guildId);
			await this.container.guildService.setEnableController(interaction.guildId, !guild.enableController);
		} else if (action === 'toggle:related') {
			const guild = await this.container.guildService.getGuild(interaction.guildId);
			await this.container.guildService.setRelated(interaction.guildId, !guild.related);
		} else if (action === 'toggle:repeat') {
			const guild = await this.container.guildService.getGuild(interaction.guildId);
			const current = guild.repeat as RepeatMode;
			const next: RepeatMode = current === 'off' ? 'track' : current === 'track' ? 'queue' : 'off';
			await this.container.guildService.setRepeat(interaction.guildId, next);

			// Update player if exists
			const player = this.container.audio.players.get(interaction.guildId);
			if (player) {
				player.setRepeatMode(next);
			}
		}

		// DJ actions
		if (action === 'remove:dj') {
			await this.container.guildService.setDJRole(interaction.guildId, null);
		} else if (interaction.isRoleSelectMenu() && action === 'select:dj') {
			const roleId = interaction.values[0];
			await this.container.guildService.setDJRole(interaction.guildId, roleId);
		}

		// Channel actions
		if (action === 'remove:text') {
			await this.container.guildService.setDefaultTextChannel(interaction.guildId, null);
		} else if (action === 'remove:voice') {
			await this.container.guildService.setDefaultVoiceChannel(interaction.guildId, null);
		} else if (interaction.isChannelSelectMenu()) {
			const channelId = interaction.values[0];
			if (action === 'select:text') {
				await this.container.guildService.setDefaultTextChannel(interaction.guildId, channelId);
			} else if (action === 'select:voice') {
				await this.container.guildService.setDefaultVoiceChannel(interaction.guildId, channelId);
			}
		}

		// SponsorBlock actions
		if (interaction.isStringSelectMenu() && action === 'select:sponsorblock') {
			const selectedSegments = interaction.values;
			await this.container.db.guild.upsert({
				where: { id: interaction.guildId },
				create: { id: interaction.guildId, sponsorBlockSegments: selectedSegments },
				update: { sponsorBlockSegments: selectedSegments }
			});
		} else if (action === 'reset:sponsorblock') {
			await this.container.db.guild.upsert({
				where: { id: interaction.guildId },
				create: { id: interaction.guildId, sponsorBlockSegments: [] },
				update: { sponsorBlockSegments: [] }
			});
		}

		// ── Re-render ────────────────────────────
		const guild = await this.container.guildService.getGuild(interaction.guildId);

		await interaction.editReply({
			components: [settingsView(guild, mode)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
