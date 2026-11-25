import { emoji, GUILD_SETTINGS_INVALIDATE_CHANNEL } from '@sirubot/utils';
import { BOT_MODULES, isModuleDisabled } from '@sirubot/utils/modules';
import { transitionMode, TRANSITION_LABELS } from '@sirubot/utils/mixerTransition';
import {
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	MessageFlags,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder
} from 'discord.js';
import { RepeatMode } from 'lavalink-client';
import { queueRelatedUpfront } from '../../lavalink/autoPlayRelated.ts';
import { errorView } from '../../../../lib/errorView.ts';
import * as guildChannels from '../../../../services/guildSettings/channels.ts';
import * as guildJtc from '../../../../services/guildSettings/jtc.ts';
import * as guildModules from '../../../../services/guildSettings/modules.ts';
import * as guildPlayback from '../../../../services/guildSettings/playback.ts';
import { normalizeAiMode } from '../../../../services/guildSettings/types.ts';
import { AI_MODE_LABELS, SPONSORBLOCK_SEGMENTS, sponsorBlockSegmentEmoji } from './labels.ts';
import { jtcTemplateModal } from './modals.ts';
import { SETTINGS_PAGES, type MusicSubpage, type SettingsEntry, type SettingsScreen } from './types.ts';
import type { Guild } from '@sirubot/prisma';

const backButton = () => new ButtonBuilder().setStyle(ButtonStyle.Primary);

/** 첫 화면 "음악" 항목의 한 줄 요약 (셀렉트 설명은 100자 이하) */
export function musicNavDescription(
	guild: Pick<Guild, 'sponsorBlockSegments' | 'djRoleId' | 'gaplessEnabled'> & Parameters<typeof transitionMode>[0]
): string {
	const sponsorBlock = guild.sponsorBlockSegments.length > 0 ? `스폰서블록 ${guild.sponsorBlockSegments.length}개 구간` : '스폰서블록 꺼짐';
	return `곡 전환 ${TRANSITION_LABELS[transitionMode(guild)]} · 갭리스 ${guild.gaplessEnabled ? '켜짐' : '꺼짐'} · DJ ${guild.djRoleId ? '설정됨' : '미설정'} · ${sponsorBlock}`;
}

const MUSIC_SUBPAGE_OPTIONS: Array<{ value: MusicSubpage; emoji: string; label: string; description: string }> = [
	{ value: 'music', emoji: emoji('music_note'), label: '재생', description: '컨트롤러·추천 곡·반복 모드' },
	{ value: 'audio', emoji: emoji('spectrum'), label: '곡 전환·오디오', description: '전환·갭리스·크로스페이드·정규화·안내' },
	{ value: 'sponsorblock', emoji: emoji('arrow_forward'), label: '스폰서블록', description: '건너뛸 구간 유형' },
	{ value: 'dj', emoji: emoji('cd'), label: 'DJ 역할', description: '제어 권한을 가진 역할' }
];

/** 음악 하위 페이지 4개 위에 놓이는 이동 셀렉트 — 첫 화면과 같은 `navigate` 액션을 써서 customId는 그대로예요 */
export function buildMusicSubNav(current: MusicSubpage): StringSelectMenuBuilder {
	return new StringSelectMenuBuilder()
		.setPlaceholder('음악 설정 페이지 이동')
		.setMinValues(1)
		.setMaxValues(1)
		.addOptions(MUSIC_SUBPAGE_OPTIONS.map((option) => ({ ...option, default: option.value === current })));
}

