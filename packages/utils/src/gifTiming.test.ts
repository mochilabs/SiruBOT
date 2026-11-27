import { describe, expect, it } from 'vitest';

import { parseGifDataUriTiming, parseGifTiming } from './gifTiming.ts';

function makeGif(width: number, height: number, delaysCs: number[], options: { localTable?: boolean; truncate?: boolean } = {}): Uint8Array {
	const out: number[] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 0xff, width >> 8, height & 0xff, height >> 8, 0x00, 0x00, 0x00];
	for (const delay of delaysCs) {
		out.push(0x21, 0xf9, 0x04, 0x00, delay & 0xff, delay >> 8, 0x00, 0x00);
		out.push(0x2c, 0, 0, 0, 0, width & 0xff, width >> 8, height & 0xff, height >> 8, options.localTable ? 0x80 : 0x00);
		if (options.localTable) out.push(0, 0, 0, 255, 255, 255);
		out.push(0x02, 0x02, 0x44, 0x01, 0x00);
	}
	out.push(0x3b);
	const bytes = Uint8Array.from(out);
	return options.truncate ? bytes.slice(0, bytes.length - 4) : bytes;
}

describe('parseGifTiming', () => {
	it('크기·프레임 수·프레임 지연의 합을 읽어요', () => {
		expect(parseGifTiming(makeGif(320, 200, [5, 5, 10]))).toEqual({ width: 320, height: 200, frames: 3, durationMs: 200 });
	});

	it('프레임이 하나뿐이면 정지 GIF라 길이는 0이에요', () => {
		expect(parseGifTiming(makeGif(10, 10, [50]))).toEqual({ width: 10, height: 10, frames: 1, durationMs: 0 });
	});

	it('지연이 0~1센티초면 브라우저처럼 100ms로 봐요', () => {
		expect(parseGifTiming(makeGif(10, 10, [0, 1, 2]))?.durationMs).toBe(100 + 100 + 20);
	});

	it('지역 색상표가 있는 프레임도 건너뛰어요', () => {
		expect(parseGifTiming(makeGif(8, 8, [10, 10], { localTable: true }))).toMatchObject({ frames: 2, durationMs: 200 });
	});

	it('GIF가 아니거나 비어 있으면 null이에요', () => {
		expect(parseGifTiming(new Uint8Array(0))).toBeNull();
		expect(parseGifTiming(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBeNull();
		expect(parseGifTiming(makeGif(0, 10, [5]))).toBeNull();
	});

	it('잘린 파일도 읽은 프레임까지는 돌려줘요', () => {
		expect(parseGifTiming(makeGif(10, 10, [5, 5, 5], { truncate: true }))?.frames).toBeGreaterThanOrEqual(2);
	});
});

describe('parseGifDataUriTiming', () => {
	const uri = (bytes: Uint8Array) => `data:image/gif;base64,${Buffer.from(bytes).toString('base64')}`;

	it('data URI에서도 같은 값을 읽어요', () => {
		expect(parseGifDataUriTiming(uri(makeGif(40, 30, [20, 20])))).toEqual({ width: 40, height: 30, frames: 2, durationMs: 400 });
	});

	it('GIF가 아닌 data URI·null·깨진 base64는 null이에요', () => {
		expect(parseGifDataUriTiming(null)).toBeNull();
		expect(parseGifDataUriTiming('data:image/png;base64,AAAA')).toBeNull();
		expect(parseGifDataUriTiming('data:image/gif;base64,@@@@')).toBeNull();
	});
});
