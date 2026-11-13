import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';

/**
 * READY — 재시작 전에 만든 임시방 추적을 Redis 기록으로 되살려요.
 * 기록을 읽으려면 Redis가 연결돼 있어야 해서, 준비가 안 됐으면 TempVoiceService가 짧게 나눠 재시도해요 (재시도 타이머도 서비스가 소유해요).
 */
@ApplyOptions<Listener.Options>({ event: Events.ClientReady })
export class TempVoiceReadyListener extends Listener {
	public override async run(): Promise<void> {
		await this.container.tempVoiceService.restoreWithRetry();
	}
}
