/**
 * NowPlaying 카드 이미지 — 트랙당 1회 렌더 + 길드별 메모리 캐시.
 * data-api `POST /v1/image/nowplaying`으로 PNG를 받아와요. position은 렌더 시점에 박히고
 * 캐시 키(trackId)에서는 제외해요. 렌더 실패 시 null → 호출자가 기존 썸네일로 폴백해요.
 */
import { container } from '@sapphire/framework';
import { AttachmentBuilder } from 'discord.js';
import { renderNowPlayingCard } from '../../../../services/dataApiClient.ts';
import { getUserQueuedTracks } from '../autoPlayRelated.ts';
import type { CustomPlayer } from './customPlayer.ts';
import type { Track } from 'lavalink-client';

interface NowPlayingCardAttachment {
	/** attachment:// 파일명 — MediaGallery에서 참조해요 */
	url: string;
	filename: string;
	file: AttachmentBuilder;
	/** 이번에 새로 렌더됨 — 메시지에 files로 첨부해야 해요 */
	fresh: boolean;
}

/** 길드별 1개 (현재 트랙 카드만 있으면 돼요) */
type CachedCard = { trackKey: string; buffer: Buffer; filename: string };
type PendingCard = { player: CustomPlayer; trackKey: string; promise: Promise<CachedCard | null> };

export interface NowPlayingCardStore {
	cache: Map<string, CachedCard>;
	pending: Map<string, PendingCard>;
	retryAfter: Map<string, { player: CustomPlayer; trackKey: string; until: number }>;
}

function getStore(): NowPlayingCardStore {
	// tsup이 여러 entry에 이 모듈을 복제해도 버튼과 알림이 같은 상태를 사용한다.
	const store = (container.nowPlayingCardStore ??= { cache: new Map(), pending: new Map(), retryAfter: new Map() });
	store.retryAfter ??= new Map();
	return store;
}

export function getNowPlayingCardKey(player: CustomPlayer): string | null {
	const current = player.queue.current;
	if (!current) return null;
	return current.info.identifier || `${current.info.title}::${current.info.author}`;
}

function safeFilename(trackKey: string): string {
	let h = 2166136261;
	for (let i = 0; i < trackKey.length; i++) h = Math.imul(h ^ trackKey.charCodeAt(i), 16777619);
	return `nowplaying-${(h >>> 0).toString(36)}.png`;
}

/** 신청자 표시 이름 — 실패하면 null (카드에서 신청자 줄 생략) */
async function resolveRequesterName(player: CustomPlayer): Promise<string | null> {
	try {
		const requester = player.queue.current?.requester;
		const id = requester && typeof requester === 'object' ? (requester as Record<string, unknown>).id : undefined;
		if (typeof id !== 'string' || !id || id === 'related_track') return null;
		const guild = container.client.guilds.cache.get(player.guildId);
		const member = await guild?.members.fetch(id).catch(() => null);
		return member?.displayName ?? null;
	} catch {
		return null;
	}
}

async function renderCard(player: CustomPlayer, current: Track, trackKey: string): Promise<CachedCard | null> {
	const buffer = await renderNowPlayingCard({
		trackId: trackKey,
		title: current.info.title,
		artist: current.info.author,
		artworkUrl: current.info.artworkUrl ?? null,
		positionMs: Math.max(0, player.position ?? 0),
		durationMs: current.info.duration ?? 0,
		isStream: current.info.isStream ?? false,
		queueCount: getUserQueuedTracks(player).length,
		requesterName: await resolveRequesterName(player)
	}).catch(() => null);
	if (!buffer) return null;

	return { trackKey, buffer, filename: safeFilename(trackKey) };
}

function attachment(card: CachedCard, fresh: boolean): NowPlayingCardAttachment {
	return {
		url: `attachment://${card.filename}`,
		filename: card.filename,
		file: new AttachmentBuilder(card.buffer, { name: card.filename }),
		fresh
	};
}

export async function resolveNowPlayingCard(player: CustomPlayer): Promise<NowPlayingCardAttachment | null> {
	const current = player.queue.current;
	const trackKey = getNowPlayingCardKey(player);
	if (!current || !trackKey) return null;
	const { cache: cardCache, pending: pendingCards, retryAfter } = getStore();

	const cached = cardCache.get(player.guildId);
	if (cached && cached.trackKey === trackKey) return attachment(cached, false);
	const failed = retryAfter.get(player.guildId);
	if (failed?.player === player && failed.trackKey === trackKey && failed.until > Date.now()) return null;

	let pending = pendingCards.get(player.guildId);
	if (!pending || pending.player !== player || pending.trackKey !== trackKey) {
		const request: PendingCard = {
			player,
			trackKey,
			promise: renderCard(player, current, trackKey)
				.then((card) => {
					// 다른 곡/플레이어로 바뀌거나 destroy된 뒤 도착한 렌더 결과는 버린다.
					if (pendingCards.get(player.guildId) !== request || getNowPlayingCardKey(player) !== trackKey) return null;
					if (!card) {
						// 이미지 서버 장애 때 모든 playerUpdate가 같은 실패를 재요청하지 않게 한다.
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
	// 같은 요청을 기다린 호출자들도 자기 메시지에 첨부할 파일이 필요하다.
	return attachment(card, true);
}

/** 초기 화면/버튼은 이미 준비된 카드만 사용하고 렌더 요청을 기다리지 않는다. */
export function getCachedNowPlayingCard(player: CustomPlayer): NowPlayingCardAttachment | null {
	const card = container.nowPlayingCardStore?.cache.get(player.guildId);
	return card && card.trackKey === getNowPlayingCardKey(player) ? attachment(card, false) : null;
}

/** 플레이어 종료 시 캐시 정리 */
export function clearNowPlayingCard(guildId: string): void {
	container.nowPlayingCardStore?.cache.delete(guildId);
	container.nowPlayingCardStore?.pending.delete(guildId);
	container.nowPlayingCardStore?.retryAfter?.delete(guildId);
}
