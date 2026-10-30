import { container } from '@sapphire/framework';
import type { RepeatMode } from 'lavalink-client';
import { queueRelatedUpfront } from '../../modules/audio/lavalink/autoPlayRelated.ts';
import { checkManageGuild } from '../../modules/audio/utils/permissionCheck.ts';
import type { TtsAnnounceMode } from '../guildSettings/playback.ts';
import type { AiTool, AiToolContext } from './types.ts';

function requireGuild(ctx: AiToolContext): string {
	if (!ctx.guildId) throw new Error('서버 채널에서만 음악 설정을 사용할 수 있어요.');
	return ctx.guildId;
}

function checkMemberManageGuild(ctx: AiToolContext): boolean {
	if (!ctx.member) return false;
	try {
		return checkManageGuild(ctx.member);
	} catch {
		return false;
	}
}

async function checkMemberDJRole(guildId: string, ctx: AiToolContext): Promise<boolean> {
	if (!ctx.member) return false;
	try {
		return await container.guildService.hasDJRole(guildId, ctx.member);
	} catch {
		return false;
	}
}

/** 음악 설정 변경을 위한 2차 권한 검사 (서버 관리자 또는 DJ 역할 필요) */
async function requireMusicSettingsPermission(ctx: AiToolContext): Promise<void> {
	const guildId = requireGuild(ctx);
	if (!ctx.member) throw new Error('사용자 권한을 확인할 수 없어요.');
	const isManager = checkMemberManageGuild(ctx);
	const isDj = await checkMemberDJRole(guildId, ctx);
	if (!isManager && !isDj) {
		throw new Error('음악 설정을 변경할 권한이 없어요. DJ 역할을 가지고 있거나 서버 관리 권한이 필요해요.');
	}
}

export const musicSettingsGetTool: AiTool = {
	name: 'music_settings_get',
	description:
		'현재 서버의 음악 재생 설정(기본 볼륨, 반복 모드, 추천곡 자동재생, 갭리스, 크로스페이드, 음량 평준화, 곡 안내 낭독 모드, 컨트롤러 카드 표시 여부, 스폰서블록 건너뛰기)을 조회해요. 모든 사용자가 조회할 수 있어요.',
	properties: {},
	required: [],
	status: '시루가 음악 설정을 확인하는 중..',
	execute: async (_args, ctx) => {
		const guildId = requireGuild(ctx);
		const [volume, repeat, autoplay, mixerSettings, announceMode, controllerEnabled, guild] = await Promise.all([
			container.guildService.getVolume(guildId),
			container.guildService.getRepeat(guildId),
			container.guildService.getRelated(guildId),
			container.guildService.getMixerSettings(guildId),
			container.guildService.getTtsAnnounceMode(guildId),
			container.guildService.getEnableController(guildId),
			container.guildService.getGuild(guildId)
		]);

		const player = container.audio?.getPlayer?.(guildId);

		return JSON.stringify({
			status: 'ok',
			volume,
			repeat,
			autoplay,
			gapless: mixerSettings.gaplessEnabled,
			crossfade: {
				enabled: mixerSettings.crossfadeEnabled,
				duration_seconds: mixerSettings.crossfadeMs / 1000
			},
			normalization: mixerSettings.normalizationEnabled,
			announce_mode: announceMode,
			controller: controllerEnabled,
			sponsorblock: {
				enabled: (guild.sponsorBlockSegments ?? []).length > 0,
				segments: guild.sponsorBlockSegments ?? []
			},
			is_playing: Boolean(player?.playing)
		});
	}
};

