// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TemplateEditor, type TemplateSample } from './template-editor';

// SWR·디스코드 셀렉트는 이번 버그(변수 리터럴 표시)와 무관 — 네트워크·포털 없이 편집기만 렌더링해요
vi.mock('@/hooks/use-guild-settings', () => ({
	useGuildChannels: () => ({ channels: null }),
	useGuildRoles: () => ({ roles: null })
}));
vi.mock('@/components/discord/channel-select', () => ({
	ChannelSelect: function ChannelSelectStub() {
		return null;
	}
}));
vi.mock('@/components/discord/role-select', () => ({
	RoleSelect: function RoleSelectStub() {
		return null;
	}
}));

const sample: TemplateSample = {
	platform: 'youtube',
	sourceId: 'UC-demo',
	title: '샘플 제목',
	url: 'https://example.com/watch?v=demo',
	author: '샘플 채널'
};

let host: HTMLDivElement | undefined;
let root: Root | undefined;

async function renderEditor(options: { value?: string; onChange?: (value: string) => void } = {}) {
	vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
	host = document.createElement('div');
	document.body.append(host);
	root = createRoot(host);
	await act(async () => {
		root?.render(<TemplateEditor guildId="guild-a" value={options.value ?? ''} onChange={options.onChange ?? vi.fn()} sample={sample} />);
	});
}

afterEach(async () => {
	await act(async () => {
		root?.unmount();
	});
	host?.remove();
	host = undefined;
	root = undefined;
	vi.unstubAllGlobals();
});

describe('알림 메시지 편집기의 변수 리터럴', () => {
	it('변수 버튼이 {title}·{url}·{author}를 닫는 중괄호까지 온전히 보여줘요', async () => {
		await renderEditor();
		expect([...document.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
			'{title} · 제목',
			'{url} · 링크',
			'{author} · 채널 이름'
		]);
	});

	it('버튼 클릭이 닫는 중괄호까지 갖춘 변수 토큰을 onChange에 넘겨요', async () => {
		const onChange = vi.fn();
		await renderEditor({ onChange });
		const [title, url, author] = document.querySelectorAll('button');
		await act(async () => {
			title.click();
		});
		expect(onChange).toHaveBeenLastCalledWith('{title}');
		await act(async () => {
			url.click();
		});
		expect(onChange).toHaveBeenLastCalledWith('{url}');
		await act(async () => {
			author.click();
		});
		expect(onChange).toHaveBeenLastCalledWith('{author}');
	});

	it('안내문·placeholder의 변수 리터럴이 그대로 보이고 미리보기는 값으로 치환돼요', async () => {
		await renderEditor({ value: '방송 시작: {title}' });
		expect(document.querySelector('textarea')?.getAttribute('placeholder')).toBe('예: {author}이(가) 방송을 시작했어요! {url}');
		expect(document.body.textContent).toContain('{title}·{url}·{author}');
		expect(document.querySelector('p.text-foreground')?.textContent).toBe('방송 시작: 샘플 제목');
	});
});
