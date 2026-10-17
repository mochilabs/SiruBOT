import { container } from '@sapphire/framework';
import { PermissionsBitField } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlayerWebResponder } from './playerWebResponder.ts';
import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';

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
		const member = { permissions: new PermissionsBitField(flags), voice: { channelId: null } };
		Object.assign(container, {
			client: { guilds: { cache: new Map([['guild', { members: { cache: new Map([['user', member]]) }, channels: { cache: new Map() } }]]) } },
			guildService: { hasDJRole: vi.fn().mockResolvedValue(false) },
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
		const member = { permissions: new PermissionsBitField(PermissionsBitField.Flags.ManageGuild), voice: { channelId: null } };
		Object.assign(container, {
			client: { guilds: { cache: new Map([['guild', { members: { cache: new Map([['user', member]]) }, channels: { cache: new Map() } }]]) } },
			audio: { getPlayer: vi.fn().mockReturnValue(null) },
			guildService: { hasDJRole: vi.fn().mockResolvedValue(false) },
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
		const member = { permissions: new PermissionsBitField(PermissionsBitField.Flags.ManageGuild), voice: { channelId: null } };
		Object.assign(container, {
			client: { guilds: { cache: new Map([['guild', { members: { cache: new Map([['user', member]]) }, channels: { cache: new Map() } }]]) } },
			guildService: { hasDJRole: vi.fn().mockResolvedValue(false) },
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
});
