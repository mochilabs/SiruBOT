import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postRolePanel, postTicketPanel } = vi.hoisted(() => ({ postRolePanel: vi.fn(), postTicketPanel: vi.fn() }));
vi.mock('../../role-panels/index.ts', () => ({
	postRolePanel,
	PanelPostError: class PanelPostError extends Error {}
}));
vi.mock('../../tickets/index.ts', () => ({ postTicketPanel }));

import { PanelPostError } from '../../role-panels/index.ts';
import { createPanelPostResponder } from './panelPost.ts';

const REQUEST_ID = 'c9d3a1b2-4e5f-4a6b-8c7d-2b1e3f4a5c61';
const base = { requestId: REQUEST_ID, guildId: '123456789012345678' };
const MESSAGE_ID = '223456789012345678';
const CHANNEL_ID = '323456789012345678';

function makeRuntime() {
	const publish = vi.fn();
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
	return { publish, logger, runtime: { logger, signingKey: '', publisher: { publish }, resolveGuild: () => ({}) as never } };
}

describe('패널 게시 디스패처', () => {
	beforeEach(() => {
		postRolePanel.mockReset();
		postTicketPanel.mockReset();
	});

	it('type이 ticket이면 티켓 핸들러로, rolePanel이면 역할 패널 핸들러로 보내요', async () => {
		postTicketPanel.mockResolvedValue({ messageId: MESSAGE_ID, channelId: CHANNEL_ID });
		postRolePanel.mockResolvedValue({ messageId: MESSAGE_ID, channelId: CHANNEL_ID });
		const { publish, runtime } = makeRuntime();
		const binding = createPanelPostResponder();
		await binding.handle(JSON.stringify({ ...base, type: 'ticket', channelId: CHANNEL_ID }), runtime);
		await binding.handle(JSON.stringify({ ...base, type: 'rolePanel', panelId: 'p1', refresh: true }), runtime);

		expect(postTicketPanel).toHaveBeenCalledWith(expect.anything(), CHANNEL_ID);
		expect(postRolePanel).toHaveBeenCalledWith(expect.anything(), { panelId: 'p1', channelId: undefined, refresh: true });
		expect(publish.mock.calls[0]).toEqual([
			'sirubot:panel-post:response',
			{ ...base, messageId: MESSAGE_ID, channelId: CHANNEL_ID },
			expect.any(String)
		]);
		expect(publish).toHaveBeenCalledTimes(2);
	});

	it('PanelPostError는 가공 없이 error로 응답하고 error 로그는 남기지 않아요', async () => {
		postTicketPanel.mockRejectedValue(new PanelPostError('티켓 기능이 꺼져 있어요. 먼저 티켓을 활성화해 주세요.'));
		const { publish, logger, runtime } = makeRuntime();
		await createPanelPostResponder().handle(JSON.stringify({ ...base, type: 'ticket' }), runtime);
		expect(publish.mock.calls[0][1]).toEqual({ ...base, error: '티켓 기능이 꺼져 있어요. 먼저 티켓을 활성화해 주세요.' });
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('그 밖의 예외는 error 로그를 남기고 게시 실패 안내로 응답해요', async () => {
		postTicketPanel.mockRejectedValue(new Error('boom'));
		const { publish, logger, runtime } = makeRuntime();
		await createPanelPostResponder().handle(JSON.stringify({ ...base, type: 'ticket' }), runtime);
		expect(publish.mock.calls[0][1]).toEqual({ ...base, error: '패널을 게시하지 못했어요. 잠시 후 다시 시도해 주세요.' });
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
	});

	it('같은 길드의 이전 게시가 진행 중이면 중복 안내로 응답해요', async () => {
		let release!: (value: { messageId: string; channelId: string }) => void;
		postTicketPanel.mockReturnValue(new Promise((resolve) => (release = resolve)));
		const { publish, runtime } = makeRuntime();
		const binding = createPanelPostResponder();
		const first = binding.handle(JSON.stringify({ ...base, type: 'ticket' }), runtime);
		await binding.handle(JSON.stringify({ ...base, type: 'ticket' }), runtime);
		expect(publish.mock.calls[0][1].error).toBe('이 서버의 이전 패널 게시 요청을 아직 처리하고 있어요. 잠시 후 다시 시도해 주세요.');
		release({ messageId: MESSAGE_ID, channelId: CHANNEL_ID });
		await first;
	});
});
