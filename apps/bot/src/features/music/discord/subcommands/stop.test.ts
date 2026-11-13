import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../../lib/appError.ts';
import { run } from './stop.ts';

const mocks = vi.hoisted(() => ({ stop: vi.fn() }));
const actor = vi.hoisted(() => ({ guildId: 'guild', userId: 'user' }));

vi.mock('@sapphire/framework', () => ({ container: { music: { stop: mocks.stop } } }));
vi.mock('../../application/actor.ts', () => ({ actorFromMember: () => actor }));
vi.mock('../views/stop.ts', () => ({ stop: () => 'stop-view' }));

describe('stop subcommand run', () => {
	it('응답을 보류한 뒤 유스케이스에 위임하고 정지 화면을 보여줘요', async () => {
		const interaction = { member: {}, deferReply: vi.fn(), editReply: vi.fn() };
		await run(interaction as unknown as Parameters<typeof run>[0]);
		expect(interaction.deferReply).toHaveBeenCalledOnce();
		expect(mocks.stop).toHaveBeenCalledExactlyOnceWith(actor);
		expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ components: ['stop-view'] }));
	});

	it('유스케이스의 거절은 화면을 갱신하지 않고 그대로 던져요', async () => {
		const refusal = new AppError('not_found', '재생 중인 곡이 없어요.');
		mocks.stop.mockRejectedValueOnce(refusal);
		const interaction = { member: {}, deferReply: vi.fn(), editReply: vi.fn() };
		await expect(run(interaction as unknown as Parameters<typeof run>[0])).rejects.toBe(refusal);
		expect(interaction.editReply).not.toHaveBeenCalled();
	});
});
