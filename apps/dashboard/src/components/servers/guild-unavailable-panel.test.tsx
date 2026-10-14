// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuildUnavailablePanel } from './guild-unavailable-panel';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
	useRouter: () => ({ refresh: mocks.refresh }),
}));

afterEach(() => {
	vi.unstubAllGlobals();
	mocks.refresh.mockReset();
});

describe('GuildUnavailablePanel', () => {
	it('Discord 일시 장애을 404가 아닌 재시도 안내로 보여줘요', async () => {
		vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
		const host = document.createElement('div');
		document.body.append(host);
		const root = createRoot(host);
		await act(async () => {
			root.render(<GuildUnavailablePanel />);
		});

		expect(document.body.textContent).toContain('서버 정보를 확인하지 못했어요');
		expect(document.body.textContent).toContain('잠시 후 다시 시도해 주세요');
		// 핵심: 일시 장애는 "없는 주소" 404 문구로 위장하지 않아요.
		expect(document.body.textContent).not.toContain('없는 주소');

		await act(async () => {
			[...document.querySelectorAll<HTMLButtonElement>('button')]
				.find((button) => button.textContent === '다시 시도하기')!
				.click();
		});
		expect(mocks.refresh).toHaveBeenCalledTimes(1);

		await act(async () => {
			root.unmount();
		});
		host.remove();
	});
});