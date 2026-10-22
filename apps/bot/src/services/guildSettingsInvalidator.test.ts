import { beforeEach, describe, expect, it, vi } from 'vitest';

const { bindings, clearGuildCustomCommandsCache, syncGuildSlashCommands, containerStub } = vi.hoisted(() => ({
	bindings: [] as Array<{ channel: string; onMessage: (raw: string) => void }>,
	clearGuildCustomCommandsCache: vi.fn(),
	syncGuildSlashCommands: vi.fn(async () => undefined),
	containerStub: {
		audio: { getPlayer: vi.fn() },
		guildService: { getMixerSettings: vi.fn() },
		mixerService: { setCrossfade: vi.fn(), preloadUpcoming: vi.fn(), clearNext: vi.fn() }
	}
}));

vi.mock('@sirubot/utils', () => ({
	GUILD_SETTINGS_INVALIDATE_CHANNEL: 'sirubot:guild-settings:invalidate',
	ManagedRedisSubscriber: class {
		public constructor(options: { bindings: Array<{ channel: string; onMessage: (raw: string) => void }> }) {
			bindings.push(...options.bindings);
		}
		public start = vi.fn(async () => undefined);
		public stop = vi.fn(async () => undefined);
	}
}));
vi.mock('@sapphire/framework', () => ({ container: containerStub }));
vi.mock('./customCommands/store.ts', () => ({ clearGuildCustomCommandsCache }));
vi.mock('./customCommands/slashRegistry.ts', () => ({ syncGuildSlashCommands }));

import { GuildSettingsInvalidator } from './guildSettingsInvalidator.ts';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function makeService() {
	return new GuildSettingsInvalidator(logger);
}

beforeEach(() => {
	vi.clearAllMocks();
	bindings.length = 0;
	containerStub.audio.getPlayer.mockReturnValue(null);
	containerStub.guildService.getMixerSettings.mockResolvedValue({ gaplessEnabled: true, crossfadeEnabled: true, crossfadeMs: 600 });
});

describe('GuildSettingsInvalidator (pub/sub 캐시 무효화)', () => {
	it('유효한 페이로드는 길드 캐시·커스텀 명령어 캐시·슬래시 등록을 함께 무효화한다', async () => {
		const service = makeService();
		const guildService = { invalidate: vi.fn() };
		await service.start('redis://localhost:6379', guildService as never);

		expect(bindings).toHaveLength(1);
		expect(bindings[0]!.channel).toBe('sirubot:guild-settings:invalidate');
		bindings[0]!.onMessage(JSON.stringify({ guildId: '1234567890' }));

		expect(guildService.invalidate).toHaveBeenCalledWith('1234567890');
		expect(clearGuildCustomCommandsCache).toHaveBeenCalledWith('1234567890');
		expect(syncGuildSlashCommands).toHaveBeenCalledWith('1234567890', logger);
	});

	it('형식이 깨진 페이로드는 조용히 무시한다', async () => {
		const service = makeService();
		const guildService = { invalidate: vi.fn() };
		await service.start('redis://localhost:6379', guildService as never);
		const onMessage = bindings[0]!.onMessage;

		onMessage('not json');
		onMessage(JSON.stringify({ guildId: '' }));
		onMessage(JSON.stringify({ guildId: 'x'.repeat(40) }));
		onMessage(JSON.stringify({ noGuildId: true }));

		expect(guildService.invalidate).not.toHaveBeenCalled();
		expect(clearGuildCustomCommandsCache).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('형식 불일치'));
	});

	it('reason=mixer면 무효화와 함께 재생 중 플레이어에 믹서 설정을 밀어 넣는다', async () => {
		const service = makeService();
		await service.start('redis://localhost:6379', { invalidate: vi.fn() } as never);
		const player = { guildId: 'g2' };
		containerStub.audio.getPlayer.mockReturnValue(player);

		bindings[0]!.onMessage(JSON.stringify({ guildId: 'g2', reason: 'mixer' }));

		await vi.waitFor(() => expect(containerStub.guildService.getMixerSettings).toHaveBeenCalledWith('g2'));
		await vi.waitFor(() => expect(containerStub.mixerService.setCrossfade).toHaveBeenCalledWith(player, true, 600));
		await vi.waitFor(() => expect(containerStub.mixerService.preloadUpcoming).toHaveBeenCalledWith(player));
	});

	it('믹서 사유가 아니면 플레이어에는 손대지 않는다', async () => {
		const service = makeService();
		await service.start('redis://localhost:6379', { invalidate: vi.fn() } as never);
		containerStub.audio.getPlayer.mockReturnValue({ guildId: 'g3' });

		bindings[0]!.onMessage(JSON.stringify({ guildId: 'g3' }));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(containerStub.guildService.getMixerSettings).not.toHaveBeenCalled();
		expect(containerStub.mixerService.setCrossfade).not.toHaveBeenCalled();
	});

	it('REDIS_URL 미설정이면 구독 없이 조용히 시작한다', async () => {
		const service = makeService();
		await service.start('   ', { invalidate: vi.fn() } as never);

		expect(bindings).toHaveLength(0);
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('REDIS_URL 미설정'));
	});
});
