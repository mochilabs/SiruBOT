import { describe, expect, it } from 'vitest';
import { ohaasaCardSchema } from '../routes/ohaasaCardSchema.ts';
import { renderOhaasaCard } from './ohaasaCard.ts';

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
	it('아이템+열쇠 요약 카드를 920폭 PNG로 렌더해요', async () => {
		const buffer = await renderOhaasaCard({ ...base, luckyItem: '핑크색', luckyKey: '친구' });
		expectPngSize(buffer, 920, 396);
		expect(buffer.length).toBeGreaterThan(1_000);
	});

	it('아이템만 있으면 와이드 박스 1개로 렌더해요', async () => {
		expectPngSize(await renderOhaasaCard({ ...base, luckyItem: '타올' }), 920, 396);
	});

	it('럭키 정보가 없으면 박스 없이 축약 렌더해요', async () => {
		expectPngSize(await renderOhaasaCard({ ...base }), 920, 300);
		expect((await renderOhaasaCard({ ...base })).length).toBeGreaterThan(1_000);
	});

	it('일본어로 넘어온 아이템도 그대로 그려요 (주말 원문 폴백)', async () => {
		expectPngSize(await renderOhaasaCard({ ...base, luckyItem: 'タオル', luckyKey: '手紙' }), 920, 396);
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
