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

interface NowPlayingCardAttachment {
	/** attachment:// 파일명 — MediaGallery에서 참조해요 */
	url: string;
	filename: string;
	file: AttachmentBuilder;
	/** 이번에 새로 렌더됨 — 메시지에 files로 첨부해야 해요 */
	fresh: boolean;
}

/** 길드별 1개 (현재 트랙 카드만 있으면 돼요) */
const cardCache = new Map<string, { trackKey: string; buffer: Buffer; filename: string }>();

function trackKeyOf(player: CustomPlayer): string | null {
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

export async function resolveNowPlayingCard(player: CustomPlayer): Promise<NowPlayingCardAttachment | null> {
	const current = player.queue.current;
	const trackKey = trackKeyOf(player);
	if (!current || !trackKey) return null;

	const cached = cardCache.get(player.guildId);
	const filename = safeFilename(trackKey);
	if (cached && cached.trackKey === trackKey) {
		return {
			url: `attachment://${filename}`,
			filename,
			file: new AttachmentBuilder(cached.buffer, { name: filename }),
			fresh: false
		};
	}

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

	cardCache.set(player.guildId, { trackKey, buffer, filename });
	return { url: `attachment://${filename}`, filename, file: new AttachmentBuilder(buffer, { name: filename }), fresh: true };
}

/** 플레이어 종료 시 캐시 정리 */
export function clearNowPlayingCard(guildId: string): void {
	cardCache.delete(guildId);
}
