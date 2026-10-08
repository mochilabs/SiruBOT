/**
 * NowPlaying 카드 이미지 — 트랙당 1회 렌더 + 길드별 메모리 캐시.
 * data-api `POST /v1/image/nowplaying`으로 PNG를 받아와요. 카드에는 진행바 없음 —
 * 동적으로 바뀌는 진행율은 컨트롤러 텍스트 라인(이모지 프로그레스바)이 edit로 계속 갱신해요.
 * 카드 갱신 트리거는 트랙 변경(캐시 키)뿐 — 렌더 실패 시 null → 호출자가 텍스트로 폴백해요.
 */
import { container } from '@sapphire/framework';
import { AttachmentBuilder } from 'discord.js';
import { BOT_NAME, isDev, versionInfo } from '@sirubot/utils';
import { renderNowPlayingCard } from '../../../../services/dataApiClient.ts';
import { getUserQueuedTracks, remainingUntilQueueEnd } from '../autoPlayRelated.ts';
import { requesterIdOf } from '../requester.ts';
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
	// 카드 갱신 트리거는 트랙 변경 + 볼륨 변경 + 현재 챕터 변경 — position(진행율)은 카드에 박지 않아 제외한다.
	const identity = current.info.identifier || `${current.info.title}::${current.info.author}`;
	const chapterIndex = currentChapterIndex(player);
	return `${identity}::v${player.volume ?? 0}::c${chapterIndex ?? 'none'}`;
}

/** 현재 위치 기준 재생 중인 챕터 인덱스 — 챕터가 없으면 null */
export function currentChapterIndex(player: CustomPlayer): number | null {
	const chapters = player.chapters;
	if (!Array.isArray(chapters) || chapters.length === 0) return null;
	if (typeof player.position !== 'number') return null;
	const position = player.position;
	const index = chapters.findIndex((chapter) => position >= chapter.start && position < chapter.end);
	return index >= 0 ? index : null;
}

/** 현재 재생 중인 챕터 정보 — 카드에 박을 값 */
function currentChapter(player: CustomPlayer): { name: string; startMs: number; endMs: number } | null {
	const index = currentChapterIndex(player);
	if (index === null) return null;
	const chapter = player.chapters[index]!;
	return { name: chapter.name, startMs: chapter.start, endMs: chapter.end };
}

/** 신청자 — 카드에 박을 이름+아바타. 멤버 캐시에 없으면 null (텍스트 라인 멘션이 폴백) */
function requesterInfo(player: CustomPlayer): { name: string; avatarUrl: string | null } | null {
	const id = requesterIdOf(player.queue.current ?? undefined);
	if (!id) return null;
	const member = container.client.guilds.cache.get(player.guildId)?.members.cache.get(id);
	if (!member) return null;
	return { name: member.displayName, avatarUrl: member.displayAvatarURL({ size: 128 }) };
}

function safeFilename(trackKey: string): string {
	let h = 2166136261;
	for (let i = 0; i < trackKey.length; i++) h = Math.imul(h ^ trackKey.charCodeAt(i), 16777619);
	return `nowplaying-${(h >>> 0).toString(36)}.png`;
}

/** 카드 하단 메타에 박을 브랜드 줄 — 봇 이름 + 버전/해시 */
function brandLine(): string {
	return `${BOT_NAME} ${isDev ? `${versionInfo.getGitBranch()}/${versionInfo.getGitHash()}` : `${versionInfo.getVersion()} (${versionInfo.getGitHash()})`}`;
}

async function renderCard(player: CustomPlayer, current: Track, trackKey: string): Promise<CachedCard | null> {
	const queuedTracks = getUserQueuedTracks(player);
	const buffer = await renderNowPlayingCard({
		trackId: current.info.identifier || current.info.title,
		title: current.info.title,
		artist: current.info.author,
		artworkUrl: current.info.artworkUrl ?? null,
		positionMs: 0,
		durationMs: current.info.duration ?? 0,
		isStream: current.info.isStream ?? false,
		queueCount: queuedTracks.length,
		queueRemainingMs: remainingUntilQueueEnd(player, queuedTracks),
		volume: player.volume ?? null,
		nodeId: player.node?.id ?? null,
		brandLine: brandLine(),
		chapter: currentChapter(player),
		requester: requesterInfo(player),
		trackUrl: current.info.uri ?? null
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
