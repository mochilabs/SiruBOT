import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageReader, ImageReaderError, parseImageReading } from './imageReader.ts';

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);
beforeEach(() => fetchMock.mockReset());

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const llm = { apiUrl: 'http://llm.invalid/v1', apiKey: 'sk', model: 'm' };
const answer = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const reader = (on = true) => createImageReader({ logger, getLlmConfig: () => (on ? llm : null) });

describe('parseImageReading', () => {
	it('reads safe and nsfw verdicts, tolerating fences and think blocks', () => {
		expect(parseImageReading('{"nsfw": false, "prompt": "orange cat."}')).toEqual({ kind: 'ok', prompt: 'orange cat' });
		expect(parseImageReading('<think>x</think>```json\n{"nsfw": true, "prompt": ""}\n```')).toEqual({ kind: 'nsfw' });
	});

	it('rejects anything it cannot trust', () => {
		expect(parseImageReading('a cat')).toBeNull();
		expect(parseImageReading('{"prompt": "cat"}')).toBeNull(); // nsfw 판정 없음
		expect(parseImageReading('{"nsfw": "no", "prompt": "cat"}')).toBeNull();
		expect(parseImageReading('{"nsfw": false, "prompt": ""}')).toBeNull();
		expect(parseImageReading('{"nsfw": false, ')).toBeNull();
	});
});

describe('createImageReader', () => {
	it('sends the image and the note to the vision model', async () => {
		fetchMock.mockResolvedValue(answer('{"nsfw": false, "prompt": "orange cat wearing a crown"}'));
		expect(await reader().read('https://cdn.discordapp.com/a.png', '왕관 씌워줘')).toEqual({ kind: 'ok', prompt: 'orange cat wearing a crown' });
		const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
		expect(url).toBe('http://llm.invalid/v1/chat/completions');
		const body = JSON.parse(init.body as string);
		expect(body.messages[1].content).toEqual([
			{ type: 'text', text: 'User note: 왕관 씌워줘' },
			{ type: 'image_url', image_url: { url: 'https://cdn.discordapp.com/a.png' } }
		]);
	});

	it('returns the nsfw verdict', async () => {
		fetchMock.mockResolvedValue(answer('{"nsfw": true, "prompt": ""}'));
		expect(await reader().read('https://cdn.discordapp.com/a.png')).toEqual({ kind: 'nsfw' });
	});

	it('fails closed when off, erroring, or unreadable', async () => {
		await expect(reader(false).read('u')).rejects.toMatchObject({ code: 'not_configured' });
		fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		await expect(reader().read('u')).rejects.toMatchObject({ code: 'failed' });
		fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
		await expect(reader().read('u')).rejects.toBeInstanceOf(ImageReaderError);
		fetchMock.mockResolvedValueOnce(answer('I think it is a cat'));
		await expect(reader().read('u')).rejects.toMatchObject({ code: 'failed' });
	});
});
