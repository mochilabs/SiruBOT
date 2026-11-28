import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { fetchDataApi } from "@/lib/data-api/client";
import { READ_RATE } from "@/lib/rate-limit";

const lyricsQuerySchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().max(200).default(""),
  durationMs: z.coerce.number().int().min(0).max(24 * 3600 * 1000).default(0),
  source: z.string().trim().max(40).optional(),
  videoId: z.string().regex(/^[\w-]{11}$/).optional(),
});

const wordSchema = z.object({ startMs: z.number(), text: z.string() });
const lineSchema = z.object({
  startMs: z.number(),
  text: z.string(),
  endMs: z.number().nullable().optional(),
  words: z.array(wordSchema).optional(),
});

const lyricsResponseSchema = z.object({
  trackName: z.string(),
  artistName: z.string(),
  plainLyrics: z.string().nullable(),
  syncedLyrics: z.string().nullable(),
  hasWordSync: z.boolean().optional(),
  wordSync: z.array(lineSchema).nullable().optional(),
  translation: z
    .object({
      status: z.enum(["ready", "pending", "none"]),
      lines: z.record(z.string(), z.string()).nullable(),
    })
    .optional(),
});

export type LyricsPayload = z.infer<typeof lyricsResponseSchema>;

export const GET = createGuildApiHandler({
  role: "member",
  rate: READ_RATE,
  key: "lyrics-get",
  handler: async ({ request }) => {
    const query = lyricsQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) {
      return NextResponse.json({ error: "곡 정보가 올바르지 않아요." }, { status: 400 });
    }
    const { title, artist, durationMs, source, videoId } = query.data;
    const params = new URLSearchParams({ title, artist, durationMs: String(durationMs) });
    if (source) params.set("source", source);
    if (videoId) params.set("videoId", videoId);

    const data = await fetchDataApi<unknown>(`/v1/lyrics?${params}`);
    const parsed = lyricsResponseSchema.safeParse(data);
    if (!parsed.success) {
      return NextResponse.json({ error: "가사를 찾지 못했어요." }, { status: 404 });
    }
    return NextResponse.json(parsed.data);
  },
});
