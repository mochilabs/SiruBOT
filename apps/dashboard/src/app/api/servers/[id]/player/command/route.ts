import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeGuildMember, deniedGuildMember } from "@/lib/api-guards";
import { requestPlayerControl } from "@/lib/data-api";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";

/**
 * 라이브 컨트롤러 — 볼륨·일시정지·재생·스킵·정지를 봇에 전달해요.
 * 요청자의 관리자/DJ 권한과 음성 채널은 봇만 판정할 수 있어서 userId까지 전달하고,
 * 봇이 검증 실패를 실은 안내 문구를 그대로 응답해요 (400/502/503).
 */
const commandSchema = z
  .object({
    action: z.enum(["volume", "pause", "resume", "skip", "stop"]),
    value: z.number().int().min(0).max(150).optional(),
  })
  .refine((body) => body.action !== "volume" || typeof body.value === "number", {
    message: "volume 제어에는 value(0~150)가 필요해요.",
  });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authz = await authorizeGuildMember(id);
  if (!authz.ok) return deniedGuildMember(authz);

  const limited = await guardRateLimit(rateKey("player-command", authz.userId, id), WRITE_RATE);
  if (limited) return limited;

  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "명령 형식이 올바르지 않아요." }, { status: 400 });
  }

  const result = await requestPlayerControl(id, authz.userId, parsed.data.action, parsed.data.value);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "명령을 전달하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: result.status },
    );
  }

  return NextResponse.json({ ok: true });
}