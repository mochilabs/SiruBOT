import { Message } from 'discord.js';
import { LavalinkManager, Player, PlayerJson, PlayerOptions, Track } from 'lavalink-client';
import { RelatedTrackHistory } from './relatedTrackHistory.ts';
import { getConfig } from '../../../../lib/config.ts';

type Chapter = {
	name: string;
	start: number;
	end: number;
	duration: number;
};

export type CustomPlayerJson = PlayerJson & {
	messageId: string | null;
	currentEpoch?: number;
	relatedTrackHistory?: string[];
};

export const transitionConfirmTimeoutMs = (): number => getConfig().mixer.confirmTimeoutMs;

export type TransitionState = {
	stopByCommand: boolean;
	lastStartedEncoded: string | null;
	preloadConsumedAt: number | null;
	/** Confirmed by trackStart; queue.current can be shifted prematurely by lavalink-client. */
	confirmedNowPlaying: Track | null;
	serverConsumedTrack: Track | null;
	lastRecordedKey?: string | null;
};
export type OverrideAction = 'PLAY_NOW' | 'STOP';

export interface PendingOverride {
	epoch: number;
	action: OverrideAction;
	intentKey: string;
	recovery: boolean;
	timer: NodeJS.Timeout;
}

export interface MixerRuntime {
	pending: Map<string, PendingOverride>;
	transitionSeq: number;
	lastTargetUid: string | null;
	invalidateTimer: NodeJS.Timeout | null;
}

export class CustomPlayer extends Player {
	public readonly relatedTrackHistory = new RelatedTrackHistory();
	public resettingVoice = false;
	public messageId: string | null = null;
	public controller: Message | null = null;
	public chapters: Chapter[] = [];
	public chaptersTrackIdentifier: string | null = null;
	public activeFilters: string[] = [];
	public consecutiveErrors: number = 0;
	public transitionState: TransitionState = {
		stopByCommand: false,
		lastStartedEncoded: null,
		preloadConsumedAt: null,
		confirmedNowPlaying: null,
		serverConsumedTrack: null,
		lastRecordedKey: null
	};
	public currentEpoch: number = 1;
	public mixerRuntime: MixerRuntime = {
		pending: new Map(),
		transitionSeq: 0,
		lastTargetUid: null,
		invalidateTimer: null
	};

	constructor(options: PlayerOptions, LavalinkManager: LavalinkManager, dontEmitPlayerCreateEvent?: boolean) {
		super(options, LavalinkManager, dontEmitPlayerCreateEvent);
	}

	public override toJSON() {
		return {
			...super.toJSON(),
			messageId: this.messageId,
			currentEpoch: this.currentEpoch,
			// Player takes a snapshot before subclass fields initialize.
			relatedTrackHistory: this.relatedTrackHistory?.toJSON() ?? []
		};
	}
}

export async function destroyStoppedPlayer(player: Player): Promise<void> {
	try {
		await player.destroy('StopCommand');
	} catch {
		await player.stopPlaying().catch(() => null);
		await player.disconnect(true).catch(() => null);
	}
}
