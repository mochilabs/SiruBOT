import { container } from '@sapphire/framework';
import type { Track, UnresolvedTrack } from 'lavalink-client';

export type PlaybackReportType = 'track_start' | 'track_end' | 'track_stuck' | 'track_error' | 'queue_end' | 'playback_abort';

const REPORT_TIMEOUT_MS = 5_000;

function gatewayBaseUrl(): string | null {
	const raw = (process.env.DATA_API_URL ?? '').trim().replace(/\/+$/, '');
	return raw || null;
}

/**
 * 재생 이벤트를 data-api에 보고해요. fire-and-forget — 실패해도 재생 경로에 영향 없어요.
 * DATA_API_URL 미설정 시 아무 일도 안 해요.
 */
export function reportPlaybackEvent(
	guildId: string,
	type: PlaybackReportType,
	track: Track | UnresolvedTrack | null,
	extra?: { reason?: string; consecutiveErrors?: number }
): void {
	const base = gatewayBaseUrl();
	if (!base) return;
	const shardId = container.client.guilds.cache.get(guildId)?.shardId ?? null;
	const authKey = (process.env.DATA_API_AUTH_KEY ?? process.env.AUTH_KEY ?? '').trim();
	void fetch(`${base}/v1/playback/events`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(authKey ? { authorization: authKey } : {})
		},
		body: JSON.stringify({
			type,
			guildId,
			shardId,
			trackTitle: track?.info.title ?? null,
			trackAuthor: track?.info.author ?? null,
			trackId: track?.info.identifier ?? null,
			reason: extra?.reason ?? null,
			consecutiveErrors: extra?.consecutiveErrors ?? 0
		}),
		signal: AbortSignal.timeout(REPORT_TIMEOUT_MS)
	}).catch((error) => {
		container.logger.debug(`[playback-report] failed: ${error instanceof Error ? error.message : String(error)}`);
	});
}
