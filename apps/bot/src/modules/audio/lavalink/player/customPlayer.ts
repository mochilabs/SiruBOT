import { Message } from 'discord.js';
import { LavalinkManager, Player, PlayerJson, PlayerOptions } from 'lavalink-client';

type Chapter = {
	name: string;
	start: number;
	end: number;
	duration: number;
};

export type CustomPlayerJson = PlayerJson & {
	messageId: string | null;
};

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
};

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
	public transitionState: TransitionState = { stopByCommand: false, lastStartedEncoded: null, preloadConsumedAt: null };

	constructor(options: PlayerOptions, LavalinkManager: LavalinkManager, dontEmitPlayerCreateEvent?: boolean) {
		super(options, LavalinkManager, dontEmitPlayerCreateEvent);
	}

	public override toJSON() {
		return {
			...super.toJSON(),
			messageId: this.messageId
		};
	}
}
