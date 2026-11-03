export const SPONSORBLOCK_SKIP_CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic', 'filler'] as const;

export type SponsorBlockSkipCategory = (typeof SPONSORBLOCK_SKIP_CATEGORIES)[number];

export interface SponsorBlockSkipSegment {
	category: SponsorBlockSkipCategory;
	startMs: number;
	endMs: number;
}
