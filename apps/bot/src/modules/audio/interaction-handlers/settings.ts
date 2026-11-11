import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import {
	MessageFlags,
	type ButtonInteraction,
	type StringSelectMenuInteraction,
	type RoleSelectMenuInteraction,
	type ChannelSelectMenuInteraction
} from 'discord.js';
import { settingsId } from '../customIds.ts';
import { settingsView, jtcTemplateModal, SettingsMode } from '../view/settings.ts';
import { RepeatMode } from 'lavalink-client';
import { checkManageGuild } from '../utils/permissionCheck.ts';
import { queueRelatedUpfront } from '../lavalink/autoPlayRelated.ts';
import { errorView } from '../../../lib/errorView.ts';
import { sponsorBlockService } from '../../../services/sponsorBlockService.ts';
import * as guildChannels from '../../../services/guildSettings/channels.ts';
import * as guildJtc from '../../../services/guildSettings/jtc.ts';
import * as guildPlayback from '../../../services/guildSettings/playback.ts';

type SettingsComponentAction = Exclude<NonNullable<ReturnType<typeof settingsId.decode>>['action'], 'jtcTemplateModal' | 'jtcTemplateInput'>;

/**
 * 액션을 처리한 뒤 다시 그릴 화면. 표에 없으면 메인이에요.
 * 고정 채널 메시지 삭제 토글(togglePinDelete)은 채널 화면에 있지만 예전부터 음악 화면으로 돌아가요. 동작을 그대로 유지해요.
 */
const MODE_AFTER_ACTION: Partial<Record<SettingsComponentAction, SettingsMode>> = {
	toggleController: 'music',
	toggleRelated: 'music',
	toggleRepeat: 'music',
	togglePinDelete: 'music',
	toggleJtc: 'jtc',
	selectJtcCategory: 'jtc',
	selectJtcLimit: 'jtc',
	selectSponsorblock: 'sponsorblock',
	resetSponsorblock: 'sponsorblock',
	selectDj: 'dj',
	removeDj: 'dj',
	selectText: 'channel',
	selectVoice: 'channel',
	selectPin: 'channel',
	selectPinMode: 'channel',
	removeText: 'channel',
	removeVoice: 'channel',
	removePin: 'channel'
};

