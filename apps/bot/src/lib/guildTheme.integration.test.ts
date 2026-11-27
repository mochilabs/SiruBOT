import { afterEach, describe, expect, it } from 'vitest';
import { createContainer, emoji, emojiProgressBar, setContextThemeResolver } from '@sirubot/utils';
import { setAppEmojiIdMap } from '@sirubot/utils';
import { currentGuildTheme, withGuildTheme } from './guildTheme.ts';

afterEach(() => setContextThemeResolver(null));

describe('서버 테마 맥락 → 컨테이너·이모지', () => {
	it('맥락 안에서는 서버 테마 색과 접미사 이모지를, 밖에서는 분홍 기본을 써요', async () => {
		setContextThemeResolver(currentGuildTheme);
		setAppEmojiIdMap({ pb_start_filled: '1', pb_start_filled_purple: '2', star: '3' });

		const inside = await withGuildTheme(
			'1',
			async () => 'purple',
			async () => {
				await Promise.resolve();
				return { color: createContainer().toJSON().accent_color, bar: emojiProgressBar(1), star: emoji('star') };
			}
		);
		expect(inside.color).toBe(0xa78bfa);
		expect(inside.bar).toContain('<:pb_start_filled_purple:2>');
		expect(inside.star).toBe('<:star:3>');

		expect(createContainer().toJSON().accent_color).toBe(0xff85c0);
		expect(emojiProgressBar(1)).toContain('<:pb_start_filled:1>');
	});

	it('사용자가 색을 직접 정한 컨테이너는 서버 테마보다 우선해요', async () => {
		setContextThemeResolver(currentGuildTheme);
		const color = await withGuildTheme(
			'1',
			async () => 'green',
			() => createContainer('#123456').toJSON().accent_color
		);
		expect(color).toBe(0x123456);
	});
});
