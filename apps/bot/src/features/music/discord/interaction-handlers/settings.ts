import { InteractionHandler, InteractionHandlerTypes, type container } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import {
	MessageFlags,
	type ButtonInteraction,
	type StringSelectMenuInteraction,
	type RoleSelectMenuInteraction,
	type ChannelSelectMenuInteraction
} from 'discord.js';
import { settingsId } from '../customIds.ts';
import { settingsView, jtcTemplateModal, SettingsMode } from '../views/settings.ts';
import { RepeatMode } from 'lavalink-client';
import { checkManageGuild } from '../utils/permissionCheck.ts';
import { queueRelatedUpfront } from '../../lavalink/autoPlayRelated.ts';
import { errorView } from '../../../../lib/errorView.ts';
import * as guildChannels from '../../../../services/guildSettings/channels.ts';
import * as guildJtc from '../../../../services/guildSettings/jtc.ts';
import * as guildPlayback from '../../../../services/guildSettings/playback.ts';

type SettingsComponentAction = Exclude<NonNullable<ReturnType<typeof settingsId.decode>>['action'], 'jtcTemplateModal' | 'jtcTemplateInput'>;

type SettingsInteraction =
	| ButtonInteraction<'cached'>
	| StringSelectMenuInteraction<'cached'>
	| RoleSelectMenuInteraction<'cached'>
	| ChannelSelectMenuInteraction<'cached'>;

/** 액션 하나를 처리할 때 필요한 것들 — 서비스는 핸들러의 `this.container`에서 와요. */
interface SettingsContext {
	interaction: SettingsInteraction;
	guildId: string;
	services: typeof container;
}

type SettingsEntry =
	| {
			/** 액션을 처리한 뒤 다시 그릴 화면 — 그 액션의 버튼·셀렉트가 놓인 화면이에요. 함수면 선택한 값으로 정해요. */
			mode: SettingsMode | ((ctx: SettingsContext) => SettingsMode);
			/** 설정을 바꾸는 부수 효과. 컴포넌트 종류가 맞지 않으면 아무것도 하지 않아요. 화면 이동만 하는 액션은 생략해요. */
			apply?: (ctx: SettingsContext) => Promise<void>;
	  }
	| {
			/** 응답 자체가 되는 액션(모달)이라 deferUpdate 전에 처리하고 화면을 다시 그리지 않아요. */
			preDefer: (ctx: SettingsContext) => Promise<void>;
	  };

/**
 * 설정 액션 표 — 새 `settingsId` 액션은 여기에 항목 하나를 더하면 돼요 (없으면 타입 검사가 실패해요).
 * 각 항목의 순서와 컴포넌트 종류 검사는 예전 if 사슬과 같아요.
 */
