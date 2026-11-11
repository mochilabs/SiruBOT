import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/appError.ts';
import { run as runPause } from './pause.ts';
import { run as runResume } from './resume.ts';

const mocks = vi.hoisted(() => ({ pause: vi.fn(), resume: vi.fn() }));
const actor = vi.hoisted(() => ({ guildId: 'guild', userId: 'user' }));

vi.mock('@sapphire/framework', () => ({ container: { music: { pause: mocks.pause, resume: mocks.resume } } }));
vi.mock('../../../features/music/application/actor.ts', () => ({ actorFromMember: () => actor }));
vi.mock('../view/pause.ts', () => ({ paused: () => 'paused-view', resumed: () => 'resumed-view' }));

function interaction() {
	return { member: {}, deferReply: vi.fn(), editReply: vi.fn() };
}

describe('pause/resume subcommands', () => {
	it('pause는 응답을 보류한 뒤 유스케이스에 위임하고 결과 화면을 보여줘요', async () => {
		const target = interaction();
		await runPause(target as unknown as Parameters<typeof runPause>[0]);
		expect(mocks.pause).toHaveBeenCalledExactlyOnceWith(actor);
		expect(target.deferReply).toHaveBeenCalledOnce();
		expect(target.editReply).toHaveBeenCalledWith(expect.objectContaining({ components: ['paused-view'] }));
	});

	it('resume은 유스케이스에 위임하고 결과 화면을 보여줘요', async () => {
		const target = interaction();
		await runResume(target as unknown as Parameters<typeof runResume>[0]);
		expect(mocks.resume).toHaveBeenCalledExactlyOnceWith(actor);
		expect(target.editReply).toHaveBeenCalledWith(expect.objectContaining({ components: ['resumed-view'] }));
	});

	it('유스케이스의 거절은 화면을 갱신하지 않고 그대로 던져요', async () => {
		const refusal = new AppError('not_found', '이어 재생할 곡이 없어요.');
		mocks.resume.mockRejectedValueOnce(refusal);
		const target = interaction();
		await expect(runResume(target as unknown as Parameters<typeof runResume>[0])).rejects.toBe(refusal);
		expect(target.editReply).not.toHaveBeenCalled();
	});
});
