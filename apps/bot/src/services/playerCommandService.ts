/**
 * 플레이어 실시간 제어 구독자 — 대시보드 라이브 탭 컨트롤러 → data-api Redis PUBLISH → 봇 즉시 적용.
 *
 * 대시보드에서 볼륨·일시정지·재생·스킵을 누르면 data-api의 내부 엔드포인트가 채널
 * (`sirubot:player-command`)로 퍼블리시하고, 각 봇 프로세스(샤드 replica마다 1개)가 이 서비스로
 * 구독해 자기 플레이어에만 적용해요. 플레이어를 보유하지 않은 프로세스는 무시해요.
 *
 * - 구독은 RedisStore 공용 연결을 못 쓰므로(구독 모드는 일반 명령 불가) 전용 연결을 만들어요.
 * - 연결 실패/끊김에도 봇은 정상 동작해요 — 제어 UI만 실패 화면을 보여줘요.
 * - 적용 실패가 플레이어 상태를 오염시키지 않게 각 액션을 try/catch로 격리해요.
 */
import { PLAYER_COMMAND_CHANNEL, ManagedRedisSubscriber } from '@sirubot/utils';
import { type LavalinkManager } from 'lavalink-client';

import type { CustomPlayer } from '../modules/audio/lavalink/player/customPlayer.ts';
import type { GuildService } from './guildService.ts';
import type { MixerService } from './mixerService.ts';

export type PlayerCommandAction = 'volume' | 'pause' | 'resume' | 'skip';

interface PlayerCommandPayload {
	guildId?: unknown;
	action?: unknown;
	value?: unknown;
}

interface PlayerCommandDeps {
	audio: LavalinkManager<CustomPlayer>;
	guildService: GuildService;
	mixerService: MixerService;
}

const ACTIONS = new Set<PlayerCommandAction>(['volume', 'pause', 'resume', 'skip']);

/** 페이로드 검증 — action·value가 계약과 일치할 때만 적용해요 */
function parseCommand(raw: string): { guildId: string; action: PlayerCommandAction; value: number | undefined } | null {
	try {
		const parsed = JSON.parse(raw) as PlayerCommandPayload;
		if (
			typeof parsed?.guildId !== 'string' ||
			parsed.guildId.length === 0 ||
			parsed.guildId.length > 32 ||
			typeof parsed?.action !== 'string' ||
			!ACTIONS.has(parsed.action as PlayerCommandAction)
		) {
			return null;
		}
		const action = parsed.action as PlayerCommandAction;
		let value: number | undefined;
		if (action === 'volume') {
			if (typeof parsed.value !== 'number' || !Number.isInteger(parsed.value) || parsed.value < 0 || parsed.value > 150) {
				return null;
			}
			value = parsed.value;
		}
		return { guildId: parsed.guildId, action, value };
	} catch {
		// 형식 불일치 — 조용히 무시 (로그는 구독자가 남겨요)
		return null;
	}
}

export class PlayerCommandService {
	private subscriber: ManagedRedisSubscriber | null = null;
	private deps: PlayerCommandDeps | null = null;

	public constructor(
		private readonly logger: { info(msg: string): void; warn(msg: string): void; error(msg: string): void; debug(msg: string): void }
	) {}

	/**
	 * 구독을 시작해요. 실패해도 throw하지 않아요 — 제어 UI 실패 화면으로 동작이 이어지고,
	 * 전용 구독 관리자가 자체 백오프(5s→60s)로 재연결을 시도해요.
	 */
	public async start(redisUrl: string | undefined, deps: PlayerCommandDeps): Promise<void> {
		this.deps = deps;
		const url = redisUrl?.trim() || null;
		if (!url) {
			this.logger.warn('REDIS_URL 미설정: 플레이어 제어 구독 없이 동작해요 (대시보드 컨트롤러만 불가)');
			return;
		}
		this.subscriber = new ManagedRedisSubscriber({
			name: '플레이어 제어',
			url,
			logger: this.logger,
			bindings: [{ channel: PLAYER_COMMAND_CHANNEL, onMessage: (raw) => void this.apply(raw) }]
		});
		await this.subscriber.start();
	}

	private async apply(raw: string): Promise<void> {
		const command = parseCommand(raw);
		const deps = this.deps;
		if (!command || !deps) {
			this.logger.debug(`플레이어 제어 페이로드 형식 불일치, 무시: ${raw.slice(0, 100)}`);
			return;
		}

		const { guildId, action, value } = command;
		const player = deps.audio.getPlayer(guildId);

		try {
			// 볼륨은 플레이어 유무와 무관하게 저장 길드 설정에 반영 — 슬래시 /volume과 같은 동작이에요.
			if (action === 'volume' && value !== undefined) {
				const { volume } = await deps.guildService.updateVolume(guildId, value);
				if (player) player.setVolume(volume);
				this.logger.debug(`플레이어 볼륨 적용: ${guildId} → ${volume}%`);
				return;
			}
			// pause/resume/skip은 활성 플레이어가 있을 때만 의미가 있어요.
			if (!player) {
				this.logger.debug(`플레이어 없음, 무시: ${guildId} ${action}`);
				return;
			}
			if (action === 'pause') {
				if (!player.paused) await player.pause();
			} else if (action === 'resume') {
				if (player.paused) await player.resume();
			} else if (action === 'skip') {
				await deps.mixerService.skip(player);
			}
			this.logger.debug(`플레이어 명령 적용: ${guildId} ${action}`);
		} catch (error) {
			// 개별 적용 실패는 프로세스를 죽이지 않아요 — 다음 명령과 정기 상태 퍼블리시로 회복돼요.
			this.logger.error(`플레이어 명령 적용 실패: ${guildId} ${action}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/** 종료 — 구독 해제 후 연결을 닫아요. 호출자(shutdown)는 redisStore.disconnect() 전에 불러야 해요. */
	public async stop(): Promise<void> {
		const subscriber = this.subscriber;
		this.subscriber = null;
		await subscriber?.stop();
	}
}
