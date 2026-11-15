/**
 * 길드 설정 공용 계약 — 봇(services/guildSettings)과 대시보드(guildSettingsSchema·설정 UI)가 같은 열거값·
 * 범위·기본값을 써요. 순수 상수와 정규화 함수만 두어 클라이언트 번들도 서브패스로 가져다 쓸 수 있어요.
 *
 * DB 스키마(packages/prisma)의 @default는 여기 기본값과 같아야 해요 — dashboard schemas.test.ts가 검증해요.
 * 볼륨 상한은 playerLimits.ts가 단일 소스이고, 여기서는 TTS 볼륨 상한으로 그대로 재사용해요.
 */
import { MUSIC_VOLUME_MAX, MUSIC_VOLUME_MIN } from './playerLimits.js';

/* ── AI 채팅 모드 ─────────────────────────────────────────── */

/** AI 채팅 모드 — all: 모든 채널 / channels: 특정 채널만 / off: 끄기 */
export const AI_MODES = ['all', 'channels', 'off'] as const;
export type AiMode = (typeof AI_MODES)[number];
/** DB에 깨진 값이 있거나 값이 없으면 되돌아가는 AI 채팅 모드 */
export const AI_MODE_DEFAULT: AiMode = 'all';

/** AI 채팅 모드 정규화 — 알 수 없는 값은 AI_MODE_DEFAULT로 되돌려요 */
export function normalizeAiMode(value: string | null | undefined): AiMode {
	return value && (AI_MODES as readonly string[]).includes(value) ? (value as AiMode) : AI_MODE_DEFAULT;
}

/* ── 반복 모드 ───────────────────────────────────────────── */

/** 반복 모드 — off: 끄기 / track: 한 곡 / queue: 전체 */
export const REPEAT_MODES = ['off', 'track', 'queue'] as const;
export type RepeatModeSetting = (typeof REPEAT_MODES)[number];
export const REPEAT_MODE_DEFAULT: RepeatModeSetting = 'off';

/** 반복 모드 정규화 — 알 수 없는 값은 REPEAT_MODE_DEFAULT로 되돌려요 */
export function normalizeRepeatMode(value: string | null | undefined): RepeatModeSetting {
	return value && (REPEAT_MODES as readonly string[]).includes(value) ? (value as RepeatModeSetting) : REPEAT_MODE_DEFAULT;
}

/** 반복 모드 타입 가드 — 계약 열거값에 있는 문자열만 통과시켜요 */
export function isRepeatMode(value: string): value is RepeatModeSetting {
	return (REPEAT_MODES as readonly string[]).includes(value);
}

/* ── 고정 채널 입력 동작 ─────────────────────────────────── */

/** 고정 채널 입력 동작 — play: 첫 결과 즉시 재생 / select: 결과 5개 중 선택 */
export const PINNED_CHANNEL_MODES = ['play', 'select'] as const;
export type PinnedChannelModeSetting = (typeof PINNED_CHANNEL_MODES)[number];
export const PINNED_CHANNEL_MODE_DEFAULT: PinnedChannelModeSetting = 'play';

/** 고정 채널 입력 동작 정규화 — 알 수 없는 값은 PINNED_CHANNEL_MODE_DEFAULT로 되돌려요 */
export function normalizePinnedChannelMode(value: string | null | undefined): PinnedChannelModeSetting {
	return value && (PINNED_CHANNEL_MODES as readonly string[]).includes(value) ? (value as PinnedChannelModeSetting) : PINNED_CHANNEL_MODE_DEFAULT;
}

/* ── TTS 안내 방식 ───────────────────────────────────────── */

/** TTS 안내 방식 — 봇 믹서 안내 방식과 1:1 */
export const TTS_ANNOUNCE_MODES = ['sequential', 'parallel', 'interrupt'] as const;
export type TtsAnnounceModeSetting = (typeof TTS_ANNOUNCE_MODES)[number];
export const TTS_ANNOUNCE_MODE_DEFAULT: TtsAnnounceModeSetting = 'sequential';

/** TTS 안내 방식 정규화 — 알 수 없는 값은 TTS_ANNOUNCE_MODE_DEFAULT로 되돌려요 */
export function normalizeTtsAnnounceMode(value: string | null | undefined): TtsAnnounceModeSetting {
	return value && (TTS_ANNOUNCE_MODES as readonly string[]).includes(value) ? (value as TtsAnnounceModeSetting) : TTS_ANNOUNCE_MODE_DEFAULT;
}

/* ── SponsorBlock 구간 ───────────────────────────────────── */

/** SponsorBlock 건너뛰기 카테고리 — 데이터 API 조회와 대시보드 선택지가 같은 목록을 써요 */
export const SPONSORBLOCK_SEGMENTS = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic', 'filler'] as const;
export type SponsorBlockSegment = (typeof SPONSORBLOCK_SEGMENTS)[number];

/** SponsorBlock 구간 정규화 — DB에 잘못된 구간이 섞여 있어도 계약에 있는 값만 남겨요 */
export function normalizeSponsorBlockSegments(values: readonly string[]): SponsorBlockSegment[] {
	const allowed = new Set<string>(SPONSORBLOCK_SEGMENTS);
	return values.filter((value): value is SponsorBlockSegment => allowed.has(value));
}

/* ── 수치 범위 ───────────────────────────────────────────── */

/** 음악 볼륨 범위(%) — playerLimits의 단일 소스를 그대로 써요 */
export const MUSIC_VOLUME_RANGE = { min: MUSIC_VOLUME_MIN, max: MUSIC_VOLUME_MAX } as const;

/** TTS 볼륨 범위(%) — 상한은 Lavalink 볼륨 상한(음악과 같아요) */
export const TTS_VOLUME_RANGE = { min: 0, max: MUSIC_VOLUME_MAX } as const;

/** TTS 덕킹 비율(0~1) — 1이면 음악을 낮추지 않아요 */
export const TTS_DUCK_LEVEL_RANGE = { min: 0, max: 1 } as const;

/** 크로스페이드 길이(ms) — 0.5초 ~ 15초. 15초는 Lavalink mixer 플러그인의 겹치기 상한이에요 */
export const CROSSFADE_MS_RANGE = { min: 500, max: 15000 } as const;

/** AutoMix 최대 템포 변경 비율 — 0% ~ 12% */
export const AUTOMIX_MAX_TEMPO_CHANGE_RANGE = { min: 0, max: 0.12 } as const;

/** AutoMix 최소 분석 신뢰도(0~1) */
export const AUTOMIX_MIN_CONFIDENCE_RANGE = { min: 0, max: 1 } as const;

/** 임시 음성방 인원 제한 — 0은 제한 없음 */
export const JTC_USER_LIMIT_RANGE = { min: 0, max: 99 } as const;

/** 임시 음성방 이름 템플릿 최대 길이(자) */
export const JTC_TEMPLATE_MAX_LENGTH = 100;
