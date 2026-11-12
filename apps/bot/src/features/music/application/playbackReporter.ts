import type { Client } from 'discord.js';
import type { Track, UnresolvedTrack } from 'lavalink-client';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { Stoppable } from '../../../lib/lifecycle.ts';
import { dataApiAuthHeaders, gatewayBaseUrl } from '../../../lib/dataApi.ts';

type PlaybackReportType = 'track_start' | 'track_end' | 'track_stuck' | 'track_error' | 'queue_end' | 'playback_abort';
/** 음성 서버(라바링크) 노드 단위 이벤트. 길드가 아니라 노드로 식별해요. */
type NodeReportType = 'node_disconnect' | 'node_error';

const REPORT_TIMEOUT_MS = 5_000;

export interface PlaybackReporterDeps {
	logger: AppLogger;
	/** client는 로그인 뒤에 준비돼서 호출 시점에 읽어요 */
	getClient: () => Client;
}

/**
 * data-api로 재생 이벤트 본문을 보내요. fire-and-forget: 실패해도 재생 경로에 영향 없어요.
 * DATA_API_URL 미설정 시 아무 일도 안 해요. 진행 중인 요청을 추적해서 종료 때 stop()이 끝날 때까지 기다려요
 * (container.playbackReporter가 소유해요). stop() 뒤의 보고는 보내지 않아요.
 */
export class PlaybackReporter implements Stoppable {
	public readonly name = '재생 리포트';
	private readonly inFlight = new Set<Promise<void>>();
	private stopped = false;

	public constructor(private readonly deps: PlaybackReporterDeps) {}

	public post(body: Record<string, unknown>): void {
		if (this.stopped) return;
		const base = gatewayBaseUrl();
		if (!base) return;
		const request: Promise<void> = fetch(`${base}/v1/playback/events`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...dataApiAuthHeaders() },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(REPORT_TIMEOUT_MS)
		})
			.then(() => undefined)
			.catch((error) => {
				this.deps.logger.debug(`[playback-report] failed: ${error instanceof Error ? error.message : String(error)}`);
			})
			.finally(() => {
				this.inFlight.delete(request);
			});
		this.inFlight.add(request);
	}

	/** 종료: 이미 보낸 요청이 끝날 때까지(최대 REPORT_TIMEOUT_MS) 기다리고, 이후 보고는 받지 않아요. */
	public async stop(): Promise<void> {
		this.stopped = true;
		await Promise.all([...this.inFlight]);
	}

	public reportPlaybackEvent(
		guildId: string,
		type: PlaybackReportType,
		track: Track | UnresolvedTrack | null,
		extra?: { reason?: string; consecutiveErrors?: number }
	): void {
		this.post({
			type,
			guildId,
			nodeId: null,
			shardId: this.deps.getClient().guilds.cache.get(guildId)?.shardId ?? null,
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
	public reportNodeEvent(nodeId: string, type: NodeReportType, reason: string | null): void {
		this.post({
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
}
