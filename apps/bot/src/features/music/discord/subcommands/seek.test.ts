import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../../lib/appError.ts';
import { run } from './seek.ts';

const mocks = vi.hoisted(() => ({ seek: vi.fn() }));
const actor = vi.hoisted(() => ({ guildId: 'guild', userId: 'user' }));

vi.mock('@sapphire/framework', () => ({ container: { music: { seek: mocks.seek } } }));
vi.mock('../../application/actor.ts', () => ({ actorFromMember: () => actor }));
vi.mock('../views/seek.ts', () => ({ seekSuccess: ({ position }: { position: number }) => `seeked:${position}` }));

function interaction(time: string) {
	return { member: {}, reply: vi.fn(), options: { getString: vi.fn().mockReturnValue(time) } };
}

describe('seek subcommand run', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.seek.mockImplementation(async (_actor: unknown, positionMs: number) => ({ positionMs, track: {} }));
	});

	it('시간 문자열을 밀리초로 바꿔 유스케이스에 위임하고 이동한 위치를 보여줘요', async () => {
		const target = interaction('1:30');
		await run(target as unknown as Parameters<typeof run>[0]);
		expect(mocks.seek).toHaveBeenCalledExactlyOnceWith(actor, 90_000);
		expect(target.reply).toHaveBeenCalledWith(expect.objectContaining({ components: ['seeked:90000'] }));
	});

	it('파싱할 수 없는 시간은 NaN으로 넘겨 유스케이스가 거절하게 해요', async () => {
		mocks.seek.mockRejectedValueOnce(new AppError('invalid_input', '올바른 시간 형식이 아니에요.'));
		const target = interaction('abc');
		await expect(run(target as unknown as Parameters<typeof run>[0])).rejects.toThrow('올바른 시간 형식이 아니에요.');
		expect(mocks.seek).toHaveBeenCalledWith(actor, Number.NaN);
		expect(target.reply).not.toHaveBeenCalled();
	});
});
