import { describe, expect, it } from 'vitest';
import {
	BOT_ADMIN_REQUEST_CHANNEL,
	BOT_ADMIN_RESPONSE_CHANNEL,
	BOT_PROFILE_REFRESH_CHANNEL,
	BOT_PROFILE_SET_CHANNEL,
	botProfileStateChannel,
	GUILD_DATA_REQUEST_CHANNEL,
	GUILD_DATA_RESPONSE_CHANNEL,
	GUILD_SETTINGS_INVALIDATE_CHANNEL,
	guildIdFromPlayerStateChannel,
	JTC_SETUP_REQUEST_CHANNEL,
	JTC_SETUP_RESPONSE_CHANNEL,
	MEMBER_GREETING_SEND_CHANNEL,
	memberGreetingStateChannel,
	PANEL_POST_REQUEST_CHANNEL,
	PANEL_POST_RESPONSE_CHANNEL,
	PLAYER_STATE_CHANNEL_PATTERN,
	PLAYER_WEB_REQUEST_CHANNEL,
	PLAYER_WEB_RESPONSE_CHANNEL,
	playerStateChannel,
	ROLE_VALIDATION_REQUEST_CHANNEL,
	ROLE_VALIDATION_RESPONSE_CHANNEL,
	SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL,
	SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL
} from './redisChannels.ts';
import {
	botAdminRpc,
	botProfileRefreshEvent,
	botProfileSetEvent,
	botProfileStateEvent,
	defineRedisEvent,
	defineRedisGuildEvent,
	defineRedisRpc,
	guildDataRpc,
	guildSettingsInvalidateEvent,
	jtcSetupRpc,
	memberGreetingSendEvent,
	memberGreetingStateEvent,
	panelPostRpc,
	pickRpcCorrelation,
	playerStateEvent,
	playerWebRpc,
	roleValidationRpc,
	socialWebhookCreateRpc
} from './redisContract.ts';
import { z } from 'zod';

