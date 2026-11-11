import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/appError.ts';
import { run } from './repeat.ts';

const mocks = vi.hoisted(() => ({ setRepeat: vi.fn(), getRepeat: vi.fn() }));
const actor = vi.hoisted(() => ({ guildId: 'guild', userId: 'user' }));

vi.mock('@sapphire/framework', () => ({ container: { guildService: {}, music: { setRepeat: mocks.setRepeat } } }));
vi.mock('../../../features/music/application/actor.ts', () => ({ actorFromMember: () => actor }));
vi.mock('../../../services/guildSettings/playback.ts', () => ({ getRepeat: mocks.getRepeat }));
vi.mock('../view/repeat.ts', () => ({
	repeatCurrent: ({ mode }: { mode: string }) => `current:${mode}`,
	repeatUpdated: ({ mode }: { mode: string }) => `updated:${mode}`
}));

function interaction(mode: string | null) {
	return { guildId: 'guild', member: {}, user: { id: 'user' }, reply: vi.fn(), options: { getString: vi.fn().mockReturnValue(mode) } };
}

describe('repeat subcommand run', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.setRepeat.mockImplementation(async (_actor: unknown, mode: string) => ({ mode, playing: true }));
	});

	it('모드를 주면 유스케이스에 위임하고 저장된 모드를 보여줘요', async () => {
		const target = interaction('track');
		await run(target as unknown as Parameters<typeof run>[0]);
		expect(mocks.setRepeat).toHaveBeenCalledExactlyOnceWith(actor, 'track');
		expect(target.reply).toHaveBeenCalledWith(expect.objectContaining({ components: ['updated:track'] }));
	});

	it('모드를 비우면 현재 설정만 보여주고 유스케이스를 부르지 않아요', async () => {
		mocks.getRepeat.mockResolvedValue('queue');
		const target = interaction(null);
		await run(target as unknown as Parameters<typeof run>[0]);
		expect(mocks.setRepeat).not.toHaveBeenCalled();
		expect(target.reply).toHaveBeenCalledWith(expect.objectContaining({ components: ['current:queue'] }));
	});

	it('유스케이스의 거절은 응답 없이 그대로 던져요', async () => {
		const refusal = new AppError('invalid_input', '잘못된 반복 모드 값이에요.');
		mocks.setRepeat.mockRejectedValueOnce(refusal);
		const target = interaction('bogus');
		await expect(run(target as unknown as Parameters<typeof run>[0])).rejects.toBe(refusal);
		expect(target.reply).not.toHaveBeenCalled();
	});
});
