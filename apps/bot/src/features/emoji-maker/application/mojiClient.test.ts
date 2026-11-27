import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMojiClient, MojiError, type MojiProgress } from './mojiClient.ts';

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);
beforeEach(() => fetchMock.mockReset());

const config = { url: 'http://moji.invalid', authKey: 'k' };
const png = Buffer.from('png-bytes');
const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ndjson = (events: object[], chunkSize = 7) => {
	const text = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
	const bytes = new TextEncoder().encode(text);
	return new Response(
		new ReadableStream({
			start(controller) {
				for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
				controller.close();
			}
		}),
		{ status: 200, headers: { 'content-type': 'application/x-ndjson' } }
	);
};
const client = () => createMojiClient({ getMojiConfig: () => config });
const done = { type: 'done', device: 'webgpu', seed: 9, elapsedMs: 1, images: [png.toString('base64')] };

describe('createMojiClient', () => {
	it('is off without config', async () => {
		const off = createMojiClient({ getMojiConfig: () => null });
		expect(off.isEnabled()).toBe(false);
		await expect(off.generate('cat')).rejects.toMatchObject({ code: 'not_configured' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('streams progress and returns the final images', async () => {
		fetchMock.mockResolvedValue(
			ndjson([{ type: 'queued', ahead: 2 }, { type: 'start' }, { type: 'step', step: 1, total: 16, preview: png.toString('base64') }, done])
		);
		const events: MojiProgress[] = [];
		expect(await client().generate('cat', { n: 1, seed: 9, onProgress: (e) => events.push(e) })).toEqual({
			images: [png],
			seed: 9,
			device: 'webgpu'
		});
		expect(events).toEqual([{ type: 'queued', ahead: 2 }, { type: 'start' }, { type: 'step', step: 1, total: 16, preview: png }]);
		const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
		expect(url).toBe('http://moji.invalid/v1/generate/stream');
		expect((init.headers as Record<string, string>).authorization).toBe('k');
		expect(JSON.parse(init.body as string)).toEqual({ prompt: 'cat', n: 1, seed: 9 });
	});

	it('keeps going when the progress callback throws', async () => {
		fetchMock.mockResolvedValue(ndjson([{ type: 'start' }, done]));
		const result = await client().generate('cat', {
			onProgress: () => {
				throw new Error('discord down');
			}
		});
		expect(result.images).toEqual([png]);
	});

	it('falls back to the one-shot endpoint on an older server', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(404, { message: 'Route not found' })).mockResolvedValueOnce(jsonResponse(200, done));
		expect(await client().generate('cat')).toEqual({ images: [png], seed: 9, device: 'webgpu' });
		expect(fetchMock.mock.calls[1]![0]).toBe('http://moji.invalid/v1/generate');
	});

	it('maps 503 and stream errors to busy/unavailable', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: 'full' }));
		await expect(client().generate('cat')).rejects.toMatchObject({ code: 'busy' });
		fetchMock.mockResolvedValueOnce(ndjson([{ type: 'start' }, { type: 'error', status: 503, error: 'full' }]));
		await expect(client().generate('cat')).rejects.toMatchObject({ code: 'busy' });
		fetchMock.mockResolvedValueOnce(ndjson([{ type: 'start' }, { type: 'error', status: 500, error: 'boom' }]));
		await expect(client().generate('cat')).rejects.toMatchObject({ code: 'unavailable' });
		fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'no' }));
		await expect(client().generate('cat')).rejects.toMatchObject({ code: 'unavailable' });
		fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
		await expect(client().generate('cat')).rejects.toBeInstanceOf(MojiError);
	});

	it('rejects a stream that ends without images', async () => {
		fetchMock.mockResolvedValueOnce(ndjson([{ type: 'start' }]));
		await expect(client().generate('cat')).rejects.toMatchObject({ code: 'bad_response' });
		fetchMock.mockResolvedValueOnce(ndjson([{ ...done, images: [] }]));
		await expect(client().generate('cat')).rejects.toMatchObject({ code: 'bad_response' });
	});
});