describe('Redis 계약의 채널 문자열', () => {
	// 롤링 배포 중 구·신 프로세스가 같은 채널로 통신하므로 와이어 문자열은 리터럴로 고정해요.
	it('RPC 채널이 배포된 값과 바이트 단위로 같아요', () => {
		expect([guildDataRpc.requestChannel, guildDataRpc.responseChannel]).toEqual(['sirubot:guild-data:request', 'sirubot:guild-data:response']);
		expect([playerWebRpc.requestChannel, playerWebRpc.responseChannel]).toEqual(['sirubot:player-web:request', 'sirubot:player-web:response']);
		expect([jtcSetupRpc.requestChannel, jtcSetupRpc.responseChannel]).toEqual(['sirubot:jtc-setup:request', 'sirubot:jtc-setup:response']);
		expect([socialWebhookCreateRpc.requestChannel, socialWebhookCreateRpc.responseChannel]).toEqual([
			'sirubot:social:webhook-create:request',
			'sirubot:social:webhook-create:response'
		]);
		expect([botAdminRpc.requestChannel, botAdminRpc.responseChannel]).toEqual(['sirubot:bot-admin:request', 'sirubot:bot-admin:response']);
		expect([panelPostRpc.requestChannel, panelPostRpc.responseChannel]).toEqual(['sirubot:panel-post:request', 'sirubot:panel-post:response']);
		expect([roleValidationRpc.requestChannel, roleValidationRpc.responseChannel]).toEqual([
			'sirubot:role-validation:request',
			'sirubot:role-validation:response'
		]);
	});

	it('RPC 채널이 기존 상수와 같아요', () => {
		expect(guildDataRpc.requestChannel).toBe(GUILD_DATA_REQUEST_CHANNEL);
		expect(guildDataRpc.responseChannel).toBe(GUILD_DATA_RESPONSE_CHANNEL);
		expect(playerWebRpc.requestChannel).toBe(PLAYER_WEB_REQUEST_CHANNEL);
		expect(playerWebRpc.responseChannel).toBe(PLAYER_WEB_RESPONSE_CHANNEL);
		expect(jtcSetupRpc.requestChannel).toBe(JTC_SETUP_REQUEST_CHANNEL);
		expect(jtcSetupRpc.responseChannel).toBe(JTC_SETUP_RESPONSE_CHANNEL);
		expect(socialWebhookCreateRpc.requestChannel).toBe(SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL);
		expect(socialWebhookCreateRpc.responseChannel).toBe(SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL);
		expect(botAdminRpc.requestChannel).toBe(BOT_ADMIN_REQUEST_CHANNEL);
		expect(botAdminRpc.responseChannel).toBe(BOT_ADMIN_RESPONSE_CHANNEL);
		expect(panelPostRpc.requestChannel).toBe(PANEL_POST_REQUEST_CHANNEL);
		expect(panelPostRpc.responseChannel).toBe(PANEL_POST_RESPONSE_CHANNEL);
		expect(roleValidationRpc.requestChannel).toBe(ROLE_VALIDATION_REQUEST_CHANNEL);
		expect(roleValidationRpc.responseChannel).toBe(ROLE_VALIDATION_RESPONSE_CHANNEL);
	});

	it('이벤트 채널이 배포된 값·기존 상수와 같아요', () => {
		expect(guildSettingsInvalidateEvent.channel).toBe('sirubot:guild-settings:invalidate');
		expect(guildSettingsInvalidateEvent.channel).toBe(GUILD_SETTINGS_INVALIDATE_CHANNEL);
		expect(botProfileSetEvent.channel).toBe('sirubot:bot-profile:set');
		expect(botProfileSetEvent.channel).toBe(BOT_PROFILE_SET_CHANNEL);
		expect(botProfileRefreshEvent.channel).toBe('sirubot:bot-profile:refresh');
		expect(botProfileRefreshEvent.channel).toBe(BOT_PROFILE_REFRESH_CHANNEL);
		expect(memberGreetingSendEvent.channel).toBe('sirubot:member-greeting:send');
		expect(memberGreetingSendEvent.channel).toBe(MEMBER_GREETING_SEND_CHANNEL);
	});

	it('길드별 상태 채널이 기존 빌더와 같아요', () => {
		expect(botProfileStateEvent.channel('123')).toBe('sirubot:bot-profile:state:123');
		expect(botProfileStateEvent.channel('123')).toBe(botProfileStateChannel('123'));
		expect(memberGreetingStateEvent.channel('123')).toBe('sirubot:member-greeting:state:123');
		expect(memberGreetingStateEvent.channel('123')).toBe(memberGreetingStateChannel('123'));
		expect(playerStateEvent.channel('123')).toBe('sirubot:player:123');
		expect(playerStateEvent.channel('123')).toBe(playerStateChannel('123'));
		expect(playerStateEvent.pattern).toBe(PLAYER_STATE_CHANNEL_PATTERN);
		expect(playerStateEvent.guildIdFromChannel('sirubot:player:123')).toBe(guildIdFromPlayerStateChannel('sirubot:player:123'));
		expect(playerStateEvent.guildIdFromChannel('sirubot:bot-profile:state:1')).toBeNull();
	});

	it('설정 무효화만 서명 없이 흐르고 나머지는 서명해요', () => {
		expect(guildSettingsInvalidateEvent.signed).toBe(false);
		expect(botProfileSetEvent.signed).toBe(true);
		expect(botProfileRefreshEvent.signed).toBe(true);
		expect(memberGreetingSendEvent.signed).toBe(true);
	});
});

describe('계약 헬퍼', () => {
	it('defineRedisRpc/Event는 입력을 그대로 담아 얼려요', () => {
		const schema = z.object({ requestId: z.string() });
		const rpc = defineRedisRpc({ name: 't', requestChannel: 'a', responseChannel: 'b', requestSchema: schema, responseSchema: schema });
		expect(Object.isFrozen(rpc)).toBe(true);
		expect(rpc.requestChannel).toBe('a');
		const event = defineRedisEvent({ name: 'e', channel: 'c', schema });
		expect(event.signed).toBe(true);
		const guildEvent = defineRedisGuildEvent({ name: 'g', channelPrefix: 'p:', schema });
		expect(guildEvent.channel('1')).toBe('p:1');
		expect(guildEvent.pattern).toBe('p:*');
	});

	it('pickRpcCorrelation은 요청에 있는 상관 필드만 골라요', () => {
		expect(pickRpcCorrelation({ requestId: 'r', guildId: 'g', kind: 'k', extra: 1 })).toEqual({ requestId: 'r', guildId: 'g', kind: 'k' });
		expect(pickRpcCorrelation({ requestId: 'r', kind: 'nodes-status' })).toEqual({ requestId: 'r', kind: 'nodes-status' });
	});

	it('웹 플레이어 요청 계약은 kind별 추가 필드를 버리지 않아요', () => {
		const parsed = playerWebRpc.requestSchema.safeParse({
			requestId: '4b3f2a1e-0d9c-4b8a-9f7e-6d5c4b3a2f1e',
			guildId: '123456789012345678',
			userId: '123456789012345679',
			kind: 'search',
			query: 'x'
		});
		expect(parsed.success && parsed.data.query).toBe('x');
	});
});
