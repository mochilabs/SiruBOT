import type { OverrideAction } from './player/customPlayer.ts';

/**
 * Lavalink mixer 플러그인 REST 프로토콜의 타입과 오류.
 * `application/mixerService.ts`(REST 클라이언트)와 `lavalink/handlers/mixerHandlers.ts`(수신 핸들러)가 함께 써요.
 * 두 쪽이 서로를 import하면 순환이 생기므로, 공용 면은 여기에 둬요.
 */

export interface MixerStateResponse {
	guildId: string;
	protocolVersion?: number;
	state?: string;
	lastKnownEpoch?: number;
	crossfadeEnabled: boolean;
	crossfadeMs: number;
	fadeInMs: number;
	duckLevel: number;
	normalizationEnabled?: boolean;
	bpmDetectionEnabled?: boolean;
	beatmatchEnabled?: boolean;
	maxTempoChange?: number;
	beatmatchMinConfidence?: number;
	adaptiveTransitionsSupported?: boolean;
	currentTrackBpm?: number | null;
	currentTrackBpmIdentifier?: string | null;
	silenceEnabled?: boolean;
	silenceThresholdDb?: number;
	tailConfirmMs?: number;
	nextTrimMs?: [number, number] | null;
	announcementsQueued?: number;
	hasNext?: boolean;
	crossfadeActive?: boolean;
}

export interface MixerAnnounceReceipt {
	guildId: string;
	id: number;
	position: number;
	queueLength: number;
}

export interface ArmRequestOptions {
	epoch: number;
	encodedTrack: string | null;
	isEmpty?: boolean;
	preserveTransition?: boolean;
	startPositionMs?: number;
	outgoingEndPositionMs?: number;
}

export interface OverrideRequestOptions {
	epoch: number;
	action: OverrideAction;
	encodedTrack?: string | null;
}

export class MixerRequestError extends Error {
	public lastKnownEpoch?: number;
	public v2WindowOpenAt?: number;

	public constructor(
		public readonly status: number,
		message: string,
		extra?: { lastKnownEpoch?: number; v2WindowOpenAt?: number }
	) {
		super(message);
		this.name = 'MixerRequestError';
		this.lastKnownEpoch = extra?.lastKnownEpoch;
		this.v2WindowOpenAt = extra?.v2WindowOpenAt;
	}
}
