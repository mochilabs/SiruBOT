import { emoji } from '@sirubot/utils';
import { isTransitionMode, transitionMode, TRANSITION_LABELS, TRANSITION_MODES } from '@sirubot/utils/mixerTransition';
import { ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import * as guildMixer from '../../../../services/guildSettings/mixer.ts';
import * as guildPlayback from '../../../../services/guildSettings/playback.ts';
import { ANNOUNCE_MODE_DESCRIPTIONS, ANNOUNCE_MODE_LABELS } from './labels.ts';
import { applyMixerToPlayer } from './mixerApply.ts';
import { automixModal, crossfadeModal } from './modals.ts';
import type { SettingsEntry } from './types.ts';

const TRANSITION_DESCRIPTIONS = {
	off: '곡이 끝나면 다음 곡으로 넘어가요',
	crossfade: '곡이 끝날 때 다음 곡과 겹쳐요',
	automix: '박자를 맞춰 자연스럽게 이어요'
} as const;

export const audioActions = {
	selectTransition: {
		mode: 'audio',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isStringSelectMenu()) return;
			const mode = interaction.values[0];
			if (!isTransitionMode(mode)) return;
			const saved = await guildMixer.setTransitionMode(services.guildService, guildId, mode);
			return applyMixerToPlayer(services, guildId, (player) => services.mixerService.setAutomix(player, saved));
		},
		control: {
			screen: 'audio',
			row: 'transition',
			build: (guild) =>
				new StringSelectMenuBuilder()
					.setPlaceholder('곡 전환 방식을 선택하세요')
					.setMinValues(1)
					.setMaxValues(1)
					.addOptions(
						TRANSITION_MODES.map((value) => ({
							label: TRANSITION_LABELS[value],
							value,
							description: TRANSITION_DESCRIPTIONS[value],
							default: transitionMode(guild) === value
						}))
					)
		}
	},
	toggleGapless: {
		mode: 'audio',
		apply: async ({ guildId, services }) => {
			const current = await guildMixer.getMixerSettings(services.guildService, guildId);
			const enabled = !current.gaplessEnabled;
			await guildMixer.setGapless(services.guildService, guildId, enabled);
			return applyMixerToPlayer(services, guildId, async (player) => {
				await services.mixerService.setSilence(player, enabled);
				if (!enabled) await services.mixerService.clearNext(player, { force: true });
				else await services.mixerService.preloadUpcoming(player, { force: true });
			});
		},
		control: {
			screen: 'audio',
			row: 'toggles',
			build: (guild) => new ButtonBuilder().setLabel(guild.gaplessEnabled ? '갭리스 끄기' : '갭리스 켜기').setStyle(ButtonStyle.Secondary)
		}
	},
	toggleNormalization: {
		mode: 'audio',
		apply: async ({ guildId, services }) => {
			const current = await guildMixer.getMixerSettings(services.guildService, guildId);
			const enabled = !current.normalizationEnabled;
			await guildMixer.setNormalization(services.guildService, guildId, enabled);
			return applyMixerToPlayer(services, guildId, (player) => services.mixerService.setNormalization(player, enabled));
		},
		control: {
			screen: 'audio',
			row: 'toggles',
			build: (guild) =>
				new ButtonBuilder().setLabel(guild.normalizationEnabled ? '볼륨 정규화 끄기' : '볼륨 정규화 켜기').setStyle(ButtonStyle.Secondary)
		}
	},
	editCrossfade: {
		preDefer: async ({ interaction, guildId, services }) => {
			const current = await guildMixer.getMixerSettings(services.guildService, guildId);
			await interaction.showModal(crossfadeModal(current.crossfadeMs / 1000));
		},
		control: {
			screen: 'audio',
			row: 'toggles',
			build: () => new ButtonBuilder().setEmoji(emoji('repeat')).setLabel('겹침 시간 수정').setStyle(ButtonStyle.Secondary)
		}
	},
	editAutomix: {
		preDefer: async ({ interaction, guildId, services }) => {
			const current = await guildMixer.getMixerSettings(services.guildService, guildId);
			await interaction.showModal(
				automixModal({
					maxTempoChangePercent: Number((current.automixMaxTempoChange * 100).toFixed(1)),
					minConfidence: Number(current.automixMinConfidence.toFixed(2))
				})
			);
		},
		control: {
			screen: 'audio',
			row: 'toggles',
			build: () => new ButtonBuilder().setEmoji(emoji('spectrum')).setLabel('AutoMix 고급 설정').setStyle(ButtonStyle.Secondary)
		}
	},
	selectAnnounceMode: {
		mode: 'audio',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isStringSelectMenu()) return;
			await guildPlayback.setTtsAnnounceMode(services.guildService, guildId, guildPlayback.normalizeAnnounceMode(interaction.values[0]));
		},
		control: {
			screen: 'audio',
			row: 'announce',
			build: (guild) => {
				const current = guildPlayback.normalizeAnnounceMode(guild.ttsAnnounceMode);
				return new StringSelectMenuBuilder()
					.setPlaceholder('음성 안내 방식')
					.setMinValues(1)
					.setMaxValues(1)
					.addOptions(
						(Object.keys(ANNOUNCE_MODE_LABELS) as Array<keyof typeof ANNOUNCE_MODE_LABELS>).map((value) => ({
							label: `음성 안내: ${ANNOUNCE_MODE_LABELS[value]}`,
							value,
							description: ANNOUNCE_MODE_DESCRIPTIONS[value].slice(0, 100),
							default: current === value
						}))
					);
			}
		}
	}
} satisfies Record<string, SettingsEntry>;
