import { describe, expect, it } from 'vitest';
import { AppError } from '../../../lib/appError.ts';
import { createMusicAccess, isDjOrAlone, isInBotVoice, MUSIC_ACCESS_MESSAGES } from './access.ts';
import type { Actor } from './actor.ts';

function actor(overrides: Partial<Actor> = {}): Actor {
	return {
		guildId: 'guild',
		userId: 'user',
		voiceChannelId: 'vc-bot',
		isAdministrator: false,
		roleIds: new Set<string>(),
		humansInVoiceChannel: 3,
		...overrides
	};
}

function access(options: { botChannel?: string | null; djRole?: string | null } = {}) {
	const { botChannel = 'vc-bot', djRole = null } = options;
	return createMusicAccess({
		getBotVoiceChannelId: () => botChannel,
		getDjRoleId: async () => djRole
	});
}

async function rejection(promise: Promise<void>): Promise<AppError> {
	const error = await promise.then(
		() => null,
		(thrown: unknown) => thrown
	);
	expect(error).toBeInstanceOf(AppError);
	return error as AppError;
}

describe('음성 채널 조건', () => {
	it('봇과 같은 채널이면 통과해요', async () => {
		await expect(access().authorize(actor())).resolves.toBeUndefined();
	});

	it('다른 채널이면 같은 채널 문구로 거절해요', async () => {
		const error = await rejection(access().authorize(actor({ voiceChannelId: 'vc-other' })));
		expect(error.kind).toBe('forbidden');
		expect(error.ephemeral).toBe(true);
		expect(error.userMessage).toBe(MUSIC_ACCESS_MESSAGES.sameVoiceRequired());
	});

	it('음성 채널에 없으면 접속 필요 문구로 거절해요', async () => {
		const error = await rejection(access().authorize(actor({ voiceChannelId: null, humansInVoiceChannel: 0 })));
		expect(error.kind).toBe('forbidden');
		expect(error.userMessage).toBe(MUSIC_ACCESS_MESSAGES.voiceRequired());
	});

	it('봇이 채널에 없으면 어느 채널이든 접속해 있으면 통과해요', async () => {
		await expect(access({ botChannel: null }).authorize(actor({ voiceChannelId: 'vc-any' }))).resolves.toBeUndefined();
	});

	it('봇이 채널에 없어도 미접속이면 거절해요', async () => {
		await rejection(access({ botChannel: null }).authorize(actor({ voiceChannelId: null })));
	});

	it('Administrator는 음성 채널 밖에서도, 다른 채널에서도 통과해요', async () => {
		await expect(access().authorize(actor({ isAdministrator: true, voiceChannelId: null }))).resolves.toBeUndefined();
		await expect(access().authorize(actor({ isAdministrator: true, voiceChannelId: 'vc-other' }))).resolves.toBeUndefined();
	});

	it('DJ 역할이 있어도 음성 채널 조건은 면제되지 않아요', async () => {
		const error = await rejection(access({ djRole: 'dj' }).authorize(actor({ voiceChannelId: 'vc-other', roleIds: new Set(['dj']) })));
		expect(error.userMessage).toBe(MUSIC_ACCESS_MESSAGES.sameVoiceRequired());
	});
});

describe('DJ 조건', () => {
	it('DJ 역할이 설정되지 않았으면 모두 통과해요', async () => {
		await expect(access({ djRole: null }).authorize(actor())).resolves.toBeUndefined();
	});

	it('DJ 역할 보유자는 통과해요', async () => {
		await expect(access({ djRole: 'dj' }).authorize(actor({ roleIds: new Set(['dj']) }))).resolves.toBeUndefined();
	});

	it('채널에 사람이 혼자면 DJ 역할 없이도 통과해요', async () => {
		await expect(access({ djRole: 'dj' }).authorize(actor({ humansInVoiceChannel: 1 }))).resolves.toBeUndefined();
	});

	it('DJ 역할이 없고 다른 사람이 있으면 DJ 문구로 거절해요', async () => {
		const error = await rejection(access({ djRole: 'dj' }).authorize(actor()));
		expect(error.kind).toBe('forbidden');
		expect(error.ephemeral).toBe(true);
		expect(error.userMessage).toBe(MUSIC_ACCESS_MESSAGES.djOnly());
	});

	it('Administrator는 DJ 역할 없이도 통과해요', async () => {
		await expect(access({ djRole: 'dj' }).authorize(actor({ isAdministrator: true }))).resolves.toBeUndefined();
	});

	it('dj: false면 DJ 조건을 건너뛰어요', async () => {
		await expect(access({ djRole: 'dj' }).authorize(actor(), { dj: false })).resolves.toBeUndefined();
	});

	it('음성 조건이 DJ 조건보다 먼저 거절해요', async () => {
		const error = await rejection(access({ djRole: 'dj' }).authorize(actor({ voiceChannelId: null, humansInVoiceChannel: 0 })));
		expect(error.userMessage).toBe(MUSIC_ACCESS_MESSAGES.voiceRequired());
	});
});

describe('순수 판정 함수', () => {
	it('isDjOrAlone은 음성 채널 밖이면 혼자 있음으로 보지 않아요', () => {
		expect(isDjOrAlone(actor({ voiceChannelId: null, humansInVoiceChannel: 1 }), 'dj')).toBe(false);
	});

	it('isInBotVoice는 같은 채널만 통과시켜요', () => {
		expect(isInBotVoice(actor(), 'vc-bot')).toBe(true);
		expect(isInBotVoice(actor(), 'vc-x')).toBe(false);
	});
});
