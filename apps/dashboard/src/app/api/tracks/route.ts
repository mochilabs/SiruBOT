import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import { fixedTrackFilter, PAGE_SIZE } from "@/lib/track-constants";

const tracksQuerySchema = z.object({
  query: z.string().max(200).default(""),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

/** Prisma contains(ILIKE) 와일드카드 이스케이프 — %, _, \를 리터럴로 취급해요 */
function escapeLikeWildcard(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function GET(request: Request) {
  // 공개 차트 엔드포인트 — 읽기 전용 공개 메타데이터라 로그인 없이 허용해요.
  // 비로그인 요청은 IP 기준으로 같은 READ_RATE 한도를 적용해 남용을 막아요.
  const session = await auth();
  const subject =
    session?.user?.id ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";

  const limited = await guardRateLimit(
    rateKey("tracks-get", subject),
    READ_RATE,
  );
  if (limited) return limited;

  const { searchParams } = new URL(request.url);

  const parsed = tracksQuerySchema.safeParse({
    query: searchParams.get("query") || "",
    page: searchParams.get("page") || "1",
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { query, page: currentPage } = parsed.data;

  const containsQuery = query ? escapeLikeWildcard(query) : "";

  const where = query
    ? {
        ...fixedTrackFilter,
        OR: [
          { title: { contains: containsQuery, mode: "insensitive" as const } },
          { artist: { contains: containsQuery, mode: "insensitive" as const } },
        ],
      }
    : fixedTrackFilter;

  try {
    const [tracks, totalCount, totalPlaybacks] = await Promise.all([
      db.track.findMany({
        orderBy: [{ totalPlays: "desc" }, { updatedAt: "desc" }],
        where,
        take: PAGE_SIZE,
        skip: (currentPage - 1) * PAGE_SIZE,
      }),
      db.track.count({
        where,
      }),
      db.track.aggregate({
        _sum: {
          totalPlays: true,
        },
        where,
      }),
    ]);

    return NextResponse.json({
      tracks,
      totalCount,
      totalPlaybacks,
      totalPages: Math.ceil(totalCount / PAGE_SIZE),
      currentPage,
    });
  } catch (error) {
    console.error("Failed to fetch tracks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tracks" },
      { status: 500 },
    );
  }
}
