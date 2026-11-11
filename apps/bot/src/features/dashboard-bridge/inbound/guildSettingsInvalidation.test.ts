import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clearGuildCustomCommandsCache, syncGuildSlashCommands, containerStub } = vi.hoisted(() => ({
	clearGuildCustomCommandsCache: vi.fn(),
	syncGuildSlashCommands: vi.fn(async () => undefined),
	containerStub: {
		audio: { getPlayer: vi.fn() },
		guildService: { invalidate: vi.fn() },
		guildMixer: { getMixerSettings: vi.fn() },
		mixerService: { pushCrossfadeConfig: vi.fn(), preloadUpcoming: vi.fn(), clearNext: vi.fn() }
	}
}));

vi.mock('@sapphire/framework', () => ({ container: containerStub }));
vi.mock('../../custom-commands/application/store.ts', () => ({ clearGuildCustomCommandsCache }));
vi.mock('../../../services/guildSettings/mixer.ts', () => containerStub.guildMixer);
vi.mock('../../custom-commands/application/slashRegistry.ts', () => ({ syncGuildSlashCommands }));

import type { RedisRuntime } from '../../../lib/redisResponder.ts';
import { createGuildSettingsInvalidationListener } from './guildSettingsInvalidation.ts';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

const runtime: RedisRuntime = { logger, signingKey: 'ignored-for-unsigned', publisher: { publish: vi.fn() }, resolveGuild: () => undefined };
const listener = createGuildSettingsInvalidationListener();
/** 수신 메시지를 흘려 넣고 핸들러가 끝날 때까지 기다려요 */
const receive = (payload: unknown) => listener.handle(typeof payload === 'string' ? payload : JSON.stringify(payload), runtime);

beforeEach(() => {
	vi.clearAllMocks();
	containerStub.audio.getPlayer.mockReturnValue(null);
	containerStub.guildMixer.getMixerSettings.mockResolvedValue({
		gaplessEnabled: true,
		crossfadeEnabled: true,
		crossfadeMs: 600,
		normalizationEnabled: false
	});
});

describe('길드 설정 무효화 리스너 (pub/sub 캐시 무효화)', () => {
	it('유효한 페이로드는 길드 캐시·커스텀 명령어 캐시·슬래시 등록을 함께 무효화한다', async () => {
		expect(listener.channel).toBe('sirubot:guild-settings:invalidate');
		await receive({ guildId: '1234567890' });

		expect(containerStub.guildService.invalidate).toHaveBeenCalledWith('1234567890');
		expect(clearGuildCustomCommandsCache).toHaveBeenCalledWith('1234567890');
		expect(syncGuildSlashCommands).toHaveBeenCalledWith('1234567890', logger);
	});

	it('형식이 깨진 페이로드는 조용히 무시한다', async () => {
		await receive('not json');
		await receive({ guildId: '' });
		await receive({ guildId: 'x'.repeat(40) });
		await receive({ noGuildId: true });

		expect(containerStub.guildService.invalidate).not.toHaveBeenCalled();
		expect(clearGuildCustomCommandsCache).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('형식 불일치'));
	});

	it('reason=mixer면 무효화와 함께 재생 중 플레이어에 믹서 설정을 밀어 넣는다', async () => {
		const player = { guildId: 'g2' };
		containerStub.audio.getPlayer.mockReturnValue(player);

		void receive({ guildId: 'g2', reason: 'mixer' });

		await vi.waitFor(() => expect(containerStub.guildMixer.getMixerSettings).toHaveBeenCalledWith(expect.anything(), 'g2'));
		await vi.waitFor(() => expect(containerStub.mixerService.pushCrossfadeConfig).toHaveBeenCalledWith(player));
		await vi.waitFor(() => expect(containerStub.mixerService.preloadUpcoming).toHaveBeenCalledWith(player, { force: true }));
	});

	it('모든 설정 적용이 끝난 뒤 같은 다음 곡도 강제로 다시 준비한다', async () => {
		const player = { guildId: 'g2' };
		containerStub.audio.getPlayer.mockReturnValue(player);
		let finishConfig!: () => void;
		containerStub.mixerService.pushCrossfadeConfig.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finishConfig = resolve;
			})
		);
		void receive({ guildId: 'g2', reason: 'mixer' });
		await vi.waitFor(() => expect(containerStub.mixerService.pushCrossfadeConfig).toHaveBeenCalledWith(player));
		expect(containerStub.mixerService.preloadUpcoming).not.toHaveBeenCalled();
		finishConfig();
		await vi.waitFor(() => expect(containerStub.mixerService.preloadUpcoming).toHaveBeenCalledWith(player, { force: true }));
	});

	it('믹서 사유가 아니면 플레이어에는 손대지 않는다', async () => {
		containerStub.audio.getPlayer.mockReturnValue({ guildId: 'g3' });

		void receive({ guildId: 'g3' });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(containerStub.guildMixer.getMixerSettings).not.toHaveBeenCalled();
		expect(containerStub.mixerService.pushCrossfadeConfig).not.toHaveBeenCalled();
	});

	it('서명 없이 퍼블리시되는 채널이라 서명 키가 있어도 평문을 받아요', async () => {
		await receive({ guildId: 'g-plain' });
		expect(containerStub.guildService.invalidate).toHaveBeenCalledWith('g-plain');
	});

	it('gapless=false, automix=true 설정 시 preloadUpcoming이 발생하고 clearNext는 호출되지 않는다', async () => {
		const player = { guildId: 'g-automix' };
		containerStub.audio.getPlayer.mockReturnValue(player);
		containerStub.guildMixer.getMixerSettings.mockResolvedValueOnce({
			gaplessEnabled: false,
			crossfadeEnabled: false,
			automixEnabled: true,
			crossfadeMs: 600,
			normalizationEnabled: false
		});

		void receive({ guildId: 'g-automix', reason: 'mixer' });

		await vi.waitFor(() => expect(containerStub.guildMixer.getMixerSettings).toHaveBeenCalledWith(expect.anything(), 'g-automix'));
		await vi.waitFor(() => expect(containerStub.mixerService.pushCrossfadeConfig).toHaveBeenCalledWith(player));
		await vi.waitFor(() => {
			expect(containerStub.mixerService.clearNext).not.toHaveBeenCalled();
			expect(containerStub.mixerService.preloadUpcoming).toHaveBeenCalledWith(player, { force: true });
		});
	});

	it('모든 전환 설정이 꺼져 있으면 clearNext가 발생하고 preloadUpcoming은 호출되지 않는다', async () => {
		const player = { guildId: 'g-all-off' };
		containerStub.audio.getPlayer.mockReturnValue(player);
		containerStub.guildMixer.getMixerSettings.mockResolvedValueOnce({
			gaplessEnabled: false,
			crossfadeEnabled: false,
			automixEnabled: false,
			crossfadeMs: 600,
			normalizationEnabled: false
		});

		void receive({ guildId: 'g-all-off', reason: 'mixer' });

		await vi.waitFor(() => expect(containerStub.guildMixer.getMixerSettings).toHaveBeenCalledWith(expect.anything(), 'g-all-off'));
		await vi.waitFor(() => expect(containerStub.mixerService.pushCrossfadeConfig).toHaveBeenCalledWith(player));
		await vi.waitFor(() => expect(containerStub.mixerService.clearNext).toHaveBeenCalledWith(player, { force: true }));
		expect(containerStub.mixerService.preloadUpcoming).not.toHaveBeenCalled();
	});
});
