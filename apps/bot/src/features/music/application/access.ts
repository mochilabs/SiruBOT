import { emoji } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import type { Actor } from './actor.ts';

/**
 * 음악 제어 거절 문구 — 슬래시 프리컨디션과 유스케이스가 같은 문구를 써요.
 * 앱 이모지 매핑은 부팅 후에 로드되므로 상수가 아니라 호출 시점에 평가해요.
 */
export const MUSIC_ACCESS_MESSAGES = {
	voiceRequired: () => `${emoji('music_note')} 이 명령어는 음성 채널에 접속한 사용자만 사용 가능해요.`,
	sameVoiceRequired: () => `${emoji('link')} 이 명령어를 사용하려면 봇과 같은 음성 채널에 연결해야 해요.`,
	djOnly: () => `${emoji('volume_muted')} 이 명령어는 DJ 역할을 가지고 있거나, 채널에 혼자 있을 때만 사용 가능해요.`,
	noSong: () => `${emoji('music_note')} 현재 곡이 없어요. 먼저 /재생으로 곡을 추가해 주세요.`
} as const;

export interface MusicAccessDeps {
	/** 봇이 현재 접속한 음성 채널 (없으면 null) */
	getBotVoiceChannelId(guildId: string): string | null;
	/** 길드에 설정된 DJ 역할 (없으면 null) */
	getDjRoleId(guildId: string): Promise<string | null>;
}

export interface MusicAccess {
	/** 음성 채널 조건 → (옵션) DJ 조건 순으로 검사하고 위반하면 `AppError('forbidden')`을 던져요. */
	authorize(actor: Actor, options?: { dj?: boolean }): Promise<void>;
}

/**
 * DJ 역할 미설정이면 모두 허용, Administrator·DJ 역할 보유자 허용, 그 외엔 음성 채널에 사람이 혼자일 때만 허용해요.
 * (`checkDJOrAlone`의 정의 그대로 — 단일 원본)
 */
export function isDjOrAlone(actor: Actor, djRoleId: string | null): boolean {
	if (!djRoleId) return true;
	if (actor.isAdministrator || actor.roleIds.has(djRoleId)) return true;
	return actor.voiceChannelId !== null && actor.humansInVoiceChannel === 1;
}

/**
 * 봇과 같은 음성 채널에 있어야 해요. 봇이 채널에 없으면 아무 음성 채널에 있으면 돼요.
 * Administrator만 이 조건을 면제받아요.
 */
export function isInBotVoice(actor: Pick<Actor, 'isAdministrator' | 'voiceChannelId'>, botVoiceChannelId: string | null): boolean {
	if (actor.isAdministrator) return true;
	return actor.voiceChannelId !== null && (botVoiceChannelId === null || actor.voiceChannelId === botVoiceChannelId);
}

/** 슬래시·버튼·대시보드·AI 도구가 모두 쓰는 음악 제어 인가 정책의 단일 구현이에요. */
export function createMusicAccess(deps: MusicAccessDeps): MusicAccess {
	return {
		async authorize(actor, options = {}) {
			const botVoiceChannelId = deps.getBotVoiceChannelId(actor.guildId);
			if (!isInBotVoice(actor, botVoiceChannelId)) {
				const message = actor.voiceChannelId === null ? MUSIC_ACCESS_MESSAGES.voiceRequired() : MUSIC_ACCESS_MESSAGES.sameVoiceRequired();
				throw new AppError('forbidden', message, { ephemeral: true });
			}
			if (options.dj === false) return;
			if (!isDjOrAlone(actor, await deps.getDjRoleId(actor.guildId))) {
				throw new AppError('forbidden', MUSIC_ACCESS_MESSAGES.djOnly(), { ephemeral: true });
			}
		}
	};
}