export const SETTINGS_ACTIONS = {
	navigate: {
		mode: ({ interaction }) => {
			if (!interaction.isStringSelectMenu()) return 'main';
			const target = interaction.values[0];
			return target === 'music' || target === 'sponsorblock' || target === 'dj' || target === 'channel' || target === 'jtc' ? target : 'main';
		}
	},
	back: { mode: 'main' },
	toggleController: {
		mode: 'music',
		apply: async ({ guildId, services }) => {
			const guild = await services.guildService.getGuild(guildId);
			await guildPlayback.setEnableController(services.guildService, guildId, !guild.enableController);
		}
	},
	toggleRelated: {
		mode: 'music',
		apply: async ({ guildId, services }) => {
			const guild = await services.guildService.getGuild(guildId);
			const next = !guild.related;
			await guildPlayback.setRelated(services.guildService, guildId, next);
			// /추천곡 커맨드와 동일하게, 켰을 때는 현재 곡의 다음 추천을 미리 준비해 둔다.
			if (next) {
				const player = services.audio.getPlayer(guildId);
				const currentTrack = player?.queue.current;
				if (player?.playing && currentTrack && player.queue.tracks.length === 0) {
					void queueRelatedUpfront(player, currentTrack).catch((error) => {
						services.logger.warn(`[mixer] related pre-add failed (guild ${guildId}): ${error}`);
					});
				}
			}
		}
	},
	toggleRepeat: {
		mode: 'music',
		apply: async ({ guildId, services }) => {
			const guild = await services.guildService.getGuild(guildId);
			const current = guild.repeat as RepeatMode;
			const next: RepeatMode = current === 'off' ? 'track' : current === 'track' ? 'queue' : 'off';
			await guildPlayback.setRepeat(services.guildService, guildId, next);

			const player = services.audio.players.get(guildId);
			if (player) {
				player.setRepeatMode(next);
				await services.mixerService.clearNext(player).catch(() => null);
			}
		}
	},
	togglePinDelete: {
		mode: 'channel',
		apply: async ({ guildId, services }) => {
			const guild = await services.guildService.getGuild(guildId);
			await guildChannels.setPinnedChannelDeleteInput(services.guildService, guildId, !guild.pinnedChannelDeleteInput);
		}
	},
	toggleJtc: {
		mode: 'jtc',
		apply: async ({ guildId, services }) => {
			const settings = await guildJtc.getJtcSettings(services.guildService, guildId);
			if (settings.enabled || settings.markerChannelId) {
				await guildJtc.setJtcEnabled(services.guildService, guildId, !settings.enabled);
			}
		}
	},
	selectSponsorblock: {
		mode: 'sponsorblock',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isStringSelectMenu()) return;
			await guildPlayback.setSponsorBlockSegments(services.guildService, guildId, interaction.values);
			const player = services.audio.players.get(guildId);
			if (player) services.sponsorBlockService.refreshSettings(player);
		}
	},
	resetSponsorblock: {
		mode: 'sponsorblock',
		apply: async ({ guildId, services }) => {
			await guildPlayback.setSponsorBlockSegments(services.guildService, guildId, []);
			const player = services.audio.players.get(guildId);
			if (player) services.sponsorBlockService.refreshSettings(player);
		}
	},
	selectDj: {
		mode: 'dj',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isRoleSelectMenu()) return;
			await guildPlayback.setDJRole(services.guildService, guildId, interaction.values[0]);
		}
	},
	removeDj: {
		mode: 'dj',
		apply: async ({ guildId, services }) => {
			await guildPlayback.setDJRole(services.guildService, guildId, null);
		}
	},
	selectText: {
		mode: 'channel',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isChannelSelectMenu()) return;
			await guildChannels.setDefaultTextChannel(services.guildService, guildId, interaction.values[0]);
		}
	},
	selectVoice: {
		mode: 'channel',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isChannelSelectMenu()) return;
			await guildChannels.setDefaultVoiceChannel(services.guildService, guildId, interaction.values[0]);
		}
	},
	selectPin: {
		mode: 'channel',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isChannelSelectMenu()) return;
			await guildChannels.setPinnedChannel(services.guildService, guildId, interaction.values[0]);
		}
	},
	// 고정 채널 입력 동작 (play: 즉시 재생 / select: 5개 선택)
	selectPinMode: {
		mode: 'channel',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isStringSelectMenu()) return;
			await guildChannels.setPinnedChannelMode(services.guildService, guildId, interaction.values[0] === 'select' ? 'select' : 'play');
		}
	},
	removeText: {
		mode: 'channel',
		apply: async ({ guildId, services }) => {
			await guildChannels.setDefaultTextChannel(services.guildService, guildId, null);
		}
	},
	removeVoice: {
		mode: 'channel',
		apply: async ({ guildId, services }) => {
			await guildChannels.setDefaultVoiceChannel(services.guildService, guildId, null);
		}
	},
	removePin: {
		mode: 'channel',
		apply: async ({ guildId, services }) => {
			await guildChannels.setPinnedChannel(services.guildService, guildId, null);
		}
	},
	selectJtcCategory: {
		mode: 'jtc',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isChannelSelectMenu()) return;
			try {
				await services.tempVoiceService.setupMarkerChannel(guildId, interaction.values[0]);
			} catch (error) {
				services.logger.error(`[tempVoice] marker setup failed (guild ${guildId}): ${error}`);
				await interaction.followUp({
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView(`${emoji('error')} 카테고리를 설정하지 못했어요. 봇에게 채널 관리 권한이 있는지 확인해 주세요.`)]
				});
			}
		}
	},
	selectJtcLimit: {
		mode: 'jtc',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isStringSelectMenu()) return;
			await guildJtc.setJtcUserLimit(services.guildService, guildId, Number(interaction.values[0]));
		}
	},
	jtcTemplate: {
		preDefer: async ({ interaction, guildId, services }) => {
			const settings = await guildJtc.getJtcSettings(services.guildService, guildId);
			await interaction.showModal(jtcTemplateModal(settings.template));
		}
	}
} satisfies Record<SettingsComponentAction, SettingsEntry>;

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

	public async run(interaction: SettingsInteraction, { action }: { action: SettingsComponentAction }) {
		// ManageGuild 권한 체크
		if (!checkManageGuild(interaction.member)) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 서버 설정은 서버 관리 권한이 있는 멤버만 변경할 수 있어요.`)]
			});
			return;
		}

		const ctx: SettingsContext = { interaction, guildId: interaction.guildId, services: this.container };
		const entry: SettingsEntry = SETTINGS_ACTIONS[action];

		// 방 이름 템플릿 모달은 응답 자체여야 하므로 deferUpdate 전에 연다.
		if ('preDefer' in entry) {
			await entry.preDefer(ctx);
			return;
		}

		await interaction.deferUpdate();

		const mode = typeof entry.mode === 'function' ? entry.mode(ctx) : entry.mode;
		await entry.apply?.(ctx);

		// Re-render
		const guild = await this.container.guildService.getGuild(interaction.guildId);

		await interaction.editReply({
			components: [settingsView(guild, mode)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
