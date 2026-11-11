import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/appError.ts';
import { run } from './previous.ts';

const mocks = vi.hoisted(() => ({ previous: vi.fn() }));
const actor = vi.hoisted(() => ({ guildId: 'guild', userId: 'user' }));

vi.mock('@sapphire/framework', () => ({ container: { music: { previous: mocks.previous } } }));
vi.mock('../../../features/music/application/actor.ts', () => ({ actorFromMember: () => actor }));
vi.mock('../view/previous.ts', () => ({ previousReplayed: (title: string) => `previous-view:${title}` }));

describe('previous subcommand run', () => {
	it('응답을 보류한 뒤 유스케이스에 위임하고 재생한 곡 화면을 보여줘요', async () => {
		mocks.previous.mockResolvedValueOnce({ track: { info: { title: '이전 곡' } } });
		const interaction = { member: {}, deferReply: vi.fn(), editReply: vi.fn() };
		await run(interaction as unknown as Parameters<typeof run>[0]);
		expect(interaction.deferReply).toHaveBeenCalledOnce();
		expect(mocks.previous).toHaveBeenCalledExactlyOnceWith(actor);
		expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ components: ['previous-view:이전 곡'] }));
	});

	it('유스케이스의 거절은 화면을 갱신하지 않고 그대로 던져요', async () => {
		const refusal = new AppError('not_found', '이전에 재생한 곡이 없어요.');
		mocks.previous.mockRejectedValueOnce(refusal);
		const interaction = { member: {}, deferReply: vi.fn(), editReply: vi.fn() };
		await expect(run(interaction as unknown as Parameters<typeof run>[0])).rejects.toBe(refusal);
		expect(interaction.editReply).not.toHaveBeenCalled();
	});
});
