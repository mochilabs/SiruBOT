import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Guild } from '@sirubot/prisma';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

const db = { guild: { upsert } } as never;
vi.mock('@sirubot/utils', async () => {
	const { MemoryCache } = await import('../../../../../packages/utils/src/memoryCache.ts');
	const { normalizeCustomCommandPrefix } = await import('../../../../../packages/utils/src/customCommand.ts');
	const { normalizeEmbedFixSites } = await import('../../../../../packages/utils/src/chatTools.ts');
	return { MemoryCache, normalizeCustomCommandPrefix, normalizeEmbedFixSites };
});

import {
	getDefaultTextChannel,
	getPanelChannel,
	getTextChannelInputPlay,
	getTextChannelDeleteInput,
	getTextChannelMode,
	setDefaultVoiceChannel,
	setTextChannelInputPlay,
	setTextChannelDeleteInput,
	setTextChannelMode
} from './channels.ts';
import { GuildSettingsStore } from './store.ts';

function guild(id = 'guild', overrides: Partial<Guild> = {}): Guild {
	return {
		id,
		textChannelId: null,
		voiceChannelId: null,
		textChannelInputPlay: false,
		textChannelMode: 'play',
		textChannelDeleteInput: false,
		...overrides
	} as Guild;
}

describe('channels 도메인 CRUD', () => {
	beforeEach(() => {
		upsert.mockReset();
	});

	it('기본 텍스트·음성 채널을 저장하고 읽어요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { voiceChannelId: 'voice-1' }));
		const store = new GuildSettingsStore({ db });
		await expect(setDefaultVoiceChannel(store, 'guild', 'voice-1')).resolves.toBe('voice-1');
		expect(upsert.mock.calls[0][0].update).toEqual({ voiceChannelId: 'voice-1' });

		await expect(getDefaultTextChannel(store, 'guild')).resolves.toBeNull();
		expect(upsert).toHaveBeenCalledTimes(1);
	});

	it('고정 채널 입력 동작은 select만 select로 읽고 그 외는 play로 폴백해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { textChannelMode: 'select' }));
		const store = new GuildSettingsStore({ db });
		await expect(getTextChannelMode(store, 'guild')).resolves.toBe('select');

		upsert.mockResolvedValueOnce(guild('guild', { textChannelMode: 'bogus' as never }));
		const broken = new GuildSettingsStore({ db });
		await expect(getTextChannelMode(broken, 'guild')).resolves.toBe('play');
	});

	it('채팅 입력 재생과 입력 메시지 삭제 여부를 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { textChannelInputPlay: true }));
		const store = new GuildSettingsStore({ db });
		await expect(setTextChannelInputPlay(store, 'guild', true)).resolves.toBe(true);
		expect(upsert.mock.calls[0][0].update).toEqual({ textChannelInputPlay: true });

		upsert.mockResolvedValueOnce(guild('guild', { textChannelInputPlay: true, textChannelDeleteInput: true }));
		await expect(setTextChannelDeleteInput(store, 'guild', true)).resolves.toBe(true);
		expect(upsert.mock.calls[1][0].update).toEqual({ textChannelDeleteInput: true });

		await expect(getTextChannelInputPlay(store, 'guild')).resolves.toBe(true);
		await expect(getTextChannelDeleteInput(store, 'guild')).resolves.toBe(true);
	});

	it('채팅 입력 재생 모드를 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { textChannelMode: 'select' }));
		const store = new GuildSettingsStore({ db });
		await expect(setTextChannelMode(store, 'guild', 'select')).resolves.toBe('select');
		expect(upsert.mock.calls[0][0].update).toEqual({ textChannelMode: 'select' });
	});

	it('패널 채널은 기본 채널 + 입력 재생 + 입력 삭제가 모두 켜졌을 때만 돌려줘요', async () => {
		const cases: [Partial<Guild>, string | null][] = [
			[{ textChannelId: 'c', textChannelInputPlay: true, textChannelDeleteInput: true }, 'c'],
			[{ textChannelId: 'c', textChannelInputPlay: true, textChannelDeleteInput: false }, null],
			[{ textChannelId: 'c', textChannelInputPlay: false, textChannelDeleteInput: true }, null],
			[{ textChannelId: null, textChannelInputPlay: true, textChannelDeleteInput: true }, null]
		];
		for (const [overrides, expected] of cases) {
			upsert.mockResolvedValueOnce(guild('guild', overrides));
			const store = new GuildSettingsStore({ db });
			await setDefaultVoiceChannel(store, 'guild', null);
			await expect(getPanelChannel(store, 'guild')).resolves.toBe(expected);
		}
	});
});
