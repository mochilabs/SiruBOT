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
	count: number;
	at: number;
}

const MAX_EVENTS = 500;
const NODE_MERGE_WINDOW_MS = 60_000;
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
