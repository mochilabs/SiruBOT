import { container } from '@sapphire/framework';

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

const TVASAHI_ZODIAC_MAP: Record<string, string> = {
	ohitsuji: '01',
	ousi: '02',
	futago: '03',
	kani: '04',
	sisi: '05',
	otome: '06',
	tenbin: '07',
	sasori: '08',
	ite: '09',
	yagi: '10',
	mizugame: '11',
	uo: '12'
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
	horoscopes: HoroscopeData[];
}

let cachedHoroscope: DailyHoroscope | null = null;
let cachedDateStr: string | null = null;

/** 일본 시간 기준 운세 날짜 (오전 7시 이전이면 전날) */
function getHoroscopeDate(): Date {
	const now = new Date();
	const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
	if (japanTime.getHours() < 7) japanTime.setDate(japanTime.getDate() - 1);
	return japanTime;
}

function isWeekendInJapan(): boolean {
	const day = getHoroscopeDate().getDay();
	return day === 0 || day === 6;
}

function getTodayDateString(): string {
	const japanTime = getHoroscopeDate();
	const year = japanTime.getFullYear();
	const month = String(japanTime.getMonth() + 1).padStart(2, '0');
	const day = String(japanTime.getDate()).padStart(2, '0');
	return `${year}/${month}/${day}`;
}

function parseRanking(html: string): Record<string, number> {
	const ranking: Record<string, number> = {};
	const rankBoxMatch = html.match(/<ul[^>]*class="[^"]*rank-box[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
	if (rankBoxMatch) {
		const liRegex = /<li[^>]*>[\s\S]*?<a[^>]*data-label="([^"]+)"[^>]*>[\s\S]*?<\/li>/gi;
		let match: RegExpExecArray | null;
		let rank = 1;
		while ((match = liRegex.exec(rankBoxMatch[1])) !== null) {
			ranking[match[1]] = rank++;
		}
	}
	return ranking;
}

function parseTVAsahiHTML(html: string): HoroscopeData[] {
	const results: HoroscopeData[] = [];
	const ranking = parseRanking(html);

	for (const zodiacId of Object.keys(TVASAHI_ZODIAC_MAP)) {
		const code = TVASAHI_ZODIAC_MAP[zodiacId];
		if (!code) continue;
		const zodiac = ZODIAC_MAP[code];
		if (!zodiac) continue;

		const sectionMatch = html.match(
			new RegExp(
				`<div[^>]*class="seiza-box"[^>]*id="${zodiacId}"[^>]*>([\\s\\S]*?)(?=<div[^>]*class="seiza-box"|<\\/div>\\s*<\\/div>\\s*<!--\\s*seiza-area)`,
				'i'
			)
		);
		if (!sectionMatch) continue;
		const section = sectionMatch[1];

		let content = '';
		const readMatch = section.match(/<div[^>]*class="read-area"[^>]*>([\s\S]*?)<\/div>/i);
		if (readMatch) {
			const pMatch = readMatch[1].match(/<p[^>]*class="read"[^>]*>([\s\S]*?)<\/p>/i);
			if (pMatch) content = pMatch[1].replace(/<[^>]+>/g, '').trim();
		}

		const colorMatch = section.match(/<span[^>]*class="[^"]*lucky-color-txt[^"]*"[^>]*>[^<]*<\/span>：([^<]+)/i);
		const keyMatch = section.match(/<span[^>]*class="[^"]*key-txt[^"]*"[^>]*>[^<]*<\/span>：([^<]+)/i);

		results.push({
			rank: ranking[zodiacId] || parseInt(code, 10),
			zodiacCode: code,
			zodiac,
			content,
			lucky: `ラッキーカラー：${colorMatch ? colorMatch[1].trim() : ''} / 幸運のカギ：${keyMatch ? keyMatch[1].trim() : ''}`
		});
	}

	results.sort((a, b) => a.rank - b.rank);
	return results;
}

async function fetchWeekendHoroscope(): Promise<HoroscopeData[]> {
	const res = await fetch('https://www.tv-asahi.co.jp/goodmorning/uranai/', {
		headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok) throw new Error(`TV Asahi fetch failed: ${res.status}`);
	const parsed = parseTVAsahiHTML(await res.text());
	if (parsed.length === 0) throw new Error('Failed to parse TV Asahi horoscope data');
	return parsed;
}

function parseHoroscopeText(text: string): { content: string; lucky: string } {
	const parts = text.split('\t').filter((p) => p.trim());
	if (parts.length === 0) return { content: '', lucky: '' };
	return { content: parts.slice(0, -1).join(' '), lucky: parts[parts.length - 1] };
}

/** 오늘의 오하아사(아사히 방송) 운세 — JSON API 우선, 주말/실패 시 TV아사히 크롤링 */
export async function fetchOhaasa(): Promise<DailyHoroscope> {
	const todayStr = getTodayDateString();
	const todayCompact = todayStr.replace(/\//g, '');

	if (cachedDateStr === todayStr && cachedHoroscope) return cachedHoroscope;

	let parsed: HoroscopeData[] = [];
	let source: DailyHoroscope['source'] = 'ohaasa';
	let dateStr = todayStr;

	if (!isWeekendInJapan()) {
		try {
			const res = await fetch('https://www.asahi.co.jp/data/ohaasa2020/horoscope.json', {
				headers: { 'User-Agent': 'Mozilla/5.0' },
				signal: AbortSignal.timeout(10_000)
			});
			if (res.ok) {
				const rawData = await res.json();
				const item = Array.isArray(rawData) ? rawData[0] : rawData;
				if (item?.onair_date === todayCompact && item.detail) {
					dateStr = item.onair_date;
					parsed = (item.detail as any[])
						.sort((a, b) => parseInt(a.ranking_no, 10) - parseInt(b.ranking_no, 10))
						.map((d) => {
							const zodiacCode = d.horoscope_st as string;
							const { content, lucky } = parseHoroscopeText(d.horoscope_text);
							return {
								rank: parseInt(d.ranking_no, 10),
								zodiacCode,
								zodiac: ZODIAC_MAP[zodiacCode] ?? { jp: '', ko: '', en: '' },
								content,
								lucky
							};
						});
				}
			}
		} catch (e) {
			container.logger.warn('ohaasa.fetch_failed_fallback_to_tvasahi', { error: String(e) });
		}
	}

	if (parsed.length === 0) {
		dateStr = todayStr;
		parsed = await fetchWeekendHoroscope();
		source = 'tv-asahi';
	}

	const daily: DailyHoroscope = { date: dateStr, source, horoscopes: parsed };
	cachedDateStr = todayStr;
	cachedHoroscope = daily;
	return daily;
}
