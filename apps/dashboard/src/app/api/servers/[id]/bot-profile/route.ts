import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { fetchDataApi, postDataApi } from "@/lib/data-api/client";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import type { BotProfilePatch, BotProfileResponse } from "@/types/bot-profile";

/** 아바타 업로드 상한 — 3MiB 파일이면 data URI로 약 4.2MB, data-api 라우트 한도(8MiB) 안이에요 */
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
/** Discord 멤버 닉네임 길이 제한이에요 */
const MAX_NICKNAME_LENGTH = 32;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE_MB = Math.floor(MAX_AVATAR_BYTES / 1024 / 1024);

/**
 * 이미지 파일 검증 — 크기·MIME을 확인하고 base64 data URI로 바꿔요.
 * 실패 사유는 문자열로 돌려주고, 호출한 쪽에서 400으로 응답해요.
 */
async function toImageDataUri(file: File): Promise<{ dataUri: string } | { error: string }> {
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: `이미지가 너무 커요. 최대 ${MAX_IMAGE_MB}MB까지 올릴 수 있어요.` };
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { error: "PNG, JPEG, GIF, WebP 이미지만 지원해요." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  return { dataUri: `data:${file.type};base64,${bytes.toString("base64")}` };
}

interface DataApiOk {
  ok: boolean;
}

export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "bot-profile-get",
  handler: async ({ guildId }) => {
    const data = await fetchDataApi<BotProfileResponse>(`/v1/bot-profile/${guildId}`);
    if (!data) {
      // data-api 미설정/장애 — SWR 폴백이 "상태 없음" 화면을 그려요.
      return NextResponse.json({ error: "봇 프로필 상태를 불러오지 못했어요." }, { status: 502 });
    }

    return NextResponse.json(data);
  },
});

/**
 * 봇 프로필 저장 — Discord `PATCH /guilds/{id}/members/@me`로 봇 자기 닉네임·길드 아바타를 바꿔요.
 * 봇 토큰은 대시보드가 모르므로 data-api → Redis → 봇 프로세스로 전달해요.
 * nickname은 빈 문자열이면 null(사용자명 표시로 초기화)로 정규화해요.
 */
export const PATCH = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "bot-profile-patch",
  handler: async ({ guildId, request }) => {
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
    }

    const patchBody: BotProfilePatch = { guildId };

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
      const avatar = await toImageDataUri(avatarFile);
      if ("error" in avatar) {
        return NextResponse.json({ error: avatar.error }, { status: 400 });
      }
      patchBody.avatar = avatar.dataUri;
    } else if (avatarReset === "1") {
      patchBody.avatar = null;
    }

    const bannerFile = form.get("banner");
    const bannerReset = form.get("bannerReset");
    if (bannerFile instanceof File && bannerFile.size > 0) {
      const banner = await toImageDataUri(bannerFile);
      if ("error" in banner) {
        return NextResponse.json({ error: banner.error }, { status: 400 });
      }
      patchBody.banner = banner.dataUri;
    } else if (bannerReset === "1") {
      patchBody.banner = null;
    }

    if (!("nickname" in patchBody) && !("avatar" in patchBody) && !("banner" in patchBody)) {
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
  },
});
