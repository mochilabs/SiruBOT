import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setupMarkerChannel } = vi.hoisted(() => ({ setupMarkerChannel: vi.fn() }));
vi.mock('@sapphire/framework', () => ({ container: { tempVoiceService: { setupMarkerChannel } } }));

import { createJtcSetupResponder } from './jtcSetup.ts';

const REQUEST_ID = 'c9d3a1b2-4e5f-4a6b-8c7d-2b1e3f4a5c61';
const request = { requestId: REQUEST_ID, guildId: '123', userId: '456', categoryId: '789' };

function run(raw = JSON.stringify(request)) {
	const publish = vi.fn();
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
	const done = createJtcSetupResponder().handle(raw, { logger, signingKey: '', publisher: { publish }, resolveGuild: () => ({}) as never });
	return { publish, logger, done };
}

describe('JTC 셋업 응답자', () => {
	beforeEach(() => {
		setupMarkerChannel.mockReset();
	});

	it('성공하면 markerChannelId를 응답해요', async () => {
		setupMarkerChannel.mockResolvedValue('999');
		const { publish, done } = run();
		await done;
		expect(setupMarkerChannel).toHaveBeenCalledWith('123', '789');
		expect(publish).toHaveBeenCalledWith(
			'sirubot:jtc-setup:response',
			{ requestId: REQUEST_ID, guildId: '123', markerChannelId: '999' },
			expect.any(String)
		);
	});

	it('카테고리가 아니면 기존 안내 문구로 응답하고 error 로그를 남겨요', async () => {
		setupMarkerChannel.mockImplementation(async () => {
			throw new Error('selected channel is not a category');
		});
		const { publish, logger, done } = run();
		await done;
		expect(publish.mock.calls[0][1]).toMatchObject({ error: '카테고리 채널만 선택할 수 있어요.' });
		expect(logger.error).toHaveBeenCalled();
	});

	it('같은 길드의 이전 요청이 처리 중이면 중복 안내로 응답해요', async () => {
		let release!: (id: string) => void;
		setupMarkerChannel.mockReturnValue(new Promise<string>((resolve) => (release = resolve)));
		const binding = createJtcSetupResponder();
		const publish = vi.fn();
		const runtime = {
			logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
			signingKey: '',
			publisher: { publish },
			resolveGuild: () => ({}) as never
		};
		const first = binding.handle(JSON.stringify(request), runtime);
		await binding.handle(JSON.stringify(request), runtime);
		expect(publish.mock.calls[0][1].error).toBe('이 서버의 이전 마커 채널 설정 요청을 아직 처리하고 있어요. 잠시 후 다시 시도해 주세요.');
		release('1');
		await first;
	});
});
