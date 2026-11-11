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
 * 원격 권한자 — Administrator, 서버 관리(ManageGuild), DJ 역할 보유자예요.
 * 음성 채널 밖에서도 음악을 제어할 수 있고(웹 플레이어의 원격 관리 용도), DJ 조건도 통과해요.
 */
export function hasRemoteControl(actor: Pick<Actor, 'isAdministrator' | 'canManageGuild' | 'roleIds'>, djRoleId: string | null): boolean {
	if (actor.isAdministrator || actor.canManageGuild) return true;
	return djRoleId !== null && actor.roleIds.has(djRoleId);
}

/**
 * DJ 역할 미설정이면 모두 허용, 원격 권한자 허용, 그 외엔 음성 채널에 사람이 혼자일 때만 허용해요.
 */
export function isDjOrAlone(actor: Actor, djRoleId: string | null): boolean {
	if (!djRoleId) return true;
	if (hasRemoteControl(actor, djRoleId)) return true;
	return actor.voiceChannelId !== null && actor.humansInVoiceChannel === 1;
}

/** 봇과 같은 음성 채널에 있는지 봐요. 봇이 채널에 없으면 아무 음성 채널에 있으면 돼요. (권한 예외 없음) */
function sharesBotVoice(actor: Pick<Actor, 'voiceChannelId'>, botVoiceChannelId: string | null): boolean {
	return actor.voiceChannelId !== null && (botVoiceChannelId === null || actor.voiceChannelId === botVoiceChannelId);
}

/** 제어의 음성 채널 조건 — 봇과 같은 음성 채널에 있어야 해요. 원격 권한자는 면제받아요. */
export function isInBotVoice(
	actor: Pick<Actor, 'isAdministrator' | 'canManageGuild' | 'roleIds' | 'voiceChannelId'>,
	botVoiceChannelId: string | null,
	djRoleId: string | null
): boolean {
	return hasRemoteControl(actor, djRoleId) || sharesBotVoice(actor, botVoiceChannelId);
}

/** 제어(일시정지·볼륨·건너뛰기 등) 가능 여부 — 음성 채널 조건과 DJ 조건을 모두 봐요. */
export function canControlMusic(actor: Actor, botVoiceChannelId: string | null, djRoleId: string | null): boolean {
	return isInBotVoice(actor, botVoiceChannelId, djRoleId) && isDjOrAlone(actor, djRoleId);
}

/**
 * 곡 추가 가능 여부 — 봇과 같은 음성 채널이면 누구나 돼요 (슬래시 `/재생` 기준).
 * 원격 권한자는 봇이 이미 음성 채널에 있을 때 채널 밖에서도 추가할 수 있어요. 봇이 채널에 없으면 들어갈 채널을 알 수 없으니 본인이 음성 채널에 있어야 해요.
 */
export function canAddTracks(actor: Actor, botVoiceChannelId: string | null, djRoleId: string | null): boolean {
	if (sharesBotVoice(actor, botVoiceChannelId)) return true;
	return botVoiceChannelId !== null && hasRemoteControl(actor, djRoleId);
}

/** 슬래시·버튼·대시보드·AI 도구가 모두 쓰는 음악 제어 인가 정책의 단일 구현이에요. */
export function createMusicAccess(deps: MusicAccessDeps): MusicAccess {
	return {
		async authorize(actor, options = {}) {
			const botVoiceChannelId = deps.getBotVoiceChannelId(actor.guildId);
			const djRoleId = await deps.getDjRoleId(actor.guildId);
			if (!isInBotVoice(actor, botVoiceChannelId, djRoleId)) {
				const message = actor.voiceChannelId === null ? MUSIC_ACCESS_MESSAGES.voiceRequired() : MUSIC_ACCESS_MESSAGES.sameVoiceRequired();
				throw new AppError('forbidden', message, { ephemeral: true });
			}
			if (options.dj === false) return;
			if (!isDjOrAlone(actor, djRoleId)) {
				throw new AppError('forbidden', MUSIC_ACCESS_MESSAGES.djOnly(), { ephemeral: true });
			}
		}
	};
}
