import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { fetchDataApi } from "@/lib/data-api";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";

/* ─────────────────────────── data-api 응답 타입 ─────────────────────────── */

export interface OhaasaHoroscope {
  rank: number;
  zodiacCode: string;
  zodiac: { jp: string; ko: string; en: string };
  content: string;
  lucky: string;
}

export interface OhaasaProxyResponse {
  date: string;
  source: string;
  translated: boolean;
  _cached?: unknown;
  horoscopes: OhaasaHoroscope[];
}

/* ─────────────────────────── 오하아사 운세 (view only) ─────────────────────────── */

/**
 * 오하아사 운세 프록시 — data-api `GET /v1/ohaasa`(AUTH_KEY 인증)를 세션 검증 뒤에서
 * 대신 호출해요. 운세는 서버별 데이터가 아니라 전체 공용 데이터예요.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const limited = guardRateLimit(rateKey("ohaasa-get", session.user.id), READ_RATE);
  if (limited) return limited;

  const data = await fetchDataApi<OhaasaProxyResponse>("/v1/ohaasa");
  if (!data) {
    // data-api 미설정/장애
    return NextResponse.json(
      { error: "운세 데이터를 불러오지 못했어요." },
      { status: 502 },
    );
  }

  return NextResponse.json(data);
}