import type { GuildMember } from 'discord.js';
import type { Player, Track } from 'lavalink-client';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import type { Actor } from './actor.ts';

/** 세 가지 음악 헬퍼의 최소 트랙 모양 — isSameTrack이 받는 구조와 같아요. */
export interface MusicTrackLike {
	encoded?: unknown;
	info?: { identifier?: unknown };
}

/**
 * AI 도구가 음악 기능에서 쓰는 좁은 포트 (framework-free 타입 계약).
 * 구현은 features/music/discord/musicToolPort.ts의 createMusicToolPort(deps)가 한 번 만들고, BotApplication이 createAiTools에 넘겨요.
 * AI 도구는 features/music의 헬퍼를 개별로 import하지 않고 이 포트만 써요.
 */
export interface MusicToolPort {
	/** 서버 멤버에서 음악 제어 주체(Actor)를 만들어요. */
	actorFromMember(member: GuildMember): Actor;
	/** DJ 역할 보유·관리 권한·단독 여부 검사 (슬래시 DJOrAlone precondition과 같은 판정). */
	checkDJOrAlone(guildId: string, member: GuildMember): Promise<boolean>;
	/** 멤버가 서버 관리(ManageGuild) 권한을 가졌는지. */
	checkManageGuild(member: GuildMember): boolean;
	/** 플레이어의 현재 곡 (대기 중이면 null). */
	nowPlayingTrack(player: CustomPlayer): Track | null;
	/** 같은 곡인지 (encoded 또는 영상 식별자 기준). */
	isSameTrack(a: MusicTrackLike | null | undefined, b: MusicTrackLike | null | undefined): boolean;
	/** 사용자가 직접 넣은 대기열 곡 (자동 추천곡 제외). */
	getUserQueuedTracks(player: Player): Track[];
	/** 대기열의 자동 추천곡을 걷어내요. 제거한 개수를 돌려줘요. */
	removeStaleRelatedTracks(player: Player): Promise<number>;
	/** 빈 대기열에 추천곡을 미리 넣어요 (자동재생 선예열). 넣은 곡 또는 null. */
	queueRelatedUpfront(player: CustomPlayer, track: Track): Promise<Track | null>;
	/** "90", "1:30", "1:02:03" → 밀리초. 형식이 잘못됐으면 null. */
	parseTimeToMs(input: string): number | null;
	/** 필터 프리셋 이름 목록 (reset 제외). */
	readonly filterPresetNames: readonly string[];
	/** 등록된 필터 프리셋 이름인지 (reset 제외). */
	isFilterPreset(value: string): boolean;
	/** 프리셋 1종을 플레이어에 적용해요. */
	applyFilterPreset(player: CustomPlayer, preset: string): Promise<void>;
	/** 상호 배제되는 필터를 정리해요. */
	dropLoserFilters(filters: string[]): string[];
	/** 모든 필터를 초기화해요. */
	resetAllFilters(player: CustomPlayer): Promise<void>;
}
