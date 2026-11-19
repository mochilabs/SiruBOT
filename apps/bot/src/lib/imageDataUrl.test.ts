import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchImageAsDataUrl, MAX_IMAGE_BYTES, normalizeImageType } from './imageDataUrl.ts';

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);
beforeEach(() => fetchMock.mockReset());

const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const image = (type: string | null, body: Buffer = bytes, status = 200) =>
	new Response(status === 200 ? body : '', { status, headers: type ? { 'content-type': type } : {} });

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

describe('fetchImageAsDataUrl', () => {
	it('returns a typed data URL', async () => {
		fetchMock.mockResolvedValueOnce(image('image/png'));
		expect(await fetchImageAsDataUrl('https://cdn/a.png?ex=1')).toBe(`data:image/png;base64,${bytes.toString('base64')}`);
		expect(fetchMock.mock.calls[0]![0]).toBe('https://cdn/a.png?ex=1');
	});

	it('falls back to the attachment type when the header is unusable', async () => {
		fetchMock.mockResolvedValueOnce(image('application/octet-stream'));
		expect(await fetchImageAsDataUrl('u', 'image/jpeg')).toMatch(/^data:image\/jpeg;base64,/);
	});

	it('throws on unsupported types, oversized images and failed downloads', async () => {
		fetchMock.mockResolvedValueOnce(image('image/gif'));
		await expect(fetchImageAsDataUrl('u', 'image/gif')).rejects.toThrow('unsupported image type');
		fetchMock.mockResolvedValueOnce(image('image/png', Buffer.alloc(MAX_IMAGE_BYTES + 1)));
		await expect(fetchImageAsDataUrl('u')).rejects.toThrow('too large');
		fetchMock.mockResolvedValueOnce(image(null, bytes, 404));
		await expect(fetchImageAsDataUrl('u')).rejects.toThrow('HTTP 404');
	});
});
