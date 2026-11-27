import type { container } from '@sapphire/framework';
import type { CustomPlayer } from '../../lavalink/player/customPlayer.ts';
import type { SettingsApplyResult } from './types.ts';

export const MIXER_NOT_APPLIED: SettingsApplyResult = {
	notice: '설정은 저장했지만 지금 재생 중인 곡에는 적용하지 못했어요. 다음 재생부터 적용돼요. 계속 안 되면 봇 운영자에게 믹서 플러그인 지원 여부를 문의해 주세요.',
	warn: true
};

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
