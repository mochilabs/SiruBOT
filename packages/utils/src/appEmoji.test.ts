import { describe, expect, it, vi } from 'vitest';

describe('app emoji id map', () => {
	it('keeps cached ids when a later sync returns a partial map and prefers refreshed ids', async () => {
		vi.resetModules();
		const { emoji, setAppEmojiIdMap } = await import('./appEmoji.ts');

		setAppEmojiIdMap({ pause: 'old-pause', play: 'cached-play' });
		setAppEmojiIdMap({ pause: 'new-pause' });

		expect(emoji('pause')).toBe('<:pause:new-pause>');
		expect(emoji('play')).toBe('<:play:cached-play>');
	});
});
