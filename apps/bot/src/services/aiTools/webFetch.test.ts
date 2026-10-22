import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup }));

import { webFetchTool } from './webFetch.ts';

const NO_CTX = {} as never;

function htmlResponse(html: string, url = 'https://example.com/page') {
	const res = new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
	// Response.url은 읽기 전용 게터라 own 프로퍼티로 덮어써 리다이렉트 도착지를 흉내 낸다
	Object.defineProperty(res, 'url', { value: url });
	return res;
}

describe('web_fetch SSRF 가드 (URL 단계)', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async () => htmlResponse('<html><head><title>t</title></head><body>본문</body></html>'))
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('http/https가 아닌 주소는 거절한다', async () => {
		await expect(webFetchTool.execute({ url: 'file:///etc/passwd' }, NO_CTX)).rejects.toThrow('http/https 주소만 조회할 수 있어요.');
		await expect(webFetchTool.execute({ url: 'ftp://example.com/x' }, NO_CTX)).rejects.toThrow('http/https 주소만 조회할 수 있어요.');
		await expect(webFetchTool.execute({ url: 'javascript:alert(1)' }, NO_CTX)).rejects.toThrow('http/https 주소만 조회할 수 있어요.');
	});

	it('URL 형식이 아니면 거절한다', async () => {
		await expect(webFetchTool.execute({ url: 'not a url' }, NO_CTX)).rejects.toThrow('올바른 URL이 아니에요.');
	});

	it('사설·내부 호스트 표본을 모두 거절한다', async () => {
		const internalHosts = [
			'http://localhost/',
			'http://api.localhost/',
			'http://service.local/',
			'http://db.internal/',
			'http://127.0.0.1/',
			'http://10.1.2.3/',
			'http://169.254.169.254/latest/meta-data/',
			'http://192.168.0.10/',
			'http://172.16.0.1/',
			'http://172.31.255.1/',
			'http://100.64.0.1/',
			'http://0.0.0.0/',
			'http://127.1/',
			'http://[::1]/',
			'http://[fc00::1]/',
			'http://[fe80::1]/',
			'http://[::ffff:127.0.0.1]/',
			'http://[::ffff:7f00:1]/',
			'http://[64:ff9b::7f00:1]/',
			'http://[64:ff9b:1::abcd]/'
		];

		for (const url of internalHosts) {
			await expect(webFetchTool.execute({ url }, NO_CTX), url).rejects.toThrow('내부 주소는 조회할 수 없어요.');
		}
		expect(fetch).not.toHaveBeenCalled();
	});

	it('공개 호스트는 요청까지 진행한다', async () => {
		for (const url of ['https://example.com/', 'http://8.8.8.8/', 'https://[2606:4700:4700::1111]/']) {
			await expect(webFetchTool.execute({ url }, NO_CTX), url).resolves.toContain('"text"');
		}
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it('리다이렉트가 내부 주소로 갈아타면 거절한다', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('<html>ok</html>', 'http://169.254.169.254/latest')));

		await expect(webFetchTool.execute({ url: 'https://example.com/redirect' }, NO_CTX)).rejects.toThrow('내부 주소는 조회할 수 없어요.');
	});
});

describe('web_fetch 응답 검증·본문 정제', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('HTTP 오류와 텍스트가 아닌 콘텐츠 타입을 거절한다', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
		await expect(webFetchTool.execute({ url: 'https://example.com/missing' }, NO_CTX)).rejects.toThrow('페이지를 가져오지 못했어요. (HTTP 404)');

		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } })));
		await expect(webFetchTool.execute({ url: 'https://example.com/api' }, NO_CTX)).rejects.toThrow(
			'텍스트 페이지만 조회할 수 있어요. (application/json)'
		);
	});

	it('HTML은 제목·스크립트를 제거한 본문 텍스트로 돌려준다', async () => {
		const html =
			'<html><head><title>샘플 <b>페이지</b></title><style>.a{}</style></head><body><script>alert(1)</script><p>안녕</p><p>하세요</p></body></html>';
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async () => htmlResponse(html))
		);

		const result = JSON.parse(await webFetchTool.execute({ url: 'https://example.com/' }, NO_CTX)) as { title: string; text: string };
		expect(result.title).toBe('샘플 페이지');
		expect(result.text).toBe('샘플 페이지 안녕하세요');
		expect(result.text).not.toContain('alert(1)');
	});

	it('내부 주소로 해석되는 DNS 결과는 연결 단계에서 거절한다', async () => {
		// 리바인딩 완화: 공개 호스트로 보이지만 조회 결과가 사설 주소다.
		vi.unstubAllGlobals();
		lookup.mockResolvedValue([{ address: '10.0.0.8', family: 4 }]);

		await expect(webFetchTool.execute({ url: 'https://rebind.example.test/' }, NO_CTX)).rejects.toThrow('페이지 요청에 실패했어요.');
		expect(lookup).toHaveBeenCalledWith('rebind.example.test', expect.objectContaining({ all: true }));
	});
});
