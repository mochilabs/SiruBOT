import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@sapphire/framework', () => ({ container: { logger: { warn } } }));

import { ignoreDiscord } from './ignoreDiscord.ts';

function discordError(code: number) {
	return new DiscordAPIError({ code, message: 'err' }, code, 404, 'GET', 'https://discord.com/api/x', { body: undefined, files: undefined });
}

describe('ignoreDiscord', () => {
	beforeEach(() => warn.mockClear());

	it('성공하면 값을 그대로 돌려줘요', async () => {
		await expect(ignoreDiscord(Promise.resolve('ok'), [RESTJSONErrorCodes.UnknownMessage])).resolves.toBe('ok');
		expect(warn).not.toHaveBeenCalled();
	});

	it('목록에 있는 Discord 에러 코드는 조용히 null이에요', async () => {
		const promise = Promise.reject(discordError(RESTJSONErrorCodes.UnknownMessage));
		await expect(ignoreDiscord(promise, [RESTJSONErrorCodes.UnknownMessage, RESTJSONErrorCodes.UnknownInteraction])).resolves.toBeNull();
		expect(warn).not.toHaveBeenCalled();
	});

	it('목록에 없는 Discord 에러 코드는 경고 후 null이에요', async () => {
		const promise = Promise.reject(discordError(RESTJSONErrorCodes.MissingPermissions));
		await expect(ignoreDiscord(promise, [RESTJSONErrorCodes.UnknownMessage])).resolves.toBeNull();
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('Discord 에러가 아니면 경고 후 null이에요', async () => {
		await expect(ignoreDiscord(Promise.reject(new Error('boom')), [RESTJSONErrorCodes.UnknownMessage])).resolves.toBeNull();
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
