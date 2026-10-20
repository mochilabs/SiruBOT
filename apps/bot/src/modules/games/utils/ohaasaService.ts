/** 별자리 코드 → 정보 매핑 */
export const ZODIAC_MAP: Record<string, { jp: string; ko: string; en: string }> = {
	'01': { jp: 'おひつじ座', ko: '양자리', en: 'Aries' },
	'02': { jp: 'おうし座', ko: '황소자리', en: 'Taurus' },
	'03': { jp: 'ふたご座', ko: '쌍둥이자리', en: 'Gemini' },
	'04': { jp: 'かに座', ko: '게자리', en: 'Cancer' },
	'05': { jp: 'しし座', ko: '사자자리', en: 'Leo' },
	'06': { jp: 'おとめ座', ko: '처녀자리', en: 'Virgo' },
	'07': { jp: 'てんびん座', ko: '천칭자리', en: 'Libra' },
	'08': { jp: 'さそり座', ko: '전갈자리', en: 'Scorpio' },
	'09': { jp: 'いて座', ko: '사수자리', en: 'Sagittarius' },
	'10': { jp: 'やぎ座', ko: '염소자리', en: 'Capricorn' },
	'11': { jp: 'みずがめ座', ko: '물병자리', en: 'Aquarius' },
	'12': { jp: 'うお座', ko: '물고기자리', en: 'Pisces' }
};

export const ZODIAC_CHOICES = Object.entries(ZODIAC_MAP).map(([code, info]) => ({ code, ...info }));

/** 생일(월, 일)을 입력받아 별자리 코드(01~12) 반환 */
export function getZodiacFromDate(month: number, day: number): string | null {
	if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return '01';
	if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return '02';
	if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) return '03';
	if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) return '04';
	if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return '05';
	if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return '06';
	if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return '07';
	if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return '08';
	if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return '09';
	if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return '10';
	if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return '11';
	if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return '12';
	return null;
}

export interface HoroscopeData {
	rank: number;
	zodiacCode: string;
	zodiac: { jp: string; ko: string; en: string };
	content: string;
	lucky: string;
}

export interface DailyHoroscope {
	date: string;
	source: 'ohaasa' | 'tv-asahi';
	/** content/lucky가 AI로 한국어 번역됐는지 (false면 일본어 원문) */
	translated: boolean;
	horoscopes: HoroscopeData[];
}
