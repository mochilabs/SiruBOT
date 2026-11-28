import type { Player, SearchPlatform, SearchResult, Track, UnresolvedTrack } from 'lavalink-client';
import { emoji, PLAYER_WEB_CODE_SEARCH_EMPTY } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import { canAddTracks, MUSIC_ACCESS_MESSAGES, type MusicAccessDeps } from './access.ts';
import type { Actor } from './actor.ts';

export type MusicSearchPlatform = SearchPlatform;

export interface MusicRequester {
	id: string;
	username: string;
}

export interface PlayTrackLike {
	readonly info: { readonly identifier?: string | undefined };
}

export interface PlayPlaylistLike<T> {
	readonly selectedTrack: T | null;
}

export interface PlaySearchOutcome<T, L> {
	readonly loadType: 'track' | 'search' | 'playlist';
	readonly tracks: T[];
	readonly playlist: L | null;
}

export const MUSIC_SEARCH_MESSAGES = {
	empty: () => `${emoji('mag')} 검색 결과가 없어요. 다른 검색어로 다시 시도해 주세요.`,
	error: () => `${emoji('error')} 음악 검색 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.`,
	noNode: () => `${emoji('error')} 현재 사용 가능한 노드가 없어요. 잠시 후 다시 시도해 주세요.`
} as const;

export interface MusicPlayDeps<P, T extends PlayTrackLike, L extends PlayPlaylistLike<T>> {
	access: MusicAccessDeps;
	getOrCreatePlayer(guildId: string, voiceChannelId: string, textChannelId: string | null, options: { pinText: boolean }): Promise<P>;
	search(player: P, query: string, platform: MusicSearchPlatform, requester: MusicRequester): Promise<PlaySearchOutcome<T, L>>;
	searchWithoutPlayer(query: string, platform: MusicSearchPlatform, requester: MusicRequester): Promise<PlaySearchOutcome<T, L>>;
	connect(player: P): Promise<void>;
	enqueue(player: P, tracks: T | T[]): Promise<{ wasIdle: boolean }>;
	ensurePlayback(player: P): Promise<void>;
}

export type MusicQueueScope = { readonly kind: 'first' } | { readonly kind: 'selected' } | { readonly kind: 'all'; readonly limit?: number };

export interface MusicSearchInput {
	query: string;
	platform: MusicSearchPlatform;
	requester: MusicRequester;
	textChannelId: string | null;
	pinTextChannel?: boolean;
}

export interface MusicSearchResult<P, T, L> extends PlaySearchOutcome<T, L> {
	player: P;
	voiceChannelId: string;
}

export interface MusicPlayResult<P, T, L> extends MusicSearchResult<P, T, L> {
	queued: T[];
	remaining: T[];
	wasIdle: boolean;
}

export interface MusicPlay<P, T extends PlayTrackLike, L extends PlayPlaylistLike<T>> {
	search(actor: Actor, input: MusicSearchInput): Promise<MusicSearchResult<P, T, L>>;
	preview(actor: Actor, input: Pick<MusicSearchInput, 'query' | 'platform' | 'requester'>): Promise<PlaySearchOutcome<T, L>>;
	play(actor: Actor, input: MusicSearchInput, scope: MusicQueueScope): Promise<MusicPlayResult<P, T, L>>;
	enqueue(player: P, tracks: T | T[]): Promise<{ wasIdle: boolean }>;
	startPlayback(player: P): Promise<void>;
}

export type MusicPlayServiceDeps = MusicPlayDeps<Player, Track | UnresolvedTrack, NonNullable<SearchResult['playlist']>>;
export type MusicPlayService = MusicPlay<Player, Track | UnresolvedTrack, NonNullable<SearchResult['playlist']>>;

export function createMusicPlay<P, T extends PlayTrackLike, L extends PlayPlaylistLike<T>>(deps: MusicPlayDeps<P, T, L>): MusicPlay<P, T, L> {
	async function resolveVoiceChannel(actor: Actor): Promise<string> {
		const botVoiceChannelId = deps.access.getBotVoiceChannelId(actor.guildId);
		const djRoleId = await deps.access.getDjRoleId(actor.guildId);
		if (!canAddTracks(actor, botVoiceChannelId, djRoleId)) {
			const message = actor.voiceChannelId === null ? MUSIC_ACCESS_MESSAGES.voiceRequired() : MUSIC_ACCESS_MESSAGES.sameVoiceRequired();
			throw new AppError('forbidden', message, { ephemeral: true });
		}
		const voiceChannelId = botVoiceChannelId ?? actor.voiceChannelId;
		if (voiceChannelId === null) throw new AppError('forbidden', MUSIC_ACCESS_MESSAGES.voiceRequired(), { ephemeral: true });
		return voiceChannelId;
	}

	function requireResults<X extends PlaySearchOutcome<T, L>>(outcome: X): X {
		if (outcome.tracks.length === 0) throw new AppError('not_found', MUSIC_SEARCH_MESSAGES.empty(), { code: PLAYER_WEB_CODE_SEARCH_EMPTY });
		return outcome;
	}

	function selectTracks(outcome: PlaySearchOutcome<T, L>, scope: MusicQueueScope): { queued: T[]; remaining: T[] } {
		const { tracks, playlist } = outcome;
		if (!playlist || scope.kind === 'first') return { queued: tracks.slice(0, 1), remaining: [] };
		if (scope.kind === 'selected') {
			const selected = playlist.selectedTrack;
			if (!selected) return { queued: [...tracks], remaining: [] };
			return {
				queued: [selected],
				remaining: tracks.filter((track) => track.info.identifier !== selected.info.identifier)
			};
		}
		const limit = scope.limit ?? tracks.length;
		return { queued: tracks.slice(0, limit), remaining: tracks.slice(limit) };
	}

	async function search(actor: Actor, input: MusicSearchInput): Promise<MusicSearchResult<P, T, L>> {
		const voiceChannelId = await resolveVoiceChannel(actor);
		const player = await deps.getOrCreatePlayer(actor.guildId, voiceChannelId, input.textChannelId, {
			pinText: input.pinTextChannel === true
		});
		const outcome = requireResults(await deps.search(player, input.query, input.platform, input.requester));
		await deps.connect(player);
		return { ...outcome, player, voiceChannelId };
	}

	return {
		search,

		async preview(actor, input) {
			await resolveVoiceChannel(actor);
			return requireResults(await deps.searchWithoutPlayer(input.query, input.platform, input.requester));
		},

		async play(actor, input, scope) {
			const found = await search(actor, input);
			const { queued, remaining } = selectTracks(found, scope);
			const { wasIdle } = await deps.enqueue(found.player, queued);
			await deps.ensurePlayback(found.player);
			return { ...found, queued, remaining, wasIdle };
		},

		enqueue: (player, tracks) => deps.enqueue(player, tracks),

		startPlayback: (player) => deps.ensurePlayback(player)
	};
}
