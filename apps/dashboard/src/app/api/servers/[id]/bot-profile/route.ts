import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { fetchDataApi, postDataApi } from "@/lib/data-api";
import { guardRateLimit, rateKey, READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import type { BotProfilePatch, BotProfileResponse } from "@/types/bot-profile";

/** 아바타 업로드 상한 — 3MiB 파일이면 data URI로 약 4.2MB, data-api 라우트 한도(8MiB) 안이에요 */
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
/** Discord 멤버 닉네임 길이 제한이에요 */
const MAX_NICKNAME_LENGTH = 32;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

interface DataApiOk {
  ok: boolean;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = guardRateLimit(rateKey("bot-profile-get", authz.userId, id), READ_RATE);
  if (limited) return limited;

  const data = await fetchDataApi<BotProfileResponse>(`/v1/bot-profile/${id}`);
  if (!data) {
    // data-api 미설정/장애 — SWR 폴백이 "상태 없음" 화면을 그려요.
    return NextResponse.json({ error: "봇 프로필 상태를 불러오지 못했어요." }, { status: 502 });
  }

  return NextResponse.json(data);
}

/**
 * 봇 프로필 저장 — Discord `PATCH /guilds/{id}/members/@me`로 봇 자기 닉네임·길드 아바타를 바꿔요.
 * 봇 토큰은 대시보드가 모르므로 data-api → Redis → 봇 프로세스로 전달해요.
 * nickname은 빈 문자열이면 null(사용자명 표시로 초기화)로 정규화해요.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = guardRateLimit(rateKey("bot-profile-patch", authz.userId, id), WRITE_RATE);
  if (limited) return limited;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const patchBody: BotProfilePatch = { guildId: id };

  // nickname — 값이 온 경우에만 변경. 빈 문자열/공백은 초기화예요.
  const rawNickname = form.get("nickname");
  if (typeof rawNickname === "string") {
    const nickname = rawNickname.trim();
    if (nickname.length > MAX_NICKNAME_LENGTH) {
      return NextResponse.json(
        { error: `닉네임은 최대 ${MAX_NICKNAME_LENGTH}자까지 가능해요.` },
        { status: 400 },
      );
    }
    patchBody.nickname = nickname.length > 0 ? nickname : null;
  }

  const avatarFile = form.get("avatar");
  const avatarReset = form.get("avatarReset");
  if (avatarFile instanceof File && avatarFile.size > 0) {
    if (avatarFile.size > MAX_AVATAR_BYTES) {
      return NextResponse.json({ error: "이미지가 너무 커요. 최대 3MB까지 올릴 수 있어요." }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(avatarFile.type)) {
      return NextResponse.json({ error: "PNG, JPEG, GIF, WebP 이미지만 지원해요." }, { status: 400 });
    }
    const bytes = Buffer.from(await avatarFile.arrayBuffer());
    patchBody.avatar = `data:${avatarFile.type};base64,${bytes.toString("base64")}`;
  } else if (avatarReset === "1") {
    patchBody.avatar = null;
  }

  if (!("nickname" in patchBody) && !("avatar" in patchBody)) {
    return NextResponse.json({ error: "변경할 내용이 없어요." }, { status: 400 });
  }

  const result = await postDataApi<DataApiOk>("/v1/internal/bot-profile/set", patchBody);
  if (result?.ok !== true) {
    return NextResponse.json(
      { error: "봇에 저장 요청을 전달하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}