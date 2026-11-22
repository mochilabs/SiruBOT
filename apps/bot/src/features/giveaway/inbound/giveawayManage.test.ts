import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/appError.ts';
import type { GiveawayService } from '../application/giveawayService.ts';
import { createGiveawayManageResponder } from './giveawayManage.ts';

const REQUEST_ID = 'c9d3a1b2-4e5f-4a6b-8c7d-2b1e3f4a5c61';
const GUILD = '123456789012345678';
const USER = '223456789012345678';
const CHANNEL = '323456789012345678';
const base = { requestId: REQUEST_ID, guildId: GUILD, userId: USER };

function setup(service: Partial<Record<'start' | 'endNow' | 'cancel' | 'reroll', ReturnType<typeof vi.fn>>>) {
	const publish = vi.fn();
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
	const runtime = { logger, signingKey: '', publisher: { publish }, resolveGuild: () => ({}) as never };
	const binding = createGiveawayManageResponder(() => service as unknown as GiveawayService);
	const send = (body: object) => binding.handle(JSON.stringify({ ...base, ...body }), runtime);
	return { publish, send };
}

describe('나눔 관리 응답자', () => {
	it('시작은 슬래시 명령과 같은 서비스로 처리하고 나눔 ID를 응답해요', async () => {
		const start = vi.fn().mockResolvedValue({ id: 'g1' });
		const { publish, send } = setup({ start });
		const endsAt = new Date(Date.now() + 3_600_000).toISOString();
		await send({
			action: 'start',
			channelId: CHANNEL,
			prize: '기프티콘',
			winnerCount: 2,
			endsAt,
			conditions: [{ type: 'minJoinDays', days: 7 }]
		});
		expect(start).toHaveBeenCalledWith({
			guildId: GUILD,
			channelId: CHANNEL,
			userId: USER,
			prize: '기프티콘',
			winnerCount: 2,
			endsAt: new Date(endsAt),
			conditions: [{ type: 'minJoinDays', days: 7 }]
		});
		expect(publish.mock.calls[0]).toEqual([
			'sirubot:giveaway-manage:response',
			{ requestId: REQUEST_ID, guildId: GUILD, giveawayId: 'g1' },
			expect.any(String)
		]);
	});

	it('종료·취소는 결과가 맞지 않으면 찾지 못했다는 안내로 응답해요', async () => {
		const endNow = vi.fn().mockResolvedValueOnce('ended').mockResolvedValueOnce('not-running');
		const cancel = vi.fn().mockResolvedValue('not-found');
		const { publish, send } = setup({ endNow, cancel });
		await send({ action: 'end', giveawayId: 'g1' });
		await send({ action: 'end', giveawayId: 'g1' });
		await send({ action: 'cancel', giveawayId: 'g1' });
		expect(publish.mock.calls[0][1]).toEqual({ requestId: REQUEST_ID, guildId: GUILD, giveawayId: 'g1' });
		expect(publish.mock.calls[1][1]).toMatchObject({ error: '진행 중인 그 나눔을 찾지 못했어요.' });
		expect(publish.mock.calls[2][1]).toMatchObject({ error: '진행 중인 그 나눔을 찾지 못했어요.' });
	});

	it('다시 뽑기는 새 당첨자를 응답하고, 서비스의 AppError는 안내 문구로 응답해요', async () => {
		const reroll = vi
			.fn()
			.mockResolvedValueOnce({ winnerIds: [USER] })
			.mockRejectedValueOnce(new AppError('conflict', '새로 뽑을 수 있는 참여자가 없어요.'));
		const { publish, send } = setup({ reroll });
		await send({ action: 'reroll', giveawayId: 'g1', count: 1 });
		await send({ action: 'reroll', giveawayId: 'g1', count: 1 });
		expect(reroll).toHaveBeenCalledWith(GUILD, 'g1', 1);
		expect(publish.mock.calls[0][1]).toEqual({ requestId: REQUEST_ID, guildId: GUILD, giveawayId: 'g1', winnerIds: [USER] });
		expect(publish.mock.calls[1][1]).toMatchObject({ error: '새로 뽑을 수 있는 참여자가 없어요.' });
	});

	it('스키마에 맞지 않는 요청은 조용히 무시해요', async () => {
		const { publish, send } = setup({});
		await send({ action: 'start', channelId: CHANNEL, prize: '', winnerCount: 0, endsAt: 'x', conditions: [] });
		expect(publish).not.toHaveBeenCalled();
	});
});
