import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { notifyPlayerCommand } from "@/lib/data-api";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";

const commandSchema = z
  .object({
    action: z.enum(["volume", "pause", "resume", "skip"]),
    value: z.number().int().min(0).max(150).optional(),
  })
  .refine((body) => body.action !== "volume" || typeof body.value === "number", {
    message: "volume 명령에는 value(0~150)가 필요해요.",
  });

/**
 * 라이브 탭 컨트롤러 — 볼륨·일시정지·재생·스킵을 봇 프로세스에 브로드캐스트해요.
 * data-api가 Redis 채널로 publish하고, 플레이어를 보유한 봇만 즉시 적용해요.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = guardRateLimit(rateKey("player-command", authz.userId, id), WRITE_RATE);
  if (limited) return limited;

  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "명령 형식이 올바르지 않아요." }, { status: 400 });
  }

  const sent = await notifyPlayerCommand(id, parsed.data);
  if (!sent) {
    return NextResponse.json(
      { error: "명령을 전달하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}