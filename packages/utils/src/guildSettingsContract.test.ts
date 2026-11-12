import { describe, expect, it } from 'vitest';
import {
	AI_MODES,
	AUTOMIX_MAX_TEMPO_CHANGE_RANGE,
	AUTOMIX_MIN_CONFIDENCE_RANGE,
	CROSSFADE_MS_RANGE,
	JTC_TEMPLATE_MAX_LENGTH,
	JTC_USER_LIMIT_RANGE,
	MUSIC_VOLUME_RANGE,
	PINNED_CHANNEL_MODES,
	REPEAT_MODES,
	SPONSORBLOCK_SEGMENTS,
	TTS_ANNOUNCE_MODES,
	TTS_DUCK_LEVEL_RANGE,
	TTS_VOLUME_RANGE,
	normalizeAiMode,
	normalizePinnedChannelMode,
	normalizeRepeatMode,
	normalizeSponsorBlockSegments,
	normalizeTtsAnnounceMode
} from './guildSettingsContract.ts';
import { SPONSORBLOCK_SKIP_CATEGORIES } from './sponsorblock.ts';

/** 길드 설정 공용 계약 — 봇과 대시보드가 같은 값을 쓰므로 값이 바뀌면 여기서 먼저 깨져요 */
describe('guildSettingsContract 열거값', () => {
	it('열거값과 순서를 고정해요', () => {
		expect(AI_MODES).toEqual(['all', 'channels', 'off']);
		expect(REPEAT_MODES).toEqual(['off', 'track', 'queue']);
		expect(PINNED_CHANNEL_MODES).toEqual(['play', 'select']);
		expect(TTS_ANNOUNCE_MODES).toEqual(['sequential', 'parallel', 'interrupt']);
		expect(SPONSORBLOCK_SEGMENTS).toEqual(['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic', 'filler']);
	});

	it('정규화는 알 수 없는 값을 각 기본값으로 되돌려요', () => {
		expect(normalizeAiMode('channels')).toBe('channels');
		expect(normalizeAiMode('bogus')).toBe('all');
		expect(normalizeAiMode(null)).toBe('all');
		expect(normalizeRepeatMode('queue')).toBe('queue');
		expect(normalizeRepeatMode('bogus')).toBe('off');
		expect(normalizePinnedChannelMode('select')).toBe('select');
		expect(normalizePinnedChannelMode(undefined)).toBe('play');
		expect(normalizeTtsAnnounceMode('interrupt')).toBe('interrupt');
		expect(normalizeTtsAnnounceMode('bogus')).toBe('sequential');
	});

	it('SponsorBlock 정규화는 계약에 없는 구간을 버려요', () => {
		expect(normalizeSponsorBlockSegments(['sponsor', 'nope', 'filler'])).toEqual(['sponsor', 'filler']);
	});

	it('SponsorBlock 건너뛰기 카테고리는 같은 목록을 써요', () => {
		expect(SPONSORBLOCK_SKIP_CATEGORIES).toEqual(SPONSORBLOCK_SEGMENTS);
	});
});

/** 수치 범위 — 대시보드 스키마·UI 슬라이더·봇 클램프가 같은 상·하한을 써요 */
describe('guildSettingsContract 수치 범위', () => {
	it('볼륨 범위는 playerLimits 상한(150%)을 따라요', () => {
		expect(MUSIC_VOLUME_RANGE).toEqual({ min: 0, max: 150 });
		expect(TTS_VOLUME_RANGE).toEqual({ min: 0, max: 150 });
	});

	it('덕킹 비율은 0~1이에요', () => {
		expect(TTS_DUCK_LEVEL_RANGE).toEqual({ min: 0, max: 1 });
	});

	it('크로스페이드는 500ms~15000ms예요', () => {
		expect(CROSSFADE_MS_RANGE).toEqual({ min: 500, max: 15000 });
	});

	it('AutoMix 템포 변경은 0~0.12, 분석 신뢰도는 0~1이에요', () => {
		expect(AUTOMIX_MAX_TEMPO_CHANGE_RANGE).toEqual({ min: 0, max: 0.12 });
		expect(AUTOMIX_MIN_CONFIDENCE_RANGE).toEqual({ min: 0, max: 1 });
	});

	it('임시 음성방 인원 제한은 0~99, 이름 템플릿은 100자예요', () => {
		expect(JTC_USER_LIMIT_RANGE).toEqual({ min: 0, max: 99 });
		expect(JTC_TEMPLATE_MAX_LENGTH).toBe(100);
	});
});
