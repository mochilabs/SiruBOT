import { describe, expect, it } from 'vitest';
import { isSameEncodedTrack, normalizeTrackEncoded } from './trackEncoded.ts';

/** Lavaplayer 형식 흉내: [4바이트 헤더(flags 1<<30 | 길이)] + 본문 + 마지막 8바이트 position */
function encode(position: bigint): string {
	const body = Buffer.alloc(24, 7);
	body.writeBigUInt64BE(position, body.length - 8);
	const header = Buffer.alloc(4);
	header.writeUInt32BE((1 << 30) | body.length);
	return Buffer.concat([header, body]).toString('base64');
}

describe('normalizeTrackEncoded', () => {
	it('마지막 8바이트 position을 0으로 되돌려요', () => {
		expect(normalizeTrackEncoded(encode(123_456n))).toBe(encode(0n));
	});

	it('position이 이미 0이거나 형식이 다르면 그대로 둬요', () => {
		expect(normalizeTrackEncoded(encode(0n))).toBe(encode(0n));
		expect(normalizeTrackEncoded('not-base64-track')).toBe('not-base64-track');
	});

	it('position만 다른 같은 곡은 같은 트랙으로 봐요', () => {
		expect(isSameEncodedTrack(encode(5_000n), encode(0n))).toBe(true);
		expect(isSameEncodedTrack(encode(5_000n), null)).toBe(false);
	});
});
