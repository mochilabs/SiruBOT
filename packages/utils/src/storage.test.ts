import { describe, expect, it } from 'vitest';
import {
	ASSET_ALLOWED_MIME_TYPES,
	ASSET_BUCKET,
	ASSET_MAX_BYTES,
	assetKeyFor,
	parseAssetKey,
	sniffImageMime
} from './storage.js';

describe('sniffImageMime', () => {
	const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
	const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
	const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00]);
	const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

	it('이미지 시그니처를 판별해요', () => {
		expect(sniffImageMime(png)).toBe('image/png');
		expect(sniffImageMime(jpeg)).toBe('image/jpeg');
		expect(sniffImageMime(gif)).toBe('image/gif');
		expect(sniffImageMime(webp)).toBe('image/webp');
	});

	it('모르는 형식은 null이에요', () => {
		expect(sniffImageMime(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
		expect(sniffImageMime(new Uint8Array(2))).toBeNull();
	});
});

describe('assetKeyFor / parseAssetKey', () => {
	it('길드·에셋·mime으로 키를 만들고 다시 파싱해요', () => {
		const key = assetKeyFor('123', 'abc-1', 'image/jpeg');
		expect(key).toBe('123/abc-1.jpg');
		expect(parseAssetKey(key)).toEqual({ guildId: '123', assetId: 'abc-1', ext: 'jpg' });
	});

	it('경로 탈출 조각은 거부해요', () => {
		expect(() => assetKeyFor('../etc', 'x', 'image/png')).toThrow();
		expect(() => assetKeyFor('123', '../x', 'image/png')).toThrow();
		expect(parseAssetKey('123/../../x.png')).toBeNull();
		expect(parseAssetKey('123/nested/x.png')).toBeNull();
	});

	it('상수 계약이 있어요', () => {
		expect(ASSET_BUCKET).toBe('guild-assets');
		expect(ASSET_MAX_BYTES).toBe(8 * 1024 * 1024);
		expect(ASSET_ALLOWED_MIME_TYPES.has('image/gif')).toBe(true);
	});
});
