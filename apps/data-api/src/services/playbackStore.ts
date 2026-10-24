/** 재생 이벤트 수집 — 각 샤드 프로세스의 trackHandler가 fire-and-forget으로 보고해요. */

export type PlaybackEventType =
	'track_start' | 'track_end' | 'track_stuck' | 'track_error' | 'queue_end' | 'playback_abort' | 'node_disconnect' | 'node_error';

export interface PlaybackEvent {
	type: PlaybackEventType;
	guildId: string | null;
	nodeId: string | null;
	shardId: number | null;
	trackTitle: string | null;
	trackAuthor: string | null;
	trackId: string | null;
	reason: string | null;
	consecutiveErrors: number;
	/** 병합된 보고 수. 노드 이벤트는 봇 워커마다 같은 장애를 각각 보고하므로 한 항목으로 모아요. */
	count: number;
	at: number;
}

const MAX_EVENTS = 500;
/** 같은 노드+유형 보고를 하나로 병합하는 시간 창. 워커 fan-in을 한 줄로 접기 위함이에요. */
const NODE_MERGE_WINDOW_MS = 60_000;
/** 병합 탐색 범위. 직전 이벤트만 보면 사이에 트랙 이벤트가 끼면 병합을 놓쳐요. */
const NODE_MERGE_SCAN = 25;
const events: PlaybackEvent[] = [];
const counts: Record<PlaybackEventType, number> = {
	track_start: 0,
	track_end: 0,
	track_stuck: 0,
	track_error: 0,
	queue_end: 0,
	playback_abort: 0,
	node_disconnect: 0,
	node_error: 0
};
/** 길드별 마지막 상태 (현재 재생 중 파악용) */
const lastByGuild = new Map<string, PlaybackEvent>();

function isNodeEvent(event: PlaybackEvent): boolean {
	return event.type === 'node_disconnect' || event.type === 'node_error';
}

export function recordPlaybackEvent(input: Omit<PlaybackEvent, 'count'> & { count?: number }): void {
	const event: PlaybackEvent = { ...input, count: input.count ?? 1 };
	counts[event.type]++;
	if (isNodeEvent(event)) {
		for (let i = events.length - 1; i >= 0 && i > events.length - 1 - NODE_MERGE_SCAN; i--) {
			const prev = events[i];
			if (!isNodeEvent(prev) || prev.type !== event.type || prev.nodeId !== event.nodeId) continue;
			if (event.at - prev.at > NODE_MERGE_WINDOW_MS) break;
			prev.count += event.count;
			if (event.reason) prev.reason = event.reason;
			return;
		}
	}
	events.push(event);
	if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
	if (event.guildId) lastByGuild.set(event.guildId, event);
}

export function recentPlaybackEvents(limit: number): PlaybackEvent[] {
	return events.slice(-Math.max(1, Math.min(100, limit)));
}

export function playbackSnapshot(): {
	counts: Record<PlaybackEventType, number>;
	total: number;
	guilds: number;
	recentErrors: PlaybackEvent[];
} {
	return {
		counts: { ...counts },
		total: events.length,
		guilds: lastByGuild.size,
		recentErrors: events
			.filter((e) => e.type === 'track_stuck' || e.type === 'track_error' || e.type === 'playback_abort' || isNodeEvent(e))
			.slice(-20)
	};
}
