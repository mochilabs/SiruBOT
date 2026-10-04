/** 재생 이벤트 수집 — 각 샤드 프로세스의 trackHandler가 fire-and-forget으로 보고해요. */

export type PlaybackEventType = 'track_start' | 'track_end' | 'track_stuck' | 'track_error' | 'queue_end' | 'playback_abort';

export interface PlaybackEvent {
	type: PlaybackEventType;
	guildId: string;
	shardId: number | null;
	trackTitle: string | null;
	trackAuthor: string | null;
	trackId: string | null;
	reason: string | null;
	consecutiveErrors: number;
	at: number;
}

const MAX_EVENTS = 500;
const events: PlaybackEvent[] = [];
const counts: Record<PlaybackEventType, number> = {
	track_start: 0,
	track_end: 0,
	track_stuck: 0,
	track_error: 0,
	queue_end: 0,
	playback_abort: 0
};
/** 길드별 마지막 상태 (현재 재생 중 파악용) */
const lastByGuild = new Map<string, PlaybackEvent>();

export function recordPlaybackEvent(event: PlaybackEvent): void {
	events.push(event);
	if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
	counts[event.type]++;
	lastByGuild.set(event.guildId, event);
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
		recentErrors: events.filter((e) => e.type === 'track_stuck' || e.type === 'track_error' || e.type === 'playback_abort').slice(-20)
	};
}