export const musicSettingsSetTool: AiTool = {
	name: 'music_settings_set',
	description:
		'서버의 음악 재생 설정을 변경해요. DJ 역할 또는 서버 관리자 권한이 필요해요. ' +
		'지정한 항목만 변경돼요. 볼륨, 반복(off|track|queue), 연관재생(autoplay), 갭리스(gapless), 크로스페이드(crossfade_enabled, crossfade_duration_seconds), ' +
		'음량 평준화(normalization), 곡 안내 낭독(announce_mode: sequential|parallel|interrupt), 컨트롤러(controller), 스폰서블록(sponsorblock).',
	properties: {
		volume: {
			type: 'integer',
			description: '서버 기본 볼륨 (0~150)'
		},
		repeat: {
			type: 'string',
			enum: ['off', 'track', 'queue'],
			description: '반복 재생 모드 (off: 끄기, track: 한 곡 반복, queue: 전체 반복)'
		},
		autoplay: {
			type: 'boolean',
			description: '대기열 종료 시 유튜브 추천곡 자동 재생(연관 재생) 활성화 여부'
		},
		gapless: {
			type: 'boolean',
			description: '무음 구간 제거(갭리스 재생) 활성화 여부'
		},
		crossfade_enabled: {
			type: 'boolean',
			description: '곡 전환 크로스페이드 활성화 여부'
		},
		crossfade_duration_seconds: {
			type: 'number',
			description: '크로스페이드 지속 시간 (초 단위, 1~10초)'
		},
		normalization: {
			type: 'boolean',
			description: '음량 평준화(오디오 노멀라이제이션) 활성화 여부'
		},
		announce_mode: {
			type: 'string',
			enum: ['sequential', 'parallel', 'interrupt'],
			description: '곡 시작 TTS 안내 모드 (sequential: 곡 전 순차 안내, parallel: 재생과 동시 낭독, interrupt: 최신 안내만 낭독)'
		},
		controller: {
			type: 'boolean',
			description: '곡 재생 시 컨트롤러 카드(버튼 UI) 메시지 전송 여부'
		},
		sponsorblock: {
			type: 'boolean',
			description: '유튜브 스폰서/광고 구간 건너뛰기 활성화 여부'
		}
	},
	required: [],
	status: '시루가 음악 설정을 변경하는 중..',
	execute: async (args, ctx) => {
		const guildId = requireGuild(ctx);
		await requireMusicSettingsPermission(ctx);

		const updated: Record<string, unknown> = {};

		if (args.volume !== undefined && args.volume !== null) {
			const vol = Math.round(Number(args.volume));
			if (!Number.isFinite(vol) || vol < 0 || vol > 150) {
				throw new Error('볼륨은 0~150 사이의 정수여야 해요.');
			}
			const { volume: updatedVol } = await container.guildService.updateVolume(guildId, vol);
			const player = container.audio?.getPlayer?.(guildId);
			if (player) player.setVolume(updatedVol);
			updated.volume = updatedVol;
		}

		if (args.repeat !== undefined && args.repeat !== null) {
			const repeat = String(args.repeat);
			if (!['off', 'track', 'queue'].includes(repeat)) {
				throw new Error('반복 모드는 off, track, queue 중 하나여야 해요.');
			}
			const updatedRepeat = await container.guildService.setRepeat(guildId, repeat as RepeatMode);
			const player = container.audio?.getPlayer?.(guildId);
			if (player) {
				await player.setRepeatMode(updatedRepeat);
				await container.mixerService?.clearNext?.(player).catch(() => null);
			}
			updated.repeat = updatedRepeat;
		}

		if (args.autoplay !== undefined && args.autoplay !== null) {
			const autoplay = Boolean(args.autoplay);
			const updatedAutoplay = await container.guildService.setRelated(guildId, autoplay);
			if (updatedAutoplay) {
				const player = container.audio?.getPlayer?.(guildId);
				const currentTrack = player?.queue?.current;
				if (player?.playing && currentTrack && player.queue.tracks.length === 0) {
					void queueRelatedUpfront(player, currentTrack).catch(() => null);
				}
			}
			updated.autoplay = updatedAutoplay;
		}

		if (args.gapless !== undefined && args.gapless !== null) {
			const gapless = Boolean(args.gapless);
			await container.guildService.setGapless(guildId, gapless);
			const player = container.audio?.getPlayer?.(guildId);
			if (player) {
				if (!gapless) await container.mixerService?.clearNext?.(player, { force: true }).catch(() => null);
				else await container.mixerService?.preloadUpcoming?.(player, { force: true }).catch(() => null);
			}
			updated.gapless = gapless;
		}

		if (args.crossfade_enabled !== undefined || args.crossfade_duration_seconds !== undefined) {
			const currentMixer = await container.guildService.getMixerSettings(guildId);
			const enabled = args.crossfade_enabled !== undefined ? Boolean(args.crossfade_enabled) : currentMixer.crossfadeEnabled;
			const durationMs = args.crossfade_duration_seconds !== undefined ? Math.round(Number(args.crossfade_duration_seconds) * 1000) : undefined;
			if (durationMs !== undefined && (durationMs < 1000 || durationMs > 10000)) {
				throw new Error('크로스페이드 지속 시간은 1초에서 10초 사이여야 해요.');
			}
			const saved = await container.guildService.setCrossfade(guildId, enabled, durationMs);
			const player = container.audio?.getPlayer?.(guildId);
			if (player) {
				await container.mixerService?.setCrossfade?.(player, saved.crossfadeEnabled, saved.crossfadeMs).catch(() => null);
			}
			updated.crossfade = {
				enabled: saved.crossfadeEnabled,
				duration_seconds: saved.crossfadeMs / 1000
			};
		}

		if (args.normalization !== undefined && args.normalization !== null) {
			const normalization = Boolean(args.normalization);
			await container.guildService.setNormalization(guildId, normalization);
			const player = container.audio?.getPlayer?.(guildId);
			if (player) {
				await container.mixerService?.setNormalization?.(player, normalization).catch(() => null);
			}
			updated.normalization = normalization;
		}

		if (args.announce_mode !== undefined && args.announce_mode !== null) {
			const mode = String(args.announce_mode);
			if (!['sequential', 'parallel', 'interrupt'].includes(mode)) {
				throw new Error('곡 안내 모드는 sequential, parallel, interrupt 중 하나여야 해요.');
			}
			const savedMode = await container.guildService.setTtsAnnounceMode(guildId, mode as TtsAnnounceMode);
			updated.announce_mode = savedMode;
		}

		if (args.controller !== undefined && args.controller !== null) {
			const controller = Boolean(args.controller);
			await container.guildService.setEnableController(guildId, controller);
			updated.controller = controller;
		}

		if (args.sponsorblock !== undefined && args.sponsorblock !== null) {
			const sponsorblock = Boolean(args.sponsorblock);
			const segments = sponsorblock ? ['sponsor', 'selfpromo'] : [];
			await container.guildService.setSponsorBlockSegments(guildId, segments);
			updated.sponsorblock = sponsorblock;
		}

		if (Object.keys(updated).length === 0) {
			throw new Error('변경할 음악 설정 항목이 지정되지 않았어요.');
		}

		return JSON.stringify({
			status: 'ok',
			updated
		});
	}
};

export const musicSettingsTools: AiTool[] = [musicSettingsGetTool, musicSettingsSetTool];
