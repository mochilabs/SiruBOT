import type { Player, SearchPlatform, SearchResult, Track, UnresolvedTrack } from 'lavalink-client';
import { emoji } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import { canAddTracks, MUSIC_ACCESS_MESSAGES, type MusicAccessDeps } from './access.ts';
import type { Actor } from './actor.ts';

/**
 * 곡 검색·대기열 추가 유스케이스 — 슬래시 `/재생`·`/검색`, 고정 채널 입력, AI `music_play`, 웹 플레이어가 함께 써요.
 * 어느 음성 채널에 곡을 넣을지(`canAddTracks` 정책)와 검색 → 접속 → 대기열 → 재생 보장 순서를 여기서만 정해요.
 * 인터랙션 응답·선택 메뉴·안내 문구 배치는 진입점이 맡고, 유스케이스는 평범한 결과 객체만 돌려줘요.
 * 모든 의존성은 `createMusicPlay(deps)`로 명시적으로 받아요 (전역 container 접근 없음).
 */

/** 검색 소스 — lavalink-client의 SearchPlatform 그대로 써요 (ytsearch·scsearch·spsearch 등). */
export type MusicSearchPlatform = SearchPlatform;

export interface MusicRequester {
	id: string;
	username: string;
}

/** 곡이 갖춰야 할 최소 면 — 같은 곡인지 식별자로 비교해요. */
export interface PlayTrackLike {
	readonly info: { readonly identifier?: string | undefined };
}

/** 플레이리스트 결과에서 유스케이스가 보는 면 — URL로 고른 곡(선택 곡)만 필요해요. */
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
	/** 봇의 음성 채널과 DJ 역할 조회 — 음악 제어 인가와 같은 원천이에요. */
	access: MusicAccessDeps;
	/** 대상 음성 채널의 플레이어를 가져오거나 만들어요. `pinText`면 기존 플레이어의 텍스트 채널도 `textChannelId`로 맞춰요. */
	getOrCreatePlayer(guildId: string, voiceChannelId: string, textChannelId: string | null, options: { pinText: boolean }): Promise<P>;
	/** 플레이어로 검색해요. 검색 오류는 AppError로 던져요. */
	search(player: P, query: string, platform: MusicSearchPlatform, requester: MusicRequester): Promise<PlaySearchOutcome<T, L>>;
	/** 플레이어 없이 연결된 노드에서 검색해요 (웹 미리보기). */
	searchWithoutPlayer(query: string, platform: MusicSearchPlatform, requester: MusicRequester): Promise<PlaySearchOutcome<T, L>>;
	/** 음성 채널에 접속해요. 권한이 없거나 접속에 실패하면 AppError로 던져요. */
	connect(player: P): Promise<void>;
	/** 곡을 대기열에 넣어요. wasIdle은 넣기 전에 아무것도 재생 중이 아니었는지예요. */
	enqueue(player: P, tracks: T | T[]): Promise<{ wasIdle: boolean }>;
	/** 멈춰 있으면 대기열 재생을 시작해요. */
	ensurePlayback(player: P): Promise<void>;
}

/**
 * 검색 결과 중 어떤 곡을 넣을지.
 * - `first`: 결과의 첫 곡 하나만 넣어요 (플레이리스트도 첫 곡만).
 * - `selected`: 플레이리스트의 선택 곡(URL로 고른 곡)이 있으면 그 곡 하나만 넣고 나머지는 `remaining`으로 돌려줘요. 선택 곡이 없으면 전체를 넣어요.
 * - `all`: 플레이리스트는 앞에서부터 `limit`곡(없으면 전부)을 넣어요. 단일 곡이면 그 곡 하나만 넣어요.
 */
export type MusicQueueScope = { readonly kind: 'first' } | { readonly kind: 'selected' } | { readonly kind: 'all'; readonly limit?: number };

export interface MusicSearchInput {
	query: string;
	platform: MusicSearchPlatform;
	requester: MusicRequester;
	/** 컨트롤러·피드백을 보낼 텍스트 채널 */
	textChannelId: string | null;
	/** true면 기존 플레이어의 텍스트 채널도 `textChannelId`로 옮겨요 (고정 채널 입력·웹). */
	pinTextChannel?: boolean;
}

export interface MusicSearchResult<P, T, L> extends PlaySearchOutcome<T, L> {
	player: P;
	/** 곡을 넣는 음성 채널 — 봇이 이미 있으면 그 채널, 없으면 요청자의 채널이에요. */
	voiceChannelId: string;
}

export interface MusicPlayResult<P, T, L> extends MusicSearchResult<P, T, L> {
	/** 이번에 대기열에 넣은 곡 */
	queued: T[];
	/** 플레이리스트에서 넣지 않은 나머지 곡 (`selected` 범위에서 선택 곡만 넣었을 때) */
	remaining: T[];
	/** 넣기 전에 아무것도 재생 중이 아니었는지 — 시작/대기열 문구를 고를 때 써요. */
	wasIdle: boolean;
}

export interface MusicPlay<P, T extends PlayTrackLike, L extends PlayPlaylistLike<T>> {
	/** 인가 → 대상 음성 채널 결정 → 플레이어 준비 → 검색 → 접속. 곡은 넣지 않아요 (결과를 골라야 하는 검색·선택 흐름용). */
	search(actor: Actor, input: MusicSearchInput): Promise<MusicSearchResult<P, T, L>>;
	/** 플레이어를 만들지 않고 검색만 해요 (웹 미리보기). 인가는 search와 같아요. */
	preview(actor: Actor, input: Pick<MusicSearchInput, 'query' | 'platform' | 'requester'>): Promise<PlaySearchOutcome<T, L>>;
	/** search → 범위에 맞는 곡 고르기 → 대기열 추가 → 재생 보장을 한 번에 해요. */
	play(actor: Actor, input: MusicSearchInput, scope: MusicQueueScope): Promise<MusicPlayResult<P, T, L>>;
	/** 이미 고른 곡(들)을 대기열에 넣어요. 인가는 search에서 끝났고 재생은 시작하지 않아요. */
	enqueue(player: P, tracks: T | T[]): Promise<{ wasIdle: boolean }>;
	/** 대기열 재생을 보장해요 (멈춰 있으면 시작해요). */
	startPlayback(player: P): Promise<void>;
}

/** 실제 구현(lavalink 플레이어와 트랙)으로 굳힌 의존성 타입 — 조립 지점(botApplication)이 이 타입으로 deps를 만들어요. */
export type MusicPlayServiceDeps = MusicPlayDeps<Player, Track | UnresolvedTrack, NonNullable<SearchResult['playlist']>>;
/** 실제 구현으로 굳힌 유스케이스 타입 — container.musicPlay가 이 타입이에요. */
export type MusicPlayService = MusicPlay<Player, Track | UnresolvedTrack, NonNullable<SearchResult['playlist']>>;

export function createMusicPlay<P, T extends PlayTrackLike, L extends PlayPlaylistLike<T>>(deps: MusicPlayDeps<P, T, L>): MusicPlay<P, T, L> {
	/**
	 * 곡을 넣을 음성 채널을 정해요. 봇이 있으면 봇의 채널(요청자가 같은 채널이거나 원격 권한자일 때만),
	 * 봇이 없으면 요청자의 채널이에요. 원격 권한자라도 봇이 없으면 들어갈 채널이 없으니 거절해요.
	 */
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
		if (outcome.tracks.length === 0) throw new AppError('not_found', MUSIC_SEARCH_MESSAGES.empty());
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
