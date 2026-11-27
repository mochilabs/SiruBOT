import type { OverrideAction } from './player/customPlayer.ts';

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
