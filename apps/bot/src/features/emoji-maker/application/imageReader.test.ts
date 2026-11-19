import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageReader, ImageReaderError, MAX_IMAGE_BYTES, normalizeImageType, parseImageReading } from './imageReader.ts';

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);
beforeEach(() => fetchMock.mockReset());

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const llm = { apiUrl: 'http://llm.invalid/v1', apiKey: 'sk', model: 'm' };
const answer = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const image = (type: string | null = 'image/png', body: Buffer = pngBytes) =>
	new Response(body, { status: 200, headers: type ? { 'content-type': type } : {} });
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

describe('normalizeImageType', () => {
	it('accepts PNG, JPEG and WEBP only', () => {
		expect(normalizeImageType('image/png')).toBe('image/png');
		expect(normalizeImageType('IMAGE/JPG; charset=binary')).toBe('image/jpeg');
		expect(normalizeImageType('image/webp')).toBe('image/webp');
		expect(normalizeImageType('image/gif')).toBeNull();
		expect(normalizeImageType('image/*')).toBeNull();
		expect(normalizeImageType(null)).toBeNull();
	});
});

describe('createImageReader', () => {
	it('downloads the image and sends it as a typed data URL with the note', async () => {
		fetchMock.mockResolvedValueOnce(image('image/png')).mockResolvedValueOnce(answer('{"nsfw": false, "prompt": "orange cat wearing a crown"}'));
		expect(await reader().read('https://cdn.discordapp.com/a.png?ex=1', '왕관 씌워줘')).toEqual({
			kind: 'ok',
			prompt: 'orange cat wearing a crown'
		});
		expect(fetchMock.mock.calls[0]![0]).toBe('https://cdn.discordapp.com/a.png?ex=1');
		const [url, init] = fetchMock.mock.calls[1]! as [string, RequestInit];
		expect(url).toBe('http://llm.invalid/v1/chat/completions');
		const body = JSON.parse(init.body as string);
		expect(body.messages[1].content).toEqual([
			{ type: 'text', text: 'User note: 왕관 씌워줘' },
			{ type: 'image_url', image_url: { url: `data:image/png;base64,${pngBytes.toString('base64')}` } }
		]);
	});

	it('uses the attachment type when the download has no usable content-type', async () => {
		fetchMock.mockResolvedValueOnce(image('application/octet-stream')).mockResolvedValueOnce(answer('{"nsfw": false, "prompt": "cat"}'));
		await reader().read('https://cdn/a', undefined, 'image/jpeg');
		const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
		expect(body.messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,')).toBe(true);
	});

	it('returns the nsfw verdict', async () => {
		fetchMock.mockResolvedValueOnce(image()).mockResolvedValueOnce(answer('{"nsfw": true, "prompt": ""}'));
		expect(await reader().read('https://cdn.discordapp.com/a.png')).toEqual({ kind: 'nsfw' });
	});

	it('fails closed when off, the image is unusable, or the model errors', async () => {
		await expect(reader(false).read('u')).rejects.toMatchObject({ code: 'not_configured' });
		fetchMock.mockResolvedValueOnce(image('image/gif'));
		await expect(reader().read('u')).rejects.toMatchObject({ code: 'failed' });
		fetchMock.mockResolvedValueOnce(image('image/png', Buffer.alloc(MAX_IMAGE_BYTES + 1)));
		await expect(reader().read('u')).rejects.toMatchObject({ code: 'failed' });
		fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
		await expect(reader().read('u')).rejects.toMatchObject({ code: 'failed' });
		fetchMock.mockResolvedValueOnce(image()).mockResolvedValueOnce(new Response('boom', { status: 500 }));
		await expect(reader().read('u')).rejects.toMatchObject({ code: 'failed' });
		fetchMock.mockResolvedValueOnce(image()).mockRejectedValueOnce(new TypeError('fetch failed'));
		await expect(reader().read('u')).rejects.toBeInstanceOf(ImageReaderError);
		fetchMock.mockResolvedValueOnce(image()).mockResolvedValueOnce(answer('I think it is a cat'));
		await expect(reader().read('u')).rejects.toMatchObject({ code: 'failed' });
		expect(fetchMock).toHaveBeenCalledTimes(9);
	});
});
