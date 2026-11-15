import { describe, expect, it, vi } from 'vitest';
import { mixerStatus } from './mixer.ts';
vi.mock('@sirubot/utils', () => ({ DEFAULT_COLOR: 0, WARN_COLOR: 1, emoji: (name: string) => name }));
const settings = {
	gaplessEnabled: true,
	crossfadeEnabled: true,
	crossfadeMs: 5000,
	normalizationEnabled: false,
	automixEnabled: true,
	automixMaxTempoChange: 0.06,
	automixMinConfidence: 0.3
};
const state = { guildId: 'guild', crossfadeEnabled: true, crossfadeMs: 5000, fadeInMs: 0, duckLevel: 0.3, hasNext: true };

describe('AutoMix status', () => {
	it('shows desired settings and pending application without a player', () => {
		const output = JSON.stringify(mixerStatus({ settings, state: null, noPlayer: true }).toJSON());
		expect(output).toContain('최대 템포 변경 6.0%, 최소 신뢰도 0.30');
		expect(output).toContain('다음 재생에 적용 예정');
	});
	it('does not infer beat readiness from a preloaded track on an older server', () => {
		expect(JSON.stringify(mixerStatus({ settings, state }).toJSON())).toContain('서버에서 오토믹스 상태를 제공하지 않음');
	});
	it('distinguishes applied settings from per-track fallback', () => {
		const output = JSON.stringify(mixerStatus({ settings, state: { ...state, bpmDetectionEnabled: true, beatmatchEnabled: true } }).toJSON());
		expect(output).toContain('BPM 분석·비트매치 켜짐');
		expect(output).toContain('곡별 분석 결과에 따라 일반 전환 가능');
	});
	it('shows incomplete runtime application', () => {
		expect(JSON.stringify(mixerStatus({ settings, state: { ...state, bpmDetectionEnabled: true, beatmatchEnabled: false } }).toJSON())).toContain(
			'저장된 설정이 서버에 모두 적용되지 않음'
		);
	});
});
