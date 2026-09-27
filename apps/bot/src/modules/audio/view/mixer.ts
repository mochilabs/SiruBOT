import { DEFAULT_COLOR } from '@sirubot/utils';
import { ContainerBuilder } from 'discord.js';
import type { MixerStateResponse } from '../../../services/mixerService.ts';
import type { MixerSettings } from '../../../services/guildService.ts';

type MixerStatusProps = {
	settings: MixerSettings;
	state: MixerStateResponse | null;
	noPlayer?: boolean;
};

export function mixerStatus({ settings, state, noPlayer }: MixerStatusProps) {
	const lines = [
		`### 🎛️ 믹서 상태`,
		``,
		`⏭️ **갭리스**: ${settings.gaplessEnabled ? '켜짐' : '꺼짐'}`,
		`🔀 **크로스페이드**: ${settings.crossfadeEnabled ? `켜짐 (${settings.crossfadeMs}ms)` : '꺼짐'}`,
		`📦 **예열된 다음 곡**: ${state ? (state.hasNext ? '있음' : '없음') : noPlayer ? '재생 중이 아니라서 없음' : '서버 상태 조회 실패'}`
	];
	if (state?.crossfadeActive) lines.push(`🔀 크로스페이드 진행 중`);
	return new ContainerBuilder().setAccentColor(DEFAULT_COLOR).addTextDisplayComponents((textDisplay) => textDisplay.setContent(lines.join('\n')));
}

export function mixerUpdated({ message }: { message: string }) {
	return new ContainerBuilder().setAccentColor(DEFAULT_COLOR).addTextDisplayComponents((textDisplay) => textDisplay.setContent(message));
}
