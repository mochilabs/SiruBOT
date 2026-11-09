import { describe, expect, it } from 'vitest';
import { ohaasaCardSchema, ohaasaTopCardSchema } from '../routes/ohaasaCardSchema.ts';
import { renderOhaasaCard, renderOhaasaTopCard, starsForRank } from './ohaasaCard.ts';

/**
 * 운세 카드 스모크 — 요약 카드(운세 설명·럭키 컬러 미포함) 크기 시그니처와
 * 카드 입력 스키마 계약(설명/컬러 필드 부재)을 검증해요.
 */

/** PNG 매직 + IHDR 너비/높이(각각 16/20 바이트 오프셋 big-endian) */
function expectPngSize(buffer: Buffer, width: number, height: number): void {
	expect([buffer[0], buffer[1], buffer[2], buffer[3]]).toEqual([137, 80, 78, 71]);
	expect(buffer.readUInt32BE(16)).toBe(width);
	expect(buffer.readUInt32BE(20)).toBe(height);
}

const base = { zodiacCode: '07', rank: 1, date: '2026/10/09' } as const;

describe('renderOhaasaCard', () => {
	it('아이템+열쇠 요약 카드를 960폭 PNG로 렌더해요', async () => {
		const buffer = await renderOhaasaCard({ ...base, luckyItem: '핑크색', luckyKey: '친구' });
		expectPngSize(buffer, 960, 304);
		expect(buffer.length).toBeGreaterThan(1_000);
	});

	it('아이템만 있으면 한 칸만 렌더해요', async () => {
		expectPngSize(await renderOhaasaCard({ ...base, luckyItem: '타올' }), 960, 304);
	});

	it('럭키 정보가 없으면 칸 없이 축약 렌더해요', async () => {
		expectPngSize(await renderOhaasaCard({ ...base }), 960, 210);
		expect((await renderOhaasaCard({ ...base })).length).toBeGreaterThan(1_000);
	});

	it('배경을 칠하지 않는 투명 PNG예요', async () => {
		const { loadImage, Canvas } = await import('skia-canvas');
		const img = await loadImage(await renderOhaasaCard({ ...base, luckyItem: '핑크색' }));
		const ctx = new Canvas(960, 304).getContext('2d');
		ctx.drawImage(img, 0, 0);
		// 좌하단 모서리에는 텍스트가 없어서 완전 투명이어야 해요
		expect(ctx.getImageData(2, 300, 1, 1).data[3]).toBe(0);
	});

	it('일본어로 넘어온 아이템도 그대로 그려요 (주말 원문 폴백)', async () => {
		expectPngSize(await renderOhaasaCard({ ...base, luckyItem: 'タオル', luckyKey: '手紙' }), 960, 304);
	});
});

describe('renderOhaasaTopCard', () => {
	it('TOP 3 카드를 960×290 PNG로 렌더해요', async () => {
		const buffer = await renderOhaasaTopCard({
			date: '2026/10/09',
			items: [
				{ zodiacCode: '07', rank: 1 },
				{ zodiacCode: '03', rank: 2 },
				{ zodiacCode: '11', rank: 3 }
			]
		});
		expectPngSize(buffer, 960, 290);
	});

	it('1건만 있어도 렌더해요', async () => {
		expectPngSize(await renderOhaasaTopCard({ items: [{ zodiacCode: '01', rank: 1 }] }), 960, 290);
	});
});

describe('starsForRank', () => {
	it('순위가 높을수록 별이 많아요', () => {
		expect([1, 2, 3, 5, 9, 11].map(starsForRank)).toEqual([5, 5, 4, 3, 2, 1]);
	});
});

describe('ohaasaTopCardSchema', () => {
	it('1~3건과 별자리 코드를 검증해요', () => {
		const item = { zodiacCode: '01', rank: 1 };
		expect(ohaasaTopCardSchema.safeParse({ items: [item] }).success).toBe(true);
		expect(ohaasaTopCardSchema.safeParse({ items: [] }).success).toBe(false);
		expect(ohaasaTopCardSchema.safeParse({ items: [item, item, item, item] }).success).toBe(false);
		expect(ohaasaTopCardSchema.safeParse({ items: [{ zodiacCode: '13', rank: 1 }] }).success).toBe(false);
	});
});

describe('ohaasaCardSchema — 카드는 요약만 받아요', () => {
	it('운세 설명·럭키 컬러 문자열은 필드 자체가 없어서 제거돼요', () => {
		const parsed = ohaasaCardSchema.parse({
			...base,
			content: '오늘은 행운이 가득한 하루가 될 거예요.',
			lucky: '럭키 컬러: 빨강 · 행운의 열쇠: 친구',
			luckyItem: '핑크색',
			luckyKey: '친구'
		});
		expect(parsed).not.toHaveProperty('content');
		expect(parsed).not.toHaveProperty('lucky');
		expect(JSON.stringify(parsed)).not.toContain('행운이 가득한');
	});

	it('요약 필드와 기본값을 유지해요', () => {
		expect(ohaasaCardSchema.parse({ ...base, luckyItem: '핑크색' })).toEqual({
			zodiacCode: '07',
			rank: 1,
			luckyItem: '핑크색',
			date: '2026/10/09'
		});
	});

	it('별자리 코드와 순위 범위를 검증해요', () => {
		expect(ohaasaCardSchema.safeParse({ ...base, zodiacCode: '13' }).success).toBe(false);
		expect(ohaasaCardSchema.safeParse({ ...base, zodiacCode: '0' }).success).toBe(false);
		expect(ohaasaCardSchema.safeParse({ ...base, rank: 13 }).success).toBe(false);
		expect(ohaasaCardSchema.safeParse({ ...base, rank: 0 }).success).toBe(false);
	});
});
