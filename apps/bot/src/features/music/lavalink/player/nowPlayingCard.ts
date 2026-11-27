import { AttachmentBuilder } from 'discord.js';
import { BOT_NAME, emoji, isDev, versionInfo } from '@sirubot/utils';
import { getUserQueuedTracks, remainingUntilQueueEnd } from '../autoPlayRelated.ts';
import { RELATED_TRACK_REQUESTER_ID, requesterIdOf } from '../requester.ts';
import { currentChapterIndex, currentChapter } from './chapters.ts';
import { nowPlayingTrack } from './nowPlaying.ts';
import type { CustomPlayer } from './customPlayer.ts';
import type { LavalinkDeps } from '../deps.ts';
import type { Track } from 'lavalink-client';

export interface NowPlayingCardAttachment {
	url: string;
	filename: string;
	file: AttachmentBuilder;
	fresh: boolean;
	trackKey: string;
}

type CachedCard = { trackKey: string; buffer: Buffer; filename: string };
type PendingCard = { player: CustomPlayer; trackKey: string; promise: Promise<CachedCard | null> };

export interface NowPlayingCardStore {
	cache: Map<string, CachedCard>;
	pending: Map<string, PendingCard>;
	retryAfter: Map<string, { player: CustomPlayer; trackKey: string; until: number }>;
}

function getStore(deps: LavalinkDeps): NowPlayingCardStore {
	return deps.nowPlayingCards;
}

export function getNowPlayingCardKey(player: CustomPlayer): string | null {
	const current = nowPlayingTrack(player);
	if (!current) return null;
	const identity = current.info.identifier || `${current.info.title}::${current.info.author}`;
	const chapterIndex = currentChapterIndex(player);
	return `${identity}::v${player.volume ?? 0}::c${chapterIndex ?? 'none'}::r${player.repeatMode ?? 'off'}${player.paused ? ':paused' : ''}`;
}

export function sameNowPlayingTrackIdentity(a: string, b: string): boolean {
	return a.split('::v')[0] === b.split('::v')[0];
}

function requesterInfo(deps: LavalinkDeps, player: CustomPlayer): { name: string; truncatedName: string; avatarUrl: string | null } | null {
	const id = requesterIdOf(nowPlayingTrack(player) ?? undefined);
	if (!id) return null;
	const member = deps.client.guilds.cache.get(player.guildId)?.members.cache.get(id);
	if (!member) return null;
	const name = member.displayName;
	const truncatedName = name.length > 12 ? `${name.slice(0, 12)}…` : name;
	return { name, truncatedName, avatarUrl: member.displayAvatarURL({ size: 128, extension: 'png' }) };
}

function safeFilename(trackKey: string): string {
	// Keep filename stable per track so Discord replaces the attachment in-place across state updates.
	let h = 2166136261;
	const identity = trackKey.split('::v')[0];
	for (let i = 0; i < identity.length; i++) h = Math.imul(h ^ identity.charCodeAt(i), 16777619);
	return `nowplaying-${(h >>> 0).toString(36)}.png`;
}

function brandLine(player: CustomPlayer): string {
	const volume = player.volume ?? 0;
	return `${emoji('radio_wave')} ${player.node?.id ?? 'BETA-1'} ${emoji(volume === 0 ? 'volume_muted' : volume < 50 ? 'volume_down' : 'volume_up')} ${volume}% ${emoji('info')} ${BOT_NAME} ${isDev ? `${versionInfo.getGitBranch()}/${versionInfo.getGitHash()}` : `${versionInfo.getVersion()} (${versionInfo.getGitHash()})`}`;
}

