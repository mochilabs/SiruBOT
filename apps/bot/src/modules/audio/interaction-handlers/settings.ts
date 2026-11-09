import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import {
	ActionRowBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ButtonInteraction,
	type StringSelectMenuInteraction,
	type RoleSelectMenuInteraction,
	type ChannelSelectMenuInteraction
} from 'discord.js';
import { settingsView, SettingsMode } from '../view/settings.ts';
import { RepeatMode } from 'lavalink-client';
import { checkManageGuild } from '../utils/permissionCheck.ts';
import { queueRelatedUpfront } from '../lavalink/autoPlayRelated.ts';
import { errorView } from '../../../lib/errorView.ts';
import { sponsorBlockService } from '../../../services/sponsorBlockService.ts';
import * as guildChannels from '../../../services/guildSettings/channels.ts';
import * as guildJtc from '../../../services/guildSettings/jtc.ts';
import * as guildPlayback from '../../../services/guildSettings/playback.ts';

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
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 서버 설정은 서버 관리 권한이 있는 멤버만 변경할 수 있어요.`)]
			});
			return;
		}

		const action = interaction.customId.replace('settings:', '');

		// 방 이름 템플릿 모달은 응답 자체여야 하므로 deferUpdate 전에 연다.
		if (action === 'jtctemplate') {
			const settings = await guildJtc.getJtcSettings(this.container.guildService, interaction.guildId);
			await interaction.showModal(
				new ModalBuilder()
					.setCustomId('settings:jtc-template')
					.setTitle('방 이름 템플릿')
					.addComponents(
						new ActionRowBuilder<TextInputBuilder>().addComponents(
							new TextInputBuilder()
								.setCustomId('settings:jtc-template-input')
								.setLabel('방 이름 템플릿')
								.setPlaceholder('{user}의 방')
								.setStyle(TextInputStyle.Short)
								.setRequired(true)
								.setMaxLength(100)
								.setValue(settings.template)
						)
					)
			);
			return;
		}

		await interaction.deferUpdate();

		let mode: SettingsMode = 'main';

		// Navigation
		if (action === 'navigate' && interaction.isStringSelectMenu()) {
			const target = interaction.values[0];
			mode = target === 'music' || target === 'sponsorblock' || target === 'dj' || target === 'channel' || target === 'jtc' ? target : 'main';
		} else if (action === 'toggle:jtc' || action === 'select:jtccategory' || action === 'select:jtclimit') mode = 'jtc';
		else if (action === 'music' || action.startsWith('toggle:')) mode = 'music';
		else if (action === 'sponsorblock' || action === 'select:sponsorblock' || action === 'reset:sponsorblock') mode = 'sponsorblock';
		else if (action === 'dj' || action === 'select:dj' || action === 'remove:dj') mode = 'dj';
		else if (
			action === 'channel' ||
			action.startsWith('select:text') ||
			action.startsWith('select:voice') ||
			action.startsWith('remove:text') ||
			action.startsWith('remove:voice') ||
			action.startsWith('select:pin') ||
			action === 'remove:pin'
		)
			mode = 'channel';
		else if (action === 'back') mode = 'main';

		// Actions

		// Music toggles
		if (action === 'toggle:controller') {
			const guild = await this.container.guildService.getGuild(interaction.guildId);
			await guildPlayback.setEnableController(this.container.guildService, interaction.guildId, !guild.enableController);
		} else if (action === 'toggle:related') {
			const guild = await this.container.guildService.getGuild(interaction.guildId);
			const next = !guild.related;
			await guildPlayback.setRelated(this.container.guildService, interaction.guildId, next);
			// /추천곡 커맨드와 동일하게, 켰을 때는 현재 곡의 다음 추천을 미리 준비해 둔다.
			if (next) {
				const player = this.container.audio.getPlayer(interaction.guildId);
				const currentTrack = player?.queue.current;
				if (player?.playing && currentTrack && player.queue.tracks.length === 0) {
					void queueRelatedUpfront(player, currentTrack).catch((error) => {
						this.container.logger.warn(`[mixer] related pre-add failed (guild ${interaction.guildId}): ${error}`);
					});
				}
			}
		} else if (action === 'toggle:repeat') {
			const guild = await this.container.guildService.getGuild(interaction.guildId);
			const current = guild.repeat as RepeatMode;
			const next: RepeatMode = current === 'off' ? 'track' : current === 'track' ? 'queue' : 'off';
			await guildPlayback.setRepeat(this.container.guildService, interaction.guildId, next);

			const player = this.container.audio.players.get(interaction.guildId);
			if (player) {
				player.setRepeatMode(next);
				await this.container.mixerService.clearNext(player).catch(() => null);
			}
		}

		// DJ actions
		if (action === 'remove:dj') {
			await guildPlayback.setDJRole(this.container.guildService, interaction.guildId, null);
		} else if (interaction.isRoleSelectMenu() && action === 'select:dj') {
			const roleId = interaction.values[0];
			await guildPlayback.setDJRole(this.container.guildService, interaction.guildId, roleId);
		}

		// Channel actions
		if (action === 'remove:text') {
			await guildChannels.setDefaultTextChannel(this.container.guildService, interaction.guildId, null);
		} else if (action === 'remove:voice') {
			await guildChannels.setDefaultVoiceChannel(this.container.guildService, interaction.guildId, null);
		} else if (action === 'remove:pin') {
			await guildChannels.setPinnedChannel(this.container.guildService, interaction.guildId, null);
		} else if (interaction.isChannelSelectMenu()) {
			const channelId = interaction.values[0];
			if (action === 'select:text') {
				await guildChannels.setDefaultTextChannel(this.container.guildService, interaction.guildId, channelId);
			} else if (action === 'select:voice') {
				await guildChannels.setDefaultVoiceChannel(this.container.guildService, interaction.guildId, channelId);
			} else if (action === 'select:pin') {
				await guildChannels.setPinnedChannel(this.container.guildService, interaction.guildId, channelId);
			}
		}

		// 고정 채널 입력 동작 (play: 즉시 재생 / select: 5개 선택)
		if (interaction.isStringSelectMenu() && action === 'select:pinmode') {
			await guildChannels.setPinnedChannelMode(
				this.container.guildService,
				interaction.guildId,
				interaction.values[0] === 'select' ? 'select' : 'play'
			);
		}

		// 고정 채널 입력 메시지 삭제 토글
		if (action === 'toggle:pindelete') {
			const guild = await this.container.guildService.getGuild(interaction.guildId);
			await guildChannels.setPinnedChannelDeleteInput(this.container.guildService, interaction.guildId, !guild.pinnedChannelDeleteInput);
		}

		// JTC actions
		if (action === 'toggle:jtc') {
			const settings = await guildJtc.getJtcSettings(this.container.guildService, interaction.guildId);
			if (settings.enabled || settings.markerChannelId) {
				await guildJtc.setJtcEnabled(this.container.guildService, interaction.guildId, !settings.enabled);
			}
		} else if (interaction.isChannelSelectMenu() && action === 'select:jtccategory') {
			try {
				await this.container.tempVoiceService.setupMarkerChannel(interaction.guildId, interaction.values[0]);
			} catch (error) {
				this.container.logger.error(`[tempVoice] marker setup failed (guild ${interaction.guildId}): ${error}`);
				await interaction.followUp({
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView(`${emoji('error')} 카테고리를 설정하지 못했어요. 봇에게 채널 관리 권한이 있는지 확인해 주세요.`)]
				});
			}
		} else if (interaction.isStringSelectMenu() && action === 'select:jtclimit') {
			await guildJtc.setJtcUserLimit(this.container.guildService, interaction.guildId, Number(interaction.values[0]));
		}

		// SponsorBlock actions
		if (interaction.isStringSelectMenu() && action === 'select:sponsorblock') {
			await guildPlayback.setSponsorBlockSegments(this.container.guildService, interaction.guildId, interaction.values);
			const player = this.container.audio.players.get(interaction.guildId);
			if (player) sponsorBlockService.refreshSettings(player);
		} else if (action === 'reset:sponsorblock') {
			await guildPlayback.setSponsorBlockSegments(this.container.guildService, interaction.guildId, []);
			const player = this.container.audio.players.get(interaction.guildId);
			if (player) sponsorBlockService.refreshSettings(player);
		}

		// Re-render
		const guild = await this.container.guildService.getGuild(interaction.guildId);

		await interaction.editReply({
			components: [settingsView(guild, mode)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
