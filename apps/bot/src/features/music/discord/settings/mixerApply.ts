import type { container } from '@sapphire/framework';
import type { CustomPlayer } from '../../lavalink/player/customPlayer.ts';
import type { SettingsApplyResult } from './types.ts';

/** 설정은 저장했지만 재생 중인 플레이어에 적용하지 못했을 때의 안내 */
export const MIXER_NOT_APPLIED: SettingsApplyResult = {
	notice: '설정은 저장했지만 지금 재생 중인 곡에는 적용하지 못했어요. 다음 재생부터 적용돼요. 계속 안 되면 봇 운영자에게 믹서 플러그인 지원 여부를 문의해 주세요.',
	warn: true
};

/**
 * 믹서 설정을 저장한 뒤 재생 중인 플레이어에 바로 적용해요. 플레이어가 없으면 다음 재생 때 적용되니 성공이에요.
 * 실패해도 저장은 끝난 상태라 예외 대신 안내를 돌려줘요.
 */
export async function applyMixerToPlayer(
	services: typeof container,
	guildId: string,
	apply: (player: CustomPlayer) => Promise<unknown>
): Promise<SettingsApplyResult> {
	const player = services.audio.getPlayer(guildId) as CustomPlayer | undefined;
	if (!player) return;
	try {
		await apply(player);
	} catch (error) {
		services.logger?.warn?.(`[mixer] 플레이어에 설정을 적용하지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
		return MIXER_NOT_APPLIED;
	}
}
