import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TTS_USER_PRESET, TtsUserSettingsService } from './ttsUserSettings.ts';

const mocks = vi.hoisted(() => ({
	logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
	db: { ttsUserSetting: { findUnique: vi.fn(), upsert: vi.fn() } }
}));

vi.mock('@sapphire/framework', () => ({ container: { logger: mocks.logger, db: mocks.db } }));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.db.ttsUserSetting.findUnique.mockResolvedValue(null);
	mocks.db.ttsUserSetting.upsert.mockResolvedValue({});
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe('TtsUserSettingsService', () => {
	it('returns the off default when no row exists', async () => {
		await expect(new TtsUserSettingsService().get('g1', 'u1')).resolves.toEqual(DEFAULT_TTS_USER_PRESET);
		expect(mocks.db.ttsUserSetting.findUnique).toHaveBeenCalledWith({ where: { guildId_userId: { guildId: 'g1', userId: 'u1' } } });
	});

	it('maps an existing row and caches it (single DB read)', async () => {
		mocks.db.ttsUserSetting.findUnique.mockResolvedValue({ guildId: 'g1', userId: 'u1', enabled: true, voice: 'melo:KR', speed: 1.5, pitch: -2 });
		const service = new TtsUserSettingsService();
		await expect(service.get('g1', 'u1')).resolves.toEqual({ enabled: true, voice: 'melo:KR', speed: 1.5, pitch: -2 });
		await service.get('g1', 'u1');
		expect(mocks.db.ttsUserSetting.findUnique).toHaveBeenCalledTimes(1);
	});

	it('fails safe to the off default when the DB read throws', async () => {
		mocks.db.ttsUserSetting.findUnique.mockRejectedValue(new Error('db down'));
		await expect(new TtsUserSettingsService().get('g1', 'u1')).resolves.toEqual(DEFAULT_TTS_USER_PRESET);
	});

	it('upserts the merged preset and refreshes the cache', async () => {
		mocks.db.ttsUserSetting.findUnique.mockResolvedValue({ guildId: 'g1', userId: 'u1', enabled: true, voice: 'melo:KR', speed: 1.5, pitch: -2 });
		const service = new TtsUserSettingsService();
		await expect(service.set('g1', 'u1', { speed: 2 })).resolves.toBe(true);
		expect(mocks.db.ttsUserSetting.upsert).toHaveBeenCalledWith({
			where: { guildId_userId: { guildId: 'g1', userId: 'u1' } },
			create: { guildId: 'g1', userId: 'u1', enabled: true, voice: 'melo:KR', speed: 2, pitch: -2 },
			update: { enabled: true, voice: 'melo:KR', speed: 2, pitch: -2 }
		});
		// 캐시가 갱신됐는지 — DB를 다시 읽지 않는다
		await expect(service.get('g1', 'u1')).resolves.toMatchObject({ speed: 2 });
		expect(mocks.db.ttsUserSetting.findUnique).toHaveBeenCalledTimes(1);
	});

	it('clears a preset field when explicitly set to null', async () => {
		mocks.db.ttsUserSetting.findUnique.mockResolvedValue(null);
		const service = new TtsUserSettingsService();
		await expect(service.set('g1', 'u1', { enabled: true, voice: 'melo:KR' })).resolves.toBe(true);
		await expect(service.set('g1', 'u1', { voice: null })).resolves.toBe(true);
		expect(mocks.db.ttsUserSetting.upsert).toHaveBeenLastCalledWith(
			expect.objectContaining({ update: expect.objectContaining({ enabled: true, voice: null }) })
		);
	});

	it('returns false when the upsert throws', async () => {
		mocks.db.ttsUserSetting.upsert.mockRejectedValue(new Error('db down'));
		await expect(new TtsUserSettingsService().set('g1', 'u1', { enabled: true })).resolves.toBe(false);
	});
});
