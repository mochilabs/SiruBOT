import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';

/** Redis 연결이 늦으면 재시도하는 간격과 최대 횟수 (5초 × 12회 = 약 1분) */
const RESTORE_RETRY_MS = 5_000;
const RESTORE_MAX_ATTEMPTS = 12;

/**
 * READY — 재시작 전에 만든 임시방 추적을 Redis 기록으로 되살려요.
 * 기록을 읽으려면 Redis가 연결돼 있어야 해서, 준비가 안 됐으면 짧게 나눠 재시도해요.
 */
@ApplyOptions<Listener.Options>({ event: Events.ClientReady })
export class TempVoiceReadyListener extends Listener {
	public override async run(): Promise<void> {
		await this.restore(1);
	}

	private async restore(attempt: number): Promise<void> {
		const restored = await this.container.tempVoiceService.restoreRooms().catch((error: unknown) => {
			this.container.logger.error(`[tempVoice] room restore failed: ${error}`);
			return false;
		});
		if (restored) {
			this.container.logger.debug('[tempVoice] 임시방 추적 복원 완료');
			return;
		}
		if (attempt >= RESTORE_MAX_ATTEMPTS) {
			this.container.logger.warn('[tempVoice] Redis 미연결로 임시방 추적을 복원하지 못했어요 (메모리 전용 모드)');
			return;
		}
		setTimeout(() => void this.restore(attempt + 1), RESTORE_RETRY_MS);
	}
}
