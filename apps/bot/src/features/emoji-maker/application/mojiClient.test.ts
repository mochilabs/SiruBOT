import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMojiClient, MojiError } from './mojiClient.ts';

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);
beforeEach(() => fetchMock.mockReset());

const config = { url: 'http://moji.invalid', authKey: 'k' };
const png = Buffer.from('png-bytes');
const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const client = () => createMojiClient({ getMojiConfig: () => config });

describe('createMojiClient', () => {
	it('is off without config', async () => {
		const off = createMojiClient({ getMojiConfig: () => null });
		expect(off.isEnabled()).toBe(false);
		await expect(off.generate('cat')).rejects.toMatchObject({ code: 'not_configured' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('posts the prompt with the raw key and decodes images', async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { device: 'webgpu', seed: 9, elapsedMs: 1, images: [png.toString('base64')] }));
		expect(await client().generate('cat', { n: 1, seed: 9 })).toEqual({ images: [png], seed: 9, device: 'webgpu' });
		const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
		expect(url).toBe('http://moji.invalid/v1/generate');
		expect((init.headers as Record<string, string>).authorization).toBe('k');
		expect(JSON.parse(init.body as string)).toEqual({ prompt: 'cat', n: 1, seed: 9 });
	});

	it('maps 503 to busy and other failures to unavailable', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: 'full' }));
		await expect(client().generate('cat')).rejects.toMatchObject({ code: 'busy' });
		fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'no' }));
		await expect(client().generate('cat')).rejects.toMatchObject({ code: 'unavailable' });
		fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
		await expect(client().generate('cat')).rejects.toBeInstanceOf(MojiError);
	});

	it('rejects a response without images', async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { images: [] }));
		await expect(client().generate('cat')).rejects.toMatchObject({ code: 'bad_response' });
	});
});
