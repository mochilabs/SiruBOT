import { container } from '@sapphire/framework';
import { PermissionsBitField } from 'discord.js';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { AppError } from '../../../lib/appError.ts';
import type { RedisRuntime } from '../../../lib/redisResponder.ts';
import { createPlayerWebResponder } from './playerWeb.ts';
import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
vi.mock('../../../services/guildSettings/playback.ts', async (orig) => ({
	...(await orig()),
	hasDJRole: vi.fn().mockResolvedValue(false),
	getDJRole: vi.fn().mockResolvedValue(null)
}));

/** 응답자 바인딩에 요청을 흘려 넣고 퍼블리시된 응답을 관찰하는 하네스 — publish는 (채널, 본문, 라벨)로 받아요 */
const harness = {
	receive: null as null | ((raw: string) => void)
};
function start(logger: RedisRuntime['logger'], publish: Mock, signingKey = '') {
	const binding = createPlayerWebResponder();
	const runtime: RedisRuntime = {
		logger,
		signingKey,
		publisher: { publish: publish as RedisRuntime['publisher']['publish'] },
		resolveGuild: (id) => container.client.guilds.cache.get(id)
	};
	harness.receive = (raw) => void binding.handle(raw, runtime);
}
vi.mock('../discord/views/play.ts', () => ({}));

/** actorFromMember가 읽는 필드까지 갖춘 최소 멤버 */
const memberBase = { id: 'user', guild: { id: 'guild' }, roles: { cache: new Map() }, voice: { channelId: null, channel: null } };

