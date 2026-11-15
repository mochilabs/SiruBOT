import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { guardRateLimit, publicReadLimit, rateKey } from "@/lib/rate-limit";
import { CHART_PERIODS, fetchChart } from "@/lib/track-chart";

const tracksQuerySchema = z.object({
  query: z.string().max(200).default(""),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  period: z.enum(CHART_PERIODS).default("week"),
});

export async function GET(request: Request) {
  // 공개 차트 엔드포인트 — 읽기 전용 공개 메타데이터라 로그인 없이 허용해요.
  // 비로그인 요청은 전역 공용 버킷(PUBLIC_RATE)으로 묶어요 — X-Forwarded-For 헤더는 클라이언트가
  // 위조할 수 있어 주체로 쓰지 않아요(요청마다 새 버킷이 생기는 한도 우회 방지, SEC-002).
  const session = await auth();
  const limit = publicReadLimit(session?.user?.id);

  const limited = await guardRateLimit(rateKey("tracks-get", limit.subject), limit.rule);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);

  const parsed = tracksQuerySchema.safeParse({
    query: searchParams.get("query") || "",
    page: searchParams.get("page") || "1",
    period: searchParams.get("period") || "week",
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  try {
    // 곡 묶음(Recording) 단위 기간 차트 — 같은 노래의 여러 업로드·소스는 한 줄로 합쳐져요 (lib/track-chart.ts).
    return NextResponse.json(await fetchChart(parsed.data));
  } catch (error) {
    console.error("Failed to fetch tracks:", error);
    return NextResponse.json(
      { error: "곡 목록을 불러오지 못했어요." },
      { status: 500 },
    );
  }
}