/** 첫 화면·페이지 이동 — 하위 페이지의 뒤로가기 버튼은 뷰가 붙여요 */
export const coreActions = {
	navigate: {
		mode: ({ interaction }): SettingsScreen => {
			if (!interaction.isStringSelectMenu()) return 'main';
			const target = interaction.values[0];
			return (SETTINGS_PAGES as readonly string[]).includes(target) ? (target as SettingsScreen) : 'main';
		},
		control: {
			screen: 'main',
			row: 'nav',
			build: (guild) => {
				const channelDescription = guild.textChannelId
					? guild.voiceChannelId
						? '텍스트·음성 채널 설정됨'
						: '텍스트 채널 설정됨'
					: guild.voiceChannelId
						? '음성 채널 설정됨'
						: '채널 미설정';
				const aiMode = AI_MODE_LABELS[normalizeAiMode(guild.aiMode)];
				return new StringSelectMenuBuilder()
					.setPlaceholder('설정할 기능을 선택하세요')
					.setMinValues(1)
					.setMaxValues(1)
					.addOptions([
						{ value: 'music', emoji: emoji('music_note'), label: '음악', description: musicNavDescription(guild) },
						{ value: 'channel', emoji: emoji('scroll'), label: '채널 설정', description: channelDescription },
						{ value: 'jtc', emoji: emoji('volume_up'), label: '임시 음성', description: guild.jtcEnabled ? '켜짐' : '꺼짐' },
						{ value: 'ai', emoji: emoji('robot'), label: 'AI 채팅', description: aiMode },
						{ value: 'chatTools', emoji: emoji('sparkle'), label: '채팅 유틸·카운팅', description: '이모지 확대·인용·임베드 복구·카운팅' }
					]);
			}
		}
	},
	back: { mode: 'main', control: null },
	// 선택된 모듈이 켜짐이에요. 목록에 없는 값과 끌 수 없는 모듈은 서비스가 걸러내요.
	selectModules: {
		mode: 'main',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isStringSelectMenu()) return;
			const enabled = new Set(interaction.values);
			const disabled = BOT_MODULES.filter((m) => m.toggleable && !enabled.has(m.id)).map((m) => m.id);
			await guildModules.setDisabledModules(services.guildService, guildId, disabled);
			// 다른 프로세스·대시보드 캐시도 바로 따라오게 알려요 (연결이 없으면 건너뛰어요. 60초 TTL이 폴백이에요)
			services.redisStore?.publish(
				GUILD_SETTINGS_INVALIDATE_CHANNEL,
				JSON.stringify({ guildId }),
				`Guild settings invalidate (guild ${guildId})`
			);
		},
		control: {
			screen: 'main',
			row: 'modules',
			// 기능 모듈 켜기/끄기 (P-06): 켜져 있는 모듈이 선택된 상태예요. 관리 모듈은 끌 수 없어서 목록에 없어요.
			build: (guild) => {
				const toggleable = BOT_MODULES.filter((m) => m.toggleable);
				return new StringSelectMenuBuilder()
					.setPlaceholder('이 서버에서 쓸 기능을 고르세요')
					.setMinValues(0)
					.setMaxValues(toggleable.length)
					.addOptions(
						toggleable.map((m) => ({
							label: m.label,
							value: m.id,
							emoji: emoji(m.appEmoji, m.emoji),
							description: m.description,
							default: !isModuleDisabled(guild.disabledModules, m.id)
						}))
					);
			}
		}
	},
	toggleController: {
		mode: 'music',
		apply: async ({ guildId, services }) => {
			const guild = await services.guildService.getGuild(guildId);
			await guildPlayback.setEnableController(services.guildService, guildId, !guild.enableController);
		},
		control: {
			screen: 'music',
			row: 'toggles',
			build: (guild) =>
				new ButtonBuilder()
					.setEmoji(emoji('spectrum'))
					.setLabel(guild.enableController ? '컨트롤러 끄기' : '컨트롤러 켜기')
					.setStyle(ButtonStyle.Secondary)
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
					void queueRelatedUpfront(services.lavalink, player, currentTrack).catch((error) => {
						services.logger.warn(`[mixer] related pre-add failed (guild ${guildId}): ${error}`);
					});
				}
			}
		},
		control: {
			screen: 'music',
			row: 'toggles',
			build: (guild) =>
				new ButtonBuilder()
					.setEmoji(emoji('sparkle'))
					.setLabel(guild.related ? '추천 곡 끄기' : '추천 곡 켜기')
					.setStyle(ButtonStyle.Secondary)
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
		},
		control: {
			screen: 'music',
			row: 'toggles',
			build: (guild) =>
				new ButtonBuilder()
					.setEmoji(emoji('repeat'))
					.setLabel(guild.repeat === 'off' ? '한 곡 반복 켜기' : guild.repeat === 'track' ? '전체 반복 켜기' : '반복 끄기')
					.setStyle(ButtonStyle.Secondary)
		}
	},
	toggleDeleteInput: {
		mode: 'channel',
		apply: async ({ guildId, services }) => {
			const guild = await services.guildService.getGuild(guildId);
			await guildChannels.setTextChannelDeleteInput(services.guildService, guildId, !guild.textChannelDeleteInput);
		},
		control: {
			screen: 'channel',
			row: 'actions',
			build: (guild) =>
				new ButtonBuilder()
					.setLabel(guild.textChannelDeleteInput ? '입력 메시지 보존' : '입력 메시지 삭제')
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(!guild.textChannelId || !guild.textChannelInputPlay)
		}
	},
	toggleInputPlay: {
		mode: 'channel',
		apply: async ({ guildId, services }) => {
			const guild = await services.guildService.getGuild(guildId);
			await guildChannels.setTextChannelInputPlay(services.guildService, guildId, !guild.textChannelInputPlay);
		},
		control: {
			screen: 'channel',
			row: 'actions',
			build: (guild) =>
				new ButtonBuilder()
					.setLabel(guild.textChannelInputPlay ? '채팅 입력 재생 끄기' : '채팅 입력 재생 켜기')
					.setStyle(guild.textChannelInputPlay ? ButtonStyle.Success : ButtonStyle.Secondary)
					.setDisabled(!guild.textChannelId)
		}
	},
	toggleJtc: {
		mode: 'jtc',
		apply: async ({ guildId, services }) => {
			const settings = await guildJtc.getJtcSettings(services.guildService, guildId);
			if (settings.enabled || settings.markerChannelId) {
				await guildJtc.setJtcEnabled(services.guildService, guildId, !settings.enabled);
			}
		},
		control: {
			screen: 'jtc',
			row: 'toggle',
			build: (guild) =>
				new ButtonBuilder()
					.setLabel(guild.jtcEnabled ? '설정 끄기' : '설정 켜기')
					.setStyle(guild.jtcEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
					.setDisabled(!guild.jtcMarkerChannelId && !guild.jtcEnabled)
		}
	},
	selectSponsorblock: {
		mode: 'sponsorblock',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isStringSelectMenu()) return;
			await guildPlayback.setSponsorBlockSegments(services.guildService, guildId, interaction.values);
			const player = services.audio.players.get(guildId);
			if (player) services.sponsorBlockService.refreshSettings(player);
		},
		control: {
			screen: 'sponsorblock',
			row: 'segments',
			build: (guild) =>
				new StringSelectMenuBuilder()
					.setPlaceholder('건너뛸 구간 유형을 선택하세요')
					.setMinValues(0)
					.setMaxValues(SPONSORBLOCK_SEGMENTS.length)
					.addOptions(
						SPONSORBLOCK_SEGMENTS.map((segment) => ({
							label: segment.label,
							value: segment.name,
							emoji: sponsorBlockSegmentEmoji(segment),
							description: segment.description,
							default: guild.sponsorBlockSegments.includes(segment.name)
						}))
					)
		}
	},
	resetSponsorblock: {
		mode: 'sponsorblock',
		apply: async ({ guildId, services }) => {
			await guildPlayback.setSponsorBlockSegments(services.guildService, guildId, []);
			const player = services.audio.players.get(guildId);
			if (player) services.sponsorBlockService.refreshSettings(player);
		},
		control: {
			screen: 'sponsorblock',
			row: 'actions',
			build: (guild) =>
				new ButtonBuilder()
					.setEmoji(emoji('repeat'))
					.setLabel('전체 해제')
					.setStyle(ButtonStyle.Danger)
					.setDisabled(guild.sponsorBlockSegments.length === 0)
		}
	},
	selectDj: {
		mode: 'dj',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isRoleSelectMenu()) return;
			await guildPlayback.setDJRole(services.guildService, guildId, interaction.values[0]);
		},
		control: {
			screen: 'dj',
			row: 'pick',
			build: () => new RoleSelectMenuBuilder().setPlaceholder('DJ 역할을 선택하세요')
		}
	},
	removeDj: {
		mode: 'dj',
		apply: async ({ guildId, services }) => {
			await guildPlayback.setDJRole(services.guildService, guildId, null);
		},
		control: {
			screen: 'dj',
			row: 'actions',
			build: (guild) =>
				new ButtonBuilder().setEmoji(emoji('trash')).setLabel('DJ 역할 제거').setStyle(ButtonStyle.Danger).setDisabled(!guild.djRoleId)
		}
	},
	selectText: {
		mode: 'channel',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isChannelSelectMenu()) return;
			const previous = await guildChannels.getDefaultTextChannel(services.guildService, guildId);
			await guildChannels.setDefaultTextChannel(services.guildService, guildId, interaction.values[0]);
			await services.lavalink.playerNotifier.syncPanel(guildId, previous);
		},
		control: {
			screen: 'channel',
			row: 'text',
			build: () => new ChannelSelectMenuBuilder().setPlaceholder('기본 텍스트 채널을 선택하세요').setChannelTypes(ChannelType.GuildText)
		}
	},
	selectVoice: {
		mode: 'channel',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isChannelSelectMenu()) return;
			await guildChannels.setDefaultVoiceChannel(services.guildService, guildId, interaction.values[0]);
		},
		control: {
			screen: 'channel',
			row: 'voice',
			build: () =>
				new ChannelSelectMenuBuilder()
					.setPlaceholder('기본 음성 채널을 선택하세요')
					.setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
		}
	},
	// 채팅 입력 재생 동작 (play: 즉시 재생 / select: 5개 선택)
	selectInputMode: {
		mode: 'channel',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isStringSelectMenu()) return;
			await guildChannels.setTextChannelMode(services.guildService, guildId, interaction.values[0] === 'select' ? 'select' : 'play');
		},
		control: {
			screen: 'channel',
			row: 'inputMode',
			build: (guild) =>
				new StringSelectMenuBuilder()
					.setPlaceholder('입력 동작 선택')
					.setMinValues(1)
					.setMaxValues(1)
					.addOptions([
						{
							emoji: emoji('arrow_forward'),
							label: '즉시 재생 (첫 결과 바로 재생)',
							value: 'play',
							default: guild.textChannelMode !== 'select'
						},
						{
							emoji: emoji('clipboard'),
							label: '선택 재생 (5개 중 선택)',
							value: 'select',
							default: guild.textChannelMode === 'select'
						}
					])
		}
	},
	removeText: {
		mode: 'channel',
		apply: async ({ guildId, services }) => {
			const previous = await guildChannels.getDefaultTextChannel(services.guildService, guildId);
			await guildChannels.setDefaultTextChannel(services.guildService, guildId, null);
			await services.lavalink.playerNotifier.syncPanel(guildId, previous);
		},
		control: {
			screen: 'channel',
			row: 'actions',
			build: (guild) =>
				new ButtonBuilder()
					.setEmoji(emoji('trash'))
					.setLabel('텍스트 채널 제거')
					.setStyle(ButtonStyle.Danger)
					.setDisabled(!guild.textChannelId)
		}
	},
	removeVoice: {
		mode: 'channel',
		apply: async ({ guildId, services }) => {
			await guildChannels.setDefaultVoiceChannel(services.guildService, guildId, null);
		},
		control: {
			screen: 'channel',
			row: 'actions',
			build: (guild) =>
				new ButtonBuilder()
					.setEmoji(emoji('trash'))
					.setLabel('음성 채널 제거')
					.setStyle(ButtonStyle.Danger)
					.setDisabled(!guild.voiceChannelId)
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
		},
		control: {
			screen: 'jtc',
			row: 'category',
			build: () => new ChannelSelectMenuBuilder().setChannelTypes(ChannelType.GuildCategory).setPlaceholder('방을 만들 카테고리를 선택하세요')
		}
	},
	selectJtcLimit: {
		mode: 'jtc',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isStringSelectMenu()) return;
			await guildJtc.setJtcUserLimit(services.guildService, guildId, Number(interaction.values[0]));
		},
		control: {
			screen: 'jtc',
			row: 'limit',
			build: (guild) =>
				new StringSelectMenuBuilder()
					.setPlaceholder('입장 인원 제한')
					.setMinValues(1)
					.setMaxValues(1)
					.addOptions(
						[0, 1, 2, 3, 5, 10].map((value) => ({
							label: value === 0 ? '무제한' : `${value}명`,
							value: String(value),
							default: guild.jtcUserLimit === value
						}))
					)
		}
	},
	jtcTemplate: {
		preDefer: async ({ interaction, guildId, services }) => {
			const settings = await guildJtc.getJtcSettings(services.guildService, guildId);
			await interaction.showModal(jtcTemplateModal(settings.template));
		},
		control: {
			screen: 'jtc',
			row: 'template',
			build: () => new ButtonBuilder().setEmoji(emoji('bell')).setLabel('방 이름 수정').setStyle(ButtonStyle.Secondary)
		}
	}
} satisfies Record<string, SettingsEntry>;

/** 뒤로가기 버튼 모양 — 뷰가 모든 하위 페이지에 같은 모양으로 붙여요 */
export function buildBackButton(): ButtonBuilder {
	return backButton().setEmoji(emoji('arrow_back')).setLabel('뒤로가기');
}
