import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardRateLimit, publicReadLimit, rateKey } from "@/lib/rate-limit";
import { fetchShards } from "@/lib/shard-api";

export async function GET() {
  // 공개 상태 엔드포인트 — 샤드 매니저의 실시간 상태는 로그인 없이 허용해요.
  // 비로그인 요청은 전역 공용 버킷(PUBLIC_RATE)으로 묶어요 — 요청 헤더를 주체로 쓰지 않아 한도 우회를 막아요(SEC-002).
  const session = await auth();
  const limit = publicReadLimit(session?.user?.id);

  const limited = await guardRateLimit(rateKey("shards-get", limit.subject), limit.rule);
  if (limited) return limited;

  try {
    const data = await fetchShards();
    if (!data)
      return NextResponse.json({ error: "샤드 정보를 불러오지 못했어요." }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch shards:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
