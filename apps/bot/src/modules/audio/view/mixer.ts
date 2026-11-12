import { DEFAULT_COLOR, WARN_COLOR, emoji } from '@sirubot/utils';
import { ContainerBuilder, SeparatorSpacingSize } from 'discord.js';
import type { MixerStateResponse } from '../../../features/music/playback/mixerService.ts';
import type { MixerSettings } from '../../../services/guildService.ts';

type MixerStatusProps = {
	settings: MixerSettings;
	state: MixerStateResponse | null;
	noPlayer?: boolean;
};

/** 현재 곡 전환 방식 — AutoMix가 켜져 있으면 크로스페이드 설정보다 우선해요 */
export function transitionLabel(settings: Pick<MixerSettings, 'automixEnabled' | 'crossfadeEnabled'>): string {
	return settings.automixEnabled ? 'AutoMix' : settings.crossfadeEnabled ? '크로스페이드' : '끄기';
}

function dot(on: boolean): string {
	return on ? '🟢' : '🔴';
}

function tuningText(settings: Pick<MixerSettings, 'automixMaxTempoChange' | 'automixMinConfidence'>): string {
	return `최대 템포 변경 ${(settings.automixMaxTempoChange * 100).toFixed(1)}%, 최소 신뢰도 ${settings.automixMinConfidence.toFixed(2)}`;
}

function runtimeText(state: MixerStateResponse | null, noPlayer?: boolean): string {
	if (noPlayer) return '다음 재생에 적용 예정';
	if (!state) return '서버 상태 조회 실패';
	if (state.bpmDetectionEnabled === undefined || state.beatmatchEnabled === undefined) return '서버에서 오토믹스 상태를 제공하지 않음';
	return state.bpmDetectionEnabled && state.beatmatchEnabled && state.crossfadeEnabled
		? 'BPM 분석·비트매치 켜짐 (곡별 분석 결과에 따라 일반 전환 가능)'
		: '저장된 설정이 서버에 모두 적용되지 않음';
}

export function mixerStatus({ settings, state, noPlayer }: MixerStatusProps) {
	const container = new ContainerBuilder().setAccentColor(DEFAULT_COLOR);
	container.addTextDisplayComponents((text) =>
		text.setContent(`### ${emoji('spectrum')} 믹서 상태\n-# 바꾸려면 DJ 역할이나 관리자 권한이 필요해요.`)
	);
	container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

	const settingLines = [
		`${dot(settings.gaplessEnabled)} **갭리스** ${settings.gaplessEnabled ? '켜짐' : '꺼짐'}`,
		`${dot(settings.automixEnabled || settings.crossfadeEnabled)} **곡 전환** ${transitionLabel(settings)}${
			settings.crossfadeEnabled && !settings.automixEnabled ? ` · 겹침 ${(settings.crossfadeMs / 1000).toFixed(1)}초` : ''
		}`,
		`-# AutoMix 기준: ${tuningText(settings)}`,
		`${dot(settings.normalizationEnabled)} **볼륨 정규화** ${settings.normalizationEnabled ? '켜짐' : '꺼짐'}`
	];
	container.addTextDisplayComponents((text) => text.setContent(settingLines.join('\n')));
	container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

	const nextTrack = state ? (state.hasNext ? '있음' : '없음') : noPlayer ? '재생 중이 아니라서 없음' : '서버 상태 조회 실패';
	const runtimeLines = [`${emoji('box')} **예열된 다음 곡** ${nextTrack}`];
	if (settings.automixEnabled) runtimeLines.push(`${emoji('spectrum')} **AutoMix 서버 상태** ${runtimeText(state, noPlayer)}`);
	if (state?.crossfadeActive) runtimeLines.push(`${emoji('shuffle')} 크로스페이드 진행 중`);
	container.addTextDisplayComponents((text) => text.setContent(runtimeLines.join('\n')));
	return container;
}

type MixerUpdatedProps = {
	/** 무엇이 어떻게 바뀌었는지 한 줄 */
	title: string;
	/** 바뀐 값의 세부 — 줄마다 한 항목 */
	details?: string[];
	/** 언제부터 적용되는지 같은 보충 설명 */
	hint?: string;
};

export function mixerUpdated({ title, details = [], hint }: MixerUpdatedProps) {
	const lines = [`### ${emoji('spectrum')} ${title}`, ...details];
	if (hint) lines.push(`-# ${hint}`);
	return new ContainerBuilder().setAccentColor(DEFAULT_COLOR).addTextDisplayComponents((text) => text.setContent(lines.join('\n')));
}

/** 설정은 저장됐지만 재생 중인 플레이어에 적용하지 못했을 때 — 실패가 아니라 경고로 보여줘요 */
export function mixerSavedNotApplied({ title, details = [] }: { title: string; details?: string[] }) {
	const lines = [
		`### ${emoji('warning')} ${title}`,
		'설정은 저장했지만 지금 재생 중인 곡에는 적용하지 못했어요.',
		...details,
		'-# 다음 재생부터 적용돼요. 계속 안 되면 `/믹서 상태`로 확인하거나 봇 운영자에게 믹서 플러그인 지원 여부를 문의해 주세요.'
	];
	return new ContainerBuilder().setAccentColor(WARN_COLOR).addTextDisplayComponents((text) => text.setContent(lines.join('\n')));
}
