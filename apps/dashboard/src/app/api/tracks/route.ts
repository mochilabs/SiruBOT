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
    return NextResponse.json(await fetchChart(parsed.data));
  } catch (error) {
    console.error("Failed to fetch tracks:", error);
    return NextResponse.json(
      { error: "곡 목록을 불러오지 못했어요." },
      { status: 500 },
    );
  }
}