export default class SettingsInteractionHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.MessageComponent
		});
	}

	public override parse(interaction: ButtonInteraction | StringSelectMenuInteraction | RoleSelectMenuInteraction | ChannelSelectMenuInteraction) {
		const decoded = settingsId.decode(interaction.customId);
		// 방 이름 템플릿 모달·입력칸 ID는 컴포넌트가 아니라 settingsModal 핸들러가 받아요.
		if (!decoded || decoded.action === 'jtcTemplateModal' || decoded.action === 'jtcTemplateInput') return this.none();
		return this.some({ action: decoded.action });
	}

	public async run(
		interaction:
			| ButtonInteraction<'cached'>
			| StringSelectMenuInteraction<'cached'>
			| RoleSelectMenuInteraction<'cached'>
			| ChannelSelectMenuInteraction<'cached'>,
		{ action }: { action: SettingsComponentAction }
	) {
		// ManageGuild 권한 체크
		if (!checkManageGuild(interaction.member)) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 서버 설정은 서버 관리 권한이 있는 멤버만 변경할 수 있어요.`)]
			});
			return;
		}

		// 방 이름 템플릿 모달은 응답 자체여야 하므로 deferUpdate 전에 연다.
		if (action === 'jtcTemplate') {
			const settings = await guildJtc.getJtcSettings(this.container.guildService, interaction.guildId);
			await interaction.showModal(jtcTemplateModal(settings.template));
			return;
		}

		await interaction.deferUpdate();

		let mode: SettingsMode = 'main';

		// Navigation
		if (action === 'navigate' && interaction.isStringSelectMenu()) {
			const target = interaction.values[0];
			mode = target === 'music' || target === 'sponsorblock' || target === 'dj' || target === 'channel' || target === 'jtc' ? target : 'main';
		} else {
			mode = MODE_AFTER_ACTION[action] ?? 'main';
		}

		// Actions

		// Music toggles
		if (action === 'toggleController') {
			const guild = await this.container.guildService.getGuild(interaction.guildId);
			await guildPlayback.setEnableController(this.container.guildService, interaction.guildId, !guild.enableController);
		} else if (action === 'toggleRelated') {
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
		} else if (action === 'toggleRepeat') {
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
		if (action === 'removeDj') {
			await guildPlayback.setDJRole(this.container.guildService, interaction.guildId, null);
		} else if (interaction.isRoleSelectMenu() && action === 'selectDj') {
			const roleId = interaction.values[0];
			await guildPlayback.setDJRole(this.container.guildService, interaction.guildId, roleId);
		}

		// Channel actions
		if (action === 'removeText') {
			await guildChannels.setDefaultTextChannel(this.container.guildService, interaction.guildId, null);
		} else if (action === 'removeVoice') {
			await guildChannels.setDefaultVoiceChannel(this.container.guildService, interaction.guildId, null);
		} else if (action === 'removePin') {
			await guildChannels.setPinnedChannel(this.container.guildService, interaction.guildId, null);
		} else if (interaction.isChannelSelectMenu()) {
			const channelId = interaction.values[0];
			if (action === 'selectText') {
				await guildChannels.setDefaultTextChannel(this.container.guildService, interaction.guildId, channelId);
			} else if (action === 'selectVoice') {
				await guildChannels.setDefaultVoiceChannel(this.container.guildService, interaction.guildId, channelId);
			} else if (action === 'selectPin') {
				await guildChannels.setPinnedChannel(this.container.guildService, interaction.guildId, channelId);
			}
		}

		// 고정 채널 입력 동작 (play: 즉시 재생 / select: 5개 선택)
		if (interaction.isStringSelectMenu() && action === 'selectPinMode') {
			await guildChannels.setPinnedChannelMode(
				this.container.guildService,
				interaction.guildId,
				interaction.values[0] === 'select' ? 'select' : 'play'
			);
		}

		// 고정 채널 입력 메시지 삭제 토글
		if (action === 'togglePinDelete') {
			const guild = await this.container.guildService.getGuild(interaction.guildId);
			await guildChannels.setPinnedChannelDeleteInput(this.container.guildService, interaction.guildId, !guild.pinnedChannelDeleteInput);
		}

		// JTC actions
		if (action === 'toggleJtc') {
			const settings = await guildJtc.getJtcSettings(this.container.guildService, interaction.guildId);
			if (settings.enabled || settings.markerChannelId) {
				await guildJtc.setJtcEnabled(this.container.guildService, interaction.guildId, !settings.enabled);
			}
		} else if (interaction.isChannelSelectMenu() && action === 'selectJtcCategory') {
			try {
				await this.container.tempVoiceService.setupMarkerChannel(interaction.guildId, interaction.values[0]);
			} catch (error) {
				this.container.logger.error(`[tempVoice] marker setup failed (guild ${interaction.guildId}): ${error}`);
				await interaction.followUp({
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView(`${emoji('error')} 카테고리를 설정하지 못했어요. 봇에게 채널 관리 권한이 있는지 확인해 주세요.`)]
				});
			}
		} else if (interaction.isStringSelectMenu() && action === 'selectJtcLimit') {
			await guildJtc.setJtcUserLimit(this.container.guildService, interaction.guildId, Number(interaction.values[0]));
		}

		// SponsorBlock actions
		if (interaction.isStringSelectMenu() && action === 'selectSponsorblock') {
			await guildPlayback.setSponsorBlockSegments(this.container.guildService, interaction.guildId, interaction.values);
			const player = this.container.audio.players.get(interaction.guildId);
			if (player) sponsorBlockService.refreshSettings(player);
		} else if (action === 'resetSponsorblock') {
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
