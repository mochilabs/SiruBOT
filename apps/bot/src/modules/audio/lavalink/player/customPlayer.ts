import { Message } from 'discord.js';
import { LavalinkManager, Player, PlayerJson, PlayerOptions, Track } from 'lavalink-client';

type Chapter = {
	name: string;
	start: number;
	end: number;
	duration: number;
};

export type CustomPlayerJson = PlayerJson & {
	messageId: string | null;
	currentEpoch?: number;
};

/** 예열 소비 확인 창(ms) — TrackHandler의 watchdog·reconcile과 autoPlayRelated 게이트가 공유한다. */
export const TRANSITION_CONFIRM_TIMEOUT_MS = Number(process.env.MIXER_CONFIRM_TIMEOUT_MS) || 5000;

/**
 * 클라이언트 전이 상태 — 무형 setData/getData 문자열 키 대신, 불변식이 타입으로 걸리는 3개 값.
 * 프로세스 로컬(재시작 복구 대상 아님) — toJSON에 포함되지 않는다.
 */
export type TransitionState = {
	/** 유저 명령으로 정지/전이 중 — trackEnd의 자동 진행을 막는다 (trackStart 확정 시 해제) */
	stopByCommand: boolean;
	/** 마지막 시작 확정 트랙 encoded — 전이 리커널·정상 시작 판별 키 */
	lastStartedEncoded: string | null;
	/** 예열 소비 확인 창 시작 시각 — trackStart 확정 시 해제 */
	preloadConsumedAt: number | null;
	/**
	 * trackStart로 확정된 표시 트랙 — NOWPLAYING 렌더러의 단일 소스.
	 * `queue.current`는 lavalink-client의 전이 기계(지연 shift, queueEnd 시프트)가
	 * 수시로 덮어쓰므로 표시 근거로 쓰지 않는다. [nowPlayingTrack]로 읽는다.
	 */
	confirmedNowPlaying: Track | null;
	/** 예열 슬롯을 서버가 소비·재생 확정한 트랙 — 큐에서 빠진 예열곡의 표시 메타데이터 출처 */
	serverConsumedTrack: Track | null;
	/** 중복 기록 방지용 마지막 차트/히스토리 기록 트랙 키 (trackStart와 MixerAdvancedEvent 간 멱등성 보장) */
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
	sampleMiss: number;
}

export class CustomPlayer extends Player {
	public messageId: string | null = null;
	public controller: Message | null = null;
	public chapters: Chapter[] = [];
	/** `chapters`가 어느 트랙의 것인지 — 트랙이 바뀌면 이전 챕터를 버린다. */
	public chaptersTrackIdentifier: string | null = null;
	public queuePage: number = 1;
	public queueSelectedIndex: number | null = null;
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
		invalidateTimer: null,
		sampleMiss: 0
	};

	constructor(options: PlayerOptions, LavalinkManager: LavalinkManager, dontEmitPlayerCreateEvent?: boolean) {
		super(options, LavalinkManager, dontEmitPlayerCreateEvent);
	}

	public override toJSON() {
		return {
			...super.toJSON(),
			messageId: this.messageId,
			currentEpoch: this.currentEpoch
		};
	}
}
