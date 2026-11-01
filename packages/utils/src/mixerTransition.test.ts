import { describe, expect, it } from 'vitest';
import { transitionFlags, transitionMode, isTransitionMode, TRANSITION_MODES } from './mixerTransition.js';

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
