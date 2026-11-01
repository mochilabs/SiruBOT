import { DEFAULT_COLOR, emoji } from '@sirubot/utils';
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
		`### ${emoji('spectrum')} 믹서 상태`,
		``,
		`${emoji('arrow_forward')} **갭리스**: ${settings.gaplessEnabled ? '켜짐' : '꺼짐'}`,
		`${emoji('shuffle')} **크로스페이드**: ${settings.crossfadeEnabled ? `켜짐 (${(settings.crossfadeMs / 1000).toFixed(1)}초)` : '꺼짐'}`,
		`${emoji('shuffle')} **오토믹스 설정**: ${settings.automixEnabled ? '켜짐' : '꺼짐'} (최대 템포 변경 ${(settings.automixMaxTempoChange * 100).toFixed(1)}%, 최소 신뢰도 ${settings.automixMinConfidence.toFixed(2)})`,
		`${emoji('thermo')} **볼륨 정규화**: ${settings.normalizationEnabled ? '켜짐' : '꺼짐'}`,
		`${emoji('box')} **예열된 다음 곡**: ${state ? (state.hasNext ? '있음' : '없음') : noPlayer ? '재생 중이 아니라서 없음' : '서버 상태 조회 실패'}`
	];
	if (settings.automixEnabled) {
		const runtime = noPlayer
			? '다음 재생에 적용 예정'
			: !state
				? '서버 상태 조회 실패'
				: state.bpmDetectionEnabled === undefined || state.beatmatchEnabled === undefined
					? '서버에서 오토믹스 상태를 제공하지 않음'
					: state.bpmDetectionEnabled && state.beatmatchEnabled && state.crossfadeEnabled
						? 'BPM 분석·비트매치 켜짐 (곡별 분석 결과에 따라 일반 전환 가능)'
						: '저장된 설정이 서버에 모두 적용되지 않음';
		lines.push(`${emoji('spectrum')} **오토믹스 서버 상태**: ${runtime}`);
	}
	if (state?.crossfadeActive) lines.push(`${emoji('shuffle')} 크로스페이드 진행 중`);
	return new ContainerBuilder().setAccentColor(DEFAULT_COLOR).addTextDisplayComponents((textDisplay) => textDisplay.setContent(lines.join('\n')));
}

export function mixerUpdated({ message }: { message: string }) {
	return new ContainerBuilder().setAccentColor(DEFAULT_COLOR).addTextDisplayComponents((textDisplay) => textDisplay.setContent(message));
}
