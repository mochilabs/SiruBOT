import type { GuildMember } from 'discord.js';
import type { Player, Track } from 'lavalink-client';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import type { Actor, ActorMemberSource } from './actor.ts';

export interface MusicTrackLike {
	encoded?: unknown;
	info?: { identifier?: unknown };
}

export interface MusicToolPort {
	actorFromMember(member: ActorMemberSource): Actor;
	checkDJOrAlone(guildId: string, member: GuildMember): Promise<boolean>;
	checkManageGuild(member: GuildMember): boolean;
	nowPlayingTrack(player: CustomPlayer): Track | null;
	isSameTrack(a: MusicTrackLike | null | undefined, b: MusicTrackLike | null | undefined): boolean;
	getUserQueuedTracks(player: Player): Track[];
	removeStaleRelatedTracks(player: Player): Promise<number>;
	queueRelatedUpfront(player: CustomPlayer, track: Track): Promise<Track | null>;
	parseTimeToMs(input: string): number | null;
	readonly filterPresetNames: readonly string[];
	isFilterPreset(value: string): boolean;
	applyFilterPreset(player: CustomPlayer, preset: string): Promise<void>;
	dropLoserFilters(filters: string[]): string[];
	resetAllFilters(player: CustomPlayer): Promise<void>;
}
