import { SPONSORBLOCK_SEGMENTS } from './guildSettingsContract.js';

/** 길드 설정 계약의 SponsorBlock 구간 목록을 그대로 써요 (단일 소스: guildSettingsContract.ts) */
export const SPONSORBLOCK_SKIP_CATEGORIES = SPONSORBLOCK_SEGMENTS;

export type SponsorBlockSkipCategory = (typeof SPONSORBLOCK_SKIP_CATEGORIES)[number];

export interface SponsorBlockSkipSegment {
	category: SponsorBlockSkipCategory;
	startMs: number;
	endMs: number;
}
