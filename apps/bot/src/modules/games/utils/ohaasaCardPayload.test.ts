import { describe, expect, it } from 'vitest';
import { buildOhaasaCardRequest, splitOhaasaLucky } from './ohaasaCardPayload.ts';
import type { HoroscopeData } from './ohaasaService.ts';

/** 오하아사 카드 payload — 럭키 분리와 "설명 없는 요약 payload" 계약을 검증해요. */

function target(overrides: Partial<HoroscopeData> = {}): HoroscopeData {
	return {
		rank: 3,
		zodiacCode: '07',
		zodiac: { jp: 'てんびん座', ko: '천칭자리', en: 'Libra' },
		content: '오늘은 마음이 편안해지고 좋은 일이 있을 거예요.',
		lucky: '럭키 컬러: 빨강 · 행운의 열쇠: 친구',
		...overrides
	};
}

describe('splitOhaasaLucky', () => {
	it('주중 오하아사 단일 아이템은 아이템으로 분류해요', () => {
		expect(splitOhaasaLucky('핑크색')).toEqual({ item: '핑크색', key: '' });
		expect(splitOhaasaLucky('타올')).toEqual({ item: '타올', key: '' });
	});

	it('주말 번역본에서 럭키 컬러는 버리고 열쇠만 남겨요', () => {
		expect(splitOhaasaLucky('럭키 컬러: 빨강 · 행운의 열쇠: 친구')).toEqual({ item: '', key: '친구' });
	});

	it('일본어 원문(TV아사히) 형식도 파싱해요', () => {
		expect(splitOhaasaLucky('ラッキーカラー：赤 / 幸運のカギ：手紙')).toEqual({ item: '', key: '手紙' });
	});

	it('라벨 있는 아이템과 열쇠를 함께 나눠요', () => {
		expect(splitOhaasaLucky('럭키 아이템: 펜케이스 / 행운의 열쇠: 열쇠고리')).toEqual({ item: '펜케이스', key: '열쇠고리' });
	});

	it('라벨 없이 섞여 있으면 전부 아이템으로 돌려요 (보수적 폴백)', () => {
		expect(splitOhaasaLucky('빨강 / 친구')).toEqual({ item: '빨강 / 친구', key: '' });
	});

	it('빈 입력은 빈 값이에요', () => {
		expect(splitOhaasaLucky('')).toEqual({ item: '', key: '' });
	});
});

describe('buildOhaasaCardRequest', () => {
	it('payload에는 운세 설명과 럭키 컬러가 아예 없어요 (이미지는 요약 전용)', () => {
		const request = buildOhaasaCardRequest(target(), '2026/10/09');
		expect(request).not.toHaveProperty('content');
		expect(request).not.toHaveProperty('lucky');
		const serialized = JSON.stringify(request);
		expect(serialized).not.toContain('편안');
		expect(serialized).not.toContain('빨강');
		expect(request).toEqual({ zodiacCode: '07', rank: 3, luckyKey: '친구', date: '2026/10/09' });
	});

	it('주중 단일 아이템은 luckyItem으로 넘어가요', () => {
		expect(buildOhaasaCardRequest(target({ lucky: '타올' }), '2026/10/09')).toEqual({
			zodiacCode: '07',
			rank: 3,
			luckyItem: '타올',
			date: '2026/10/09'
		});
	});
});