describe('web player permissions', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	it.each([
		// 봇이 음성 채널에 없고 요청자도 미접속 — 원격 권한자는 제어는 되지만 곡 추가는 들어갈 채널이 없어 안 돼요
		['manager', PermissionsBitField.Flags.ManageGuild, null, null, { canControl: true, canPlay: false, inVoice: false }],
		['administrator', PermissionsBitField.Flags.Administrator, null, null, { canControl: true, canPlay: false, inVoice: false }],
		['member', 0n, null, null, { canControl: false, canPlay: false, inVoice: false }],
		// 봇이 재생 중 — 원격 권한자는 채널 밖에서도 둘 다, 일반 사용자는 같은 채널에서만 돼요
		['remote manager', PermissionsBitField.Flags.ManageGuild, null, 'vc-bot', { canControl: true, canPlay: true, inVoice: false }],
		['member in the bot channel', 0n, 'vc-bot', 'vc-bot', { canControl: true, canPlay: true, inVoice: true }],
		['member in another channel', 0n, 'vc-other', 'vc-bot', { canControl: false, canPlay: false, inVoice: true }]
	])('responds to voice context for a real %s permission object without throwing', async (_, flags, memberChannel, botChannel, voice) => {
		const publish = vi.fn();
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		const member = {
			...memberBase,
			voice: { channelId: memberChannel, channel: memberChannel ? { members: { filter: () => ({ size: 2 }) } } : null },
			permissions: new PermissionsBitField(flags)
		};
		Object.assign(container, {
			client: {
				guilds: {
					cache: new Map([
						[
							'guild',
							{
								id: 'guild',
								members: { cache: new Map([['user', member]]), me: { voice: { channelId: botChannel } } },
								channels: { cache: new Map() }
							}
						]
					])
				}
			},
			audio: { getPlayer: vi.fn().mockReturnValue(null) },
			guildService: {}
		});
		start(logger, publish);
		harness.receive!(
			JSON.stringify({ requestId: 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e', guildId: 'guild', userId: 'user', kind: 'voice-context' })
		);
		await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
		expect(publish.mock.calls[0][1]).toMatchObject({ voice });
		expect(logger.error).not.toHaveBeenCalled();
	});
	it.each(['search', 'play', 'control'] as const)('checks real permissions before %s without the generic exception', async (kind) => {
		const publish = vi.fn();
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		const member = { ...memberBase, permissions: new PermissionsBitField(PermissionsBitField.Flags.ManageGuild) };
		Object.assign(container, {
			client: {
				guilds: {
					cache: new Map([['guild', { id: 'guild', members: { cache: new Map([['user', member]]) }, channels: { cache: new Map() } }]])
				}
			},
			audio: { getPlayer: vi.fn().mockReturnValue(null) },
			music: { skipNow: vi.fn().mockRejectedValue(new AppError('not_found', '현재 곡이 없어요.')) },
			guildService: {}
		});
		start(logger, publish);
		harness.receive!(
			JSON.stringify({
				requestId: 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e',
				guildId: 'guild',
				userId: 'user',
				kind,
				...(kind === 'search' ? { query: 'test' } : kind === 'play' ? { uri: 'https://example.com/track' } : { action: 'skip' })
			})
		);
		await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
		expect(publish.mock.calls[0][1].error).not.toContain('처리 중 오류가 발생');
		expect(logger.error).not.toHaveBeenCalled();
	});
	it('rejects unsigned requests and accepts signed ones when the signing key is set (SEC-006)', async () => {
		const publish = vi.fn();
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		const member = { ...memberBase, permissions: new PermissionsBitField(PermissionsBitField.Flags.ManageGuild) };
		Object.assign(container, {
			client: {
				guilds: {
					cache: new Map([['guild', { id: 'guild', members: { cache: new Map([['user', member]]) }, channels: { cache: new Map() } }]])
				}
			},
			audio: { getPlayer: vi.fn().mockReturnValue(null) },
			guildService: {}
		});
		start(logger, publish, 'test-key');
		const payload = { requestId: 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e', guildId: 'guild', userId: 'user', kind: 'voice-context' };

		// 서명 없는 메시지는 처리 자체가 되지 않아요 (Redis 쓰기 권한 보유자의 위조 요청 거부)
		harness.receive!(JSON.stringify(payload));
		await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledWith('웹 플레이어 요청 거부: 서명 검증 실패'));
		expect(publish).not.toHaveBeenCalled();

		// 서명된 메시지는 처리돼요
		harness.receive!(wrapRedisMessage('test-key', payload));
		await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
	});

	it('kind별 상세 스키마가 어긋나면 요청 형식 안내로 응답해요 (타임아웃 대신)', async () => {
		const publish = vi.fn();
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		Object.assign(container, {
			client: { guilds: { cache: new Map([['guild', { id: 'guild', members: { cache: new Map() }, channels: { cache: new Map() } }]]) } },
			guildService: {}
		});
		start(logger, publish);
		harness.receive!(JSON.stringify({ requestId: 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e', guildId: 'guild', userId: 'user', kind: 'search' }));
		await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
		expect(publish.mock.calls[0][0]).toBe('sirubot:player-web:response');
		expect(publish.mock.calls[0][1]).toEqual({
			requestId: 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e',
			guildId: 'guild',
			kind: 'search',
			error: '요청 형식이 올바르지 않아요.'
		});
	});

	it('보유하지 않은 길드의 요청은 응답하지 않아요', async () => {
		const publish = vi.fn();
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		Object.assign(container, { client: { guilds: { cache: new Map() } } });
		start(logger, publish);
		harness.receive!(
			JSON.stringify({ requestId: 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e', guildId: 'other', userId: 'user', kind: 'voice-context' })
		);
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(publish).not.toHaveBeenCalled();
	});

	describe('control (공용 음악 제어 유스케이스 경유)', () => {
		const REQUEST_ID = 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e';

		async function control(request: Record<string, unknown>, music: Record<string, unknown>, player: unknown = null) {
			const publish = vi.fn();
			const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
			const member = { ...memberBase, permissions: new PermissionsBitField(0n) };
			Object.assign(container, {
				client: {
					guilds: {
						cache: new Map([['guild', { id: 'guild', members: { cache: new Map([['user', member]]) }, channels: { cache: new Map() } }]])
					}
				},
				audio: { getPlayer: vi.fn().mockReturnValue(player) },
				guildService: {},
				music
			});
			start(logger, publish);
			harness.receive!(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild', userId: 'user', kind: 'control', ...request }));
			await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
			return { response: publish.mock.calls[0][1], logger };
		}

		it('volume은 일반 멤버의 요청도 유스케이스에 맡기고 성공 응답을 보내요 (관리 권한 선검사 없음)', async () => {
			const setVolume = vi.fn().mockResolvedValue({ volume: 90, playing: true });
			const { response, logger } = await control({ action: 'volume', value: 90 }, { setVolume });
			expect(setVolume).toHaveBeenCalledWith(expect.objectContaining({ guildId: 'guild', userId: 'user' }), 90);
			expect(response.error).toBeUndefined();
			expect(logger.error).not.toHaveBeenCalled();
		});

		it('skip은 즉시 건너뛰기 유스케이스 하나만 호출하고 성공 응답을 보내요 (투표·관리 권한 선검사 없음)', async () => {
			const skipNow = vi.fn().mockResolvedValue({ skipped: true });
			const { response } = await control({ action: 'skip' }, { skipNow });
			expect(skipNow).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ guildId: 'guild', userId: 'user' }));
			expect(response.error).toBeUndefined();
		});

		it('skip의 거절은 앱 이모지 마크업을 뗀 안내 문구로 응답해요', async () => {
			const skipNow = vi.fn().mockRejectedValue(new AppError('not_found', '<:error:1> 대기열에 곡이 없어요.'));
			const { response, logger } = await control({ action: 'skip' }, { skipNow });
			expect(response.error).toBe('대기열에 곡이 없어요.');
			expect(logger.error).not.toHaveBeenCalled();
		});

		it.each(['pause', 'resume', 'stop'] as const)('%s는 해당 유스케이스 하나만 호출하고 성공 응답을 보내요', async (action) => {
			const music = {
				pause: vi.fn().mockResolvedValue({ paused: true }),
				resume: vi.fn().mockResolvedValue({ resumed: true }),
				stop: vi.fn().mockResolvedValue({ stopped: true })
			};
			const { response } = await control({ action }, music);
			expect(music[action]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ guildId: 'guild', userId: 'user' }));
			expect(response.error).toBeUndefined();
		});

		it.each([
			['off', 'track'],
			['track', 'queue'],
			['queue', 'off']
		])('repeat는 플레이어의 반복 모드가 %s이면 %s로 순환시켜요', async (current, expected) => {
			const setRepeat = vi.fn().mockResolvedValue({ mode: expected, playing: true });
			const { response } = await control({ action: 'repeat' }, { setRepeat }, { repeatMode: current });
			expect(setRepeat).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ guildId: 'guild' }), expected);
			expect(response.error).toBeUndefined();
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
