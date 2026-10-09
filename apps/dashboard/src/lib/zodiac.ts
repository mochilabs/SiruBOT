/** 별자리 코드 → 한글 이름 (봇 ohaasaService.ts와 동일한 목록) */
const ZODIAC_KO: Record<string, string> = {
  "01": "양자리",
  "02": "황소자리",
  "03": "쌍둥이자리",
  "04": "게자리",
  "05": "사자자리",
  "06": "처녀자리",
  "07": "천칭자리",
  "08": "전갈자리",
  "09": "사수자리",
  "10": "염소자리",
  "11": "물병자리",
  "12": "물고기자리",
};

export interface ZodiacInfo {
  code: string;
  ko: string;
}

/**
 * 생일(월, 일) → 별자리 코드/한글 이름. 범위 밖이면 null.
 * 분기 경계는 봇 `apps/bot/src/modules/games/utils/ohaasaService.ts`와 동일해요.
 */
export function getZodiac(month: number, day: number): ZodiacInfo | null {
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return { code: "01", ko: ZODIAC_KO["01"]! };
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return { code: "02", ko: ZODIAC_KO["02"]! };
  if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) return { code: "03", ko: ZODIAC_KO["03"]! };
  if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) return { code: "04", ko: ZODIAC_KO["04"]! };
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return { code: "05", ko: ZODIAC_KO["05"]! };
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return { code: "06", ko: ZODIAC_KO["06"]! };
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return { code: "07", ko: ZODIAC_KO["07"]! };
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return { code: "08", ko: ZODIAC_KO["08"]! };
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return { code: "09", ko: ZODIAC_KO["09"]! };
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return { code: "10", ko: ZODIAC_KO["10"]! };
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return { code: "11", ko: ZODIAC_KO["11"]! };
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return { code: "12", ko: ZODIAC_KO["12"]! };
  return null;
}
