import type { LyricLine } from '@sirubot/utils/lrc';
/** 봇과 공유하는 응답 스키마. 봇 `DailyHoroscope`/`WeatherResult`/lrclib 형태와 호환돼요. */

/** 별자리 코드 → 정보 매핑 (봇 `apps/bot/src/features/games/application/ohaasaService.ts`와 같은 값, 이중 정의는 유지 판정) */
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
	translated: boolean;
	horoscopes: HoroscopeData[];
}

export interface LyricsResult {
	trackName: string;
	artistName: string;
	plainLyrics: string | null;
	syncedLyrics: string | null;
	/** 아래는 노래방 가사용 추가 필드예요 — 기존 소비자(봇 /음악 가사)는 무시해도 돼요. */
	/** LRCLIB 길이(초) */
	durationSec?: number | null;
	/** 단어 단위 싱크가 있는지 (`wordSync`가 채워졌을 때만 true) */
	hasWordSync?: boolean;
	/** 단어 싱크 줄 목록 — 시각은 `lyricsfile` 기준이라 `syncedLyrics`와 몇 백 ms 다를 수 있어요. */
	wordSync?: LyricLine[] | null;
	/** 어떻게 찾았는지: get(제목·아티스트·길이 정확 조회) | search(필드 검색+선택 규칙) | query(자유 검색 첫 결과) */
	matchKind?: 'get' | 'search' | 'query';
	/** 한국어 번역 — `/v1/lyrics` 응답에서 캐시와 따로 붙어요. lines는 원문 줄 → 번역이에요. */
	translation?: { status: 'ready' | 'pending' | 'none'; lines: Record<string, string> | null };
}
