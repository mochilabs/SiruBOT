import { SPONSORBLOCK_SEGMENTS } from './guildSettingsContract.js';

export const SPONSORBLOCK_SKIP_CATEGORIES = SPONSORBLOCK_SEGMENTS;

export type SponsorBlockSkipCategory = (typeof SPONSORBLOCK_SKIP_CATEGORIES)[number];

export interface SponsorBlockSkipSegment {
	category: SponsorBlockSkipCategory;
	startMs: number;
	endMs: number;
}
