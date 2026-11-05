import { describe, expect, it } from 'vitest';
import { transitionFlags, transitionMode, isTransitionMode, needsUpcomingTrack, TRANSITION_MODES } from './mixerTransition.js';

describe('transition modes', () => {
	it.each(TRANSITION_MODES)('roundtrips %s with the existing two settings', (mode) => {
		expect(transitionMode(transitionFlags(mode))).toBe(mode);
		expect(Object.keys(transitionFlags(mode)).sort()).toEqual(['automixEnabled', 'crossfadeEnabled']);
	});
	it('preserves legacy settings including an inconsistent AutoMix flag', () => {
		expect(transitionMode({ crossfadeEnabled: false, automixEnabled: true })).toBe('automix');
		expect(isTransitionMode('unknown')).toBe(false);
	});
});

describe('needsUpcomingTrack', () => {
	it('returns true when AutoMix is enabled even if gapless is false', () => {
		expect(needsUpcomingTrack({ gaplessEnabled: false, crossfadeEnabled: true, automixEnabled: true })).toBe(true);
		expect(needsUpcomingTrack({ gaplessEnabled: false, crossfadeEnabled: false, automixEnabled: true })).toBe(true);
	});

	it('returns true for crossfade-only or gapless-only configurations', () => {
		expect(needsUpcomingTrack({ gaplessEnabled: false, crossfadeEnabled: true, automixEnabled: false })).toBe(true);
		expect(needsUpcomingTrack({ gaplessEnabled: true, crossfadeEnabled: false, automixEnabled: false })).toBe(true);
	});

	it('returns false when every transition mode is disabled', () => {
		expect(needsUpcomingTrack({ gaplessEnabled: false, crossfadeEnabled: false, automixEnabled: false })).toBe(false);
	});

	it('handles null, undefined and empty settings safely', () => {
		expect(needsUpcomingTrack(null)).toBe(false);
		expect(needsUpcomingTrack(undefined)).toBe(false);
		expect(needsUpcomingTrack({})).toBe(false);
	});
});
