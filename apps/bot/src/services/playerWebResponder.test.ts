import { container } from '@sapphire/framework';
import { PermissionsBitField } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../lib/appError.ts';
import { PlayerWebResponder } from './playerWebResponder.ts';
import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
vi.mock('./guildSettings/playback.ts', async (orig) => ({ ...(await orig()), hasDJRole: vi.fn().mockResolvedValue(false) }));

const harness = vi.hoisted(() => ({ receive: null as null | ((raw: string) => void) }));
vi.mock('@sirubot/utils', async (original) => ({
	...(await original<typeof import('@sirubot/utils')>()),
	ManagedRedisSubscriber: class {
		constructor(options: { bindings: { onMessage: (raw: string) => void }[] }) {
			harness.receive = options.bindings[0].onMessage;
		}
		async start() {}
	}
}));
vi.mock('../modules/audio/view/play.ts', () => ({}));

/** actorFromMember가 읽는 필드까지 갖춘 최소 멤버 */
const memberBase = { id: 'user', guild: { id: 'guild' }, roles: { cache: new Map() }, voice: { channelId: null, channel: null } };

describe('web player permissions', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	it.each([
		['manager', PermissionsBitField.Flags.ManageGuild, true],
		['administrator', PermissionsBitField.Flags.Administrator, true],
		['member', 0n, false]
	])('responds to voice context for a real %s permission object without throwing', async (_, flags, canControl) => {
		const publish = vi.fn();
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		const member = { ...memberBase, permissions: new PermissionsBitField(flags) };
		Object.assign(container, {
			client: { guilds: { cache: new Map([['guild', { members: { cache: new Map([['user', member]]) }, channels: { cache: new Map() } }]]) } },
			guildService: {},
			redisStore: { publishPlayerWebResponse: publish }
		});
		await new PlayerWebResponder(logger).start('redis://fixture');
		harness.receive!(
			JSON.stringify({ requestId: 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e', guildId: 'guild', userId: 'user', kind: 'voice-context' })
		);
		await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
		expect(JSON.parse(publish.mock.calls[0][0])).toMatchObject({ voice: { canControl, inVoice: false } });
		expect(logger.error).not.toHaveBeenCalled();
	});
	it.each(['search', 'play', 'control'] as const)('checks real permissions before %s without the generic exception', async (kind) => {
		const publish = vi.fn();
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		const member = { ...memberBase, permissions: new PermissionsBitField(PermissionsBitField.Flags.ManageGuild) };
		Object.assign(container, {
			client: { guilds: { cache: new Map([['guild', { members: { cache: new Map([['user', member]]) }, channels: { cache: new Map() } }]]) } },
			audio: { getPlayer: vi.fn().mockReturnValue(null) },
			guildService: {},
			redisStore: { publishPlayerWebResponse: publish }
		});
		await new PlayerWebResponder(logger).start('redis://fixture');
		harness.receive!(
			JSON.stringify({
				requestId: 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e',
				guildId: 'guild',
				userId: 'user',
				kind,
				...(kind === 'search' ? { query: 'test' } : kind === 'play' ? { uri: 'https://example.com/track' } : { action: 'pause' })
			})
		);
		await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
		expect(JSON.parse(publish.mock.calls[0][0]).error).not.toContain('처리 중 오류가 발생');
		expect(logger.error).not.toHaveBeenCalled();
	});
	it('rejects unsigned requests and accepts signed ones when the signing key is set (SEC-006)', async () => {
		const publish = vi.fn();
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		const member = { ...memberBase, permissions: new PermissionsBitField(PermissionsBitField.Flags.ManageGuild) };
		Object.assign(container, {
			client: { guilds: { cache: new Map([['guild', { members: { cache: new Map([['user', member]]) }, channels: { cache: new Map() } }]]) } },
			guildService: {},
			redisStore: { publishPlayerWebResponse: publish }
		});
		await new PlayerWebResponder(logger, 'test-key').start('redis://fixture');
		const payload = { requestId: 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e', guildId: 'guild', userId: 'user', kind: 'voice-context' };

		// 서명 없는 메시지는 처리 자체가 되지 않아요 (Redis 쓰기 권한 보유자의 위조 요청 거부)
		harness.receive!(JSON.stringify(payload));
		await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledWith('웹 플레이어 요청 거부: 서명 검증 실패'));
		expect(publish).not.toHaveBeenCalled();

		// 서명된 메시지는 처리돼요
		harness.receive!(wrapRedisMessage('test-key', payload));
		await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
	});

	describe('control (공용 음악 제어 유스케이스 경유)', () => {
		const REQUEST_ID = 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e';

		async function control(request: Record<string, unknown>, music: Record<string, unknown>) {
			const publish = vi.fn();
			const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
			const member = { ...memberBase, permissions: new PermissionsBitField(0n) };
			Object.assign(container, {
				client: {
					guilds: { cache: new Map([['guild', { members: { cache: new Map([['user', member]]) }, channels: { cache: new Map() } }]]) }
				},
				audio: { getPlayer: vi.fn().mockReturnValue(null) },
				guildService: {},
				music,
				redisStore: { publishPlayerWebResponse: publish }
			});
			await new PlayerWebResponder(logger).start('redis://fixture');
			harness.receive!(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild', userId: 'user', kind: 'control', ...request }));
			await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
			return { response: JSON.parse(publish.mock.calls[0][0]), logger };
		}

		it('volume은 일반 멤버의 요청도 유스케이스에 맡기고 성공 응답을 보내요 (관리 권한 선검사 없음)', async () => {
			const setVolume = vi.fn().mockResolvedValue({ volume: 90, playing: true });
			const { response, logger } = await control({ action: 'volume', value: 90 }, { setVolume });
			expect(setVolume).toHaveBeenCalledWith(expect.objectContaining({ guildId: 'guild', userId: 'user' }), 90);
			expect(response.error).toBeUndefined();
			expect(logger.error).not.toHaveBeenCalled();
		});

		it('유스케이스의 AppError는 앱 이모지 마크업을 뗀 같은 안내 문구로 응답해요', async () => {
			const setVolume = vi
				.fn()
				.mockRejectedValue(new AppError('forbidden', '<:link:123> 이 명령어를 사용하려면 봇과 같은 음성 채널에 연결해야 해요.'));
			const { response, logger } = await control({ action: 'volume', value: 90 }, { setVolume });
			expect(response.error).toBe('이 명령어를 사용하려면 봇과 같은 음성 채널에 연결해야 해요.');
			expect(logger.error).not.toHaveBeenCalled();
		});
	});
});
