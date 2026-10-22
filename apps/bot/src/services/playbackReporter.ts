import { container } from '@sapphire/framework';
import type { Track, UnresolvedTrack } from 'lavalink-client';
import { dataApiAuthHeaders, gatewayBaseUrl } from '../lib/dataApi.ts';

export type PlaybackReportType = 'track_start' | 'track_end' | 'track_stuck' | 'track_error' | 'queue_end' | 'playback_abort';
/** 음성 서버(라바링크) 노드 단위 이벤트. 길드가 아니라 노드로 식별해요. */
export type NodeReportType = 'node_disconnect' | 'node_error';

const REPORT_TIMEOUT_MS = 5_000;

/**
 * data-api로 재생 이벤트 본문을 보내요. fire-and-forget: 실패해도 재생 경로에 영향 없어요.
 * DATA_API_URL 미설정 시 아무 일도 안 해요.
 */
function postPlaybackEvent(body: Record<string, unknown>): void {
	const base = gatewayBaseUrl();
	if (!base) return;
	void fetch(`${base}/v1/playback/events`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...dataApiAuthHeaders() },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(REPORT_TIMEOUT_MS)
	}).catch((error) => {
		container.logger.debug(`[playback-report] failed: ${error instanceof Error ? error.message : String(error)}`);
	});
}

export function reportPlaybackEvent(
	guildId: string,
	type: PlaybackReportType,
	track: Track | UnresolvedTrack | null,
	extra?: { reason?: string; consecutiveErrors?: number }
): void {
	postPlaybackEvent({
		type,
		guildId,
		nodeId: null,
		shardId: container.client.guilds.cache.get(guildId)?.shardId ?? null,
		trackTitle: track?.info.title ?? null,
		trackAuthor: track?.info.author ?? null,
		trackId: track?.info.identifier ?? null,
		reason: extra?.reason ?? null,
		consecutiveErrors: extra?.consecutiveErrors ?? 0
	});
}

/**
 * 라바링크 노드 장애(연결 끊김/노드 오류) 보고. 상태 페이지의 '최근 재생 오류'에 같이 떠요.
 * 봇 워커마다 같은 노드에 붙어 있어 장애 시 여러 번 보고되고, data-api가 한 항목으로 병합해요.
 */
export function reportNodeEvent(nodeId: string, type: NodeReportType, reason: string | null): void {
	postPlaybackEvent({
		type,
		guildId: null,
		nodeId,
		shardId: null,
		trackTitle: null,
		trackAuthor: null,
		trackId: null,
		reason,
		consecutiveErrors: 0
	});
}
