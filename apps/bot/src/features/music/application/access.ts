import { emoji } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import type { Actor } from './actor.ts';

export const MUSIC_ACCESS_MESSAGES = {
	voiceRequired: () => `${emoji('music_note')} 이 명령어는 음성 채널에 접속한 사용자만 사용 가능해요.`,
	sameVoiceRequired: () => `${emoji('link')} 이 명령어를 사용하려면 봇과 같은 음성 채널에 연결해야 해요.`,
	djOnly: () => `${emoji('volume_muted')} 이 명령어는 DJ 역할을 가지고 있거나, 채널에 혼자 있을 때만 사용 가능해요.`,
	noSong: () => `${emoji('music_note')} 현재 곡이 없어요. 먼저 /재생으로 곡을 추가해 주세요.`
} as const;

export interface MusicAccessDeps {
	getBotVoiceChannelId(guildId: string): string | null;
	getDjRoleId(guildId: string): Promise<string | null>;
}

export interface MusicAccess {
	authorize(actor: Actor, options?: { dj?: boolean }): Promise<void>;
}

export function hasRemoteControl(actor: Pick<Actor, 'isAdministrator' | 'canManageGuild' | 'roleIds'>, djRoleId: string | null): boolean {
	if (actor.isAdministrator || actor.canManageGuild) return true;
	return djRoleId !== null && actor.roleIds.has(djRoleId);
}

export function isDjOrAlone(actor: Actor, djRoleId: string | null): boolean {
	if (!djRoleId) return true;
	if (hasRemoteControl(actor, djRoleId)) return true;
	return actor.voiceChannelId !== null && actor.humansInVoiceChannel === 1;
}

function sharesBotVoice(actor: Pick<Actor, 'voiceChannelId'>, botVoiceChannelId: string | null): boolean {
	return actor.voiceChannelId !== null && (botVoiceChannelId === null || actor.voiceChannelId === botVoiceChannelId);
}

export function isInBotVoice(
	actor: Pick<Actor, 'isAdministrator' | 'canManageGuild' | 'roleIds' | 'voiceChannelId'>,
	botVoiceChannelId: string | null,
	djRoleId: string | null
): boolean {
	return hasRemoteControl(actor, djRoleId) || sharesBotVoice(actor, botVoiceChannelId);
}

export function canControlMusic(actor: Actor, botVoiceChannelId: string | null, djRoleId: string | null): boolean {
	return isInBotVoice(actor, botVoiceChannelId, djRoleId) && isDjOrAlone(actor, djRoleId);
}

export function canAddTracks(actor: Actor, botVoiceChannelId: string | null, djRoleId: string | null): boolean {
	if (sharesBotVoice(actor, botVoiceChannelId)) return true;
	return botVoiceChannelId !== null && hasRemoteControl(actor, djRoleId);
}

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