async function renderCard(deps: LavalinkDeps, player: CustomPlayer, current: Track, trackKey: string): Promise<CachedCard | null> {
	const queuedTracks = getUserQueuedTracks(player);
	const requesterId = requesterIdOf(current ?? undefined);
	const buffer = await deps.dataApi
		.renderNowPlayingCard({
			trackId: current.info.identifier || current.info.title,
			title: current.info.title,
			artist: current.info.author,
			artworkUrl: current.info.artworkUrl ?? null,
			positionMs: Math.min(player.position ?? 0, current.info.duration || 0),
			durationMs: current.info.duration ?? 0,
			isStream: current.info.isStream ?? false,
			isPaused: player.paused ?? false,
			repeatMode: player.repeatMode ?? 'off',
			isRecommended: requesterId === RELATED_TRACK_REQUESTER_ID,
			nextTracks: queuedTracks.slice(0, 3).map((track) => ({ title: track.info.title, artist: track.info.author || null })),
			queueCount: queuedTracks.length,
			queueRemainingMs: remainingUntilQueueEnd(player, queuedTracks),
			volume: player.volume ?? null,
			nodeId: player.node?.id ?? null,
			brandLine: brandLine(player),
			chapter: (() => {
				const chapter = currentChapter(player);
				return chapter ? { name: chapter.name, startMs: chapter.start, endMs: chapter.end } : null;
			})(),
			requester: (() => {
				const info = requesterInfo(deps, player);
				return info ? { name: info.truncatedName, avatarUrl: info.avatarUrl } : null;
			})(),
			trackUrl: current.info.uri ?? null
		})
		.catch(() => null);
	if (!buffer) return null;

	return { trackKey, buffer, filename: safeFilename(trackKey) };
}

function attachment(card: CachedCard, fresh: boolean): NowPlayingCardAttachment {
	return {
		url: `attachment://${card.filename}`,
		filename: card.filename,
		file: new AttachmentBuilder(card.buffer, { name: card.filename }),
		fresh,
		trackKey: card.trackKey
	};
}

export async function resolveNowPlayingCard(deps: LavalinkDeps, player: CustomPlayer): Promise<NowPlayingCardAttachment | null> {
	const current = nowPlayingTrack(player);
	const trackKey = getNowPlayingCardKey(player);
	if (!current || !trackKey) return null;
	const { cache: cardCache, pending: pendingCards, retryAfter } = getStore(deps);

	const cached = cardCache.get(player.guildId);
	if (cached && cached.trackKey === trackKey) return attachment(cached, false);
	const failed = retryAfter.get(player.guildId);
	if (failed?.player === player && failed.trackKey === trackKey && failed.until > Date.now()) return null;

	let pending = pendingCards.get(player.guildId);
	if (!pending || pending.player !== player || pending.trackKey !== trackKey) {
		const request: PendingCard = {
			player,
			trackKey,
			promise: renderCard(deps, player, current, trackKey)
				.then((card) => {
					if (pendingCards.get(player.guildId) !== request || getNowPlayingCardKey(player) !== trackKey) return null;
					if (!card) {
						retryAfter.set(player.guildId, { player, trackKey, until: Date.now() + 5000 });
						return null;
					}
					retryAfter.delete(player.guildId);
					cardCache.set(player.guildId, card);
					return card;
				})
				.finally(() => {
					if (pendingCards.get(player.guildId) === request) pendingCards.delete(player.guildId);
				})
		};
		pendingCards.set(player.guildId, request);
		pending = request;
	}

	const card = await pending.promise;
	if (!card || getNowPlayingCardKey(player) !== trackKey || cardCache.get(player.guildId) !== card) return null;
	return attachment(card, true);
}

export function getCachedNowPlayingCard(deps: LavalinkDeps, player: CustomPlayer): NowPlayingCardAttachment | null {
	const card = getStore(deps).cache.get(player.guildId);
	return card && card.trackKey === getNowPlayingCardKey(player) ? attachment(card, false) : null;
}

export function getDisplayNowPlayingCard(deps: LavalinkDeps, player: CustomPlayer): NowPlayingCardAttachment | null {
	const currentKey = getNowPlayingCardKey(player);
	const card = getStore(deps).cache.get(player.guildId);
	if (!card || !currentKey) return null;
	if (card.trackKey === currentKey) return attachment(card, false);
	return sameNowPlayingTrackIdentity(card.trackKey, currentKey) ? attachment(card, false) : null;
}

export function clearNowPlayingCard(deps: LavalinkDeps, guildId: string): void {
	const store = getStore(deps);
	store.cache.delete(guildId);
	store.pending.delete(guildId);
	store.retryAfter.delete(guildId);
}
