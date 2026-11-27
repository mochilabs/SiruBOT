import type { Client } from 'discord.js';
import type { Track, UnresolvedTrack } from 'lavalink-client';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { Stoppable } from '../../../lib/lifecycle.ts';
import { dataApiAuthHeaders, gatewayBaseUrl } from '../../../lib/dataApi.ts';

type PlaybackReportType = 'track_start' | 'track_end' | 'track_stuck' | 'track_error' | 'queue_end' | 'playback_abort';
type NodeReportType = 'node_disconnect' | 'node_error';

const REPORT_TIMEOUT_MS = 5_000;
const USAGE_PLAYBACK_TYPES: ReadonlySet<PlaybackReportType> = new Set(['track_start', 'track_error', 'track_stuck', 'playback_abort']);

export interface PlaybackReporterDeps {
	logger: AppLogger;
	getClient: () => Client;
	recordUsage?: (guildId: string, type: PlaybackReportType) => void;
}

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
		if (USAGE_PLAYBACK_TYPES.has(type)) this.deps.recordUsage?.(guildId, type);
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
