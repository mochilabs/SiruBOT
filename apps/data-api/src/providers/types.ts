/** 봇과 공유하는 응답 스키마. 봇 `DailyHoroscope`/`WeatherResult`/lrclib 형태와 호환돼요. */

/** 별자리 코드 → 정보 매핑 (봇 `ohaasaService.ts`와 동일) */
export const ZODIAC_MAP: Record<
  string,
  { jp: string; ko: string; en: string }
> = {
  "01": { jp: "おひつじ座", ko: "양자리", en: "Aries" },
  "02": { jp: "おうし座", ko: "황소자리", en: "Taurus" },
  "03": { jp: "ふたご座", ko: "쌍둥이자리", en: "Gemini" },
  "04": { jp: "かに座", ko: "게자리", en: "Cancer" },
  "05": { jp: "しし座", ko: "사자자리", en: "Leo" },
  "06": { jp: "おとめ座", ko: "처녀자리", en: "Virgo" },
  "07": { jp: "てんびん座", ko: "천칭자리", en: "Libra" },
  "08": { jp: "さそり座", ko: "전갈자리", en: "Scorpio" },
  "09": { jp: "いて座", ko: "사수자리", en: "Sagittarius" },
  "10": { jp: "やぎ座", ko: "염소자리", en: "Capricorn" },
  "11": { jp: "みずがめ座", ko: "물병자리", en: "Aquarius" },
  "12": { jp: "うお座", ko: "물고기자리", en: "Pisces" },
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
  source: "ohaasa" | "tv-asahi";
  translated: boolean;
  horoscopes: HoroscopeData[];
}

export interface LyricsResult {
  trackName: string;
  artistName: string;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}
