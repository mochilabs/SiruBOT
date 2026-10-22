"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCcw, UserRoundCog } from "lucide-react";

import { Field } from "@/components/primitives/field";
import {
  AvatarCropModal,
  shouldSkipCrop,
} from "@/components/servers/avatar-crop-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useBotProfile } from "@/hooks/use-bot-profile";
import { notifyApiError } from "@/lib/notify";

import {
  PanelError,
  PanelHeader,
  PanelLoading,
  SaveBar,
  WarningBox,
} from "./settings-shared";

const MAX_NICKNAME_LENGTH = 32;
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";

/** lastApply.error를 패널 문구로 바꿔요 — missing_permission은 사용자가 조치할 수 있는 안내로 특별 처리해요 */
function describeApplyError(error: string): string {
  if (error === "missing_permission") {
    return "봇에게 닉네임 변경 권한이 없어요. 서버에서 봇 역할에 권한을 추가해 주세요.";
  }
  return error;
}

function BotProfileSettingsPanel({ guildId }: { guildId: string }) {
  const toast = useToast();
  const { profile, refreshFailed, isLoading, error, saving, save, reload } =
    useBotProfile(guildId);

  const [nickname, setNickname] = useState("");
  const [nicknameTouched, setNicknameTouched] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarReset, setAvatarReset] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerReset, setBannerReset] = useState(false);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<{
    file: File;
    shape: "avatar" | "banner";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // 서버 값이 도착하면 입력값을 채워요 — 사용자가 건드리기 전까지만 동기화해요.
  useEffect(() => {
    if (profile && !nicknameTouched) setNickname(profile.nickname ?? "");
  }, [profile, nicknameTouched]);

  // 파일 미리보기 — 교체/해제 시 이전 URL을 즉시 회수해요.
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    if (!bannerFile) {
      setBannerPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(bannerFile);
    setBannerPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bannerFile]);

  const handleAvatarPick = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (file.size > MAX_AVATAR_BYTES) {
        toast.error("이미지가 너무 커요. 최대 3MB까지 올릴 수 있어요.");
        return;
      }
      if (!ACCEPTED_IMAGE_TYPES.split(",").includes(file.type)) {
        toast.error("PNG, JPEG, GIF, WebP 이미지만 지원해요.");
        return;
      }
      // GIF는 애니메이션이 살아있어야 해서 자르지 않고 그대로 써요. 나머지는 크롭 모달로.
      if (shouldSkipCrop(file)) {
        setAvatarFile(file);
        setAvatarReset(false);
        return;
      }
      setCropSource({ file, shape: "avatar" });
    },
    [toast],
  );

  const handleBannerPick = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (file.size > MAX_AVATAR_BYTES) {
        toast.error("이미지가 너무 커요. 최대 3MB까지 올릴 수 있어요.");
        return;
      }
      if (!ACCEPTED_IMAGE_TYPES.split(",").includes(file.type)) {
        toast.error("PNG, JPEG, GIF, WebP 이미지만 지원해요.");
        return;
      }
      if (shouldSkipCrop(file)) {
        setBannerFile(file);
        setBannerReset(false);
        return;
      }
      setCropSource({ file, shape: "banner" });
    },
    [toast],
  );

  const handleCropApply = useCallback(
    (file: File) => {
      if (cropSource?.shape === "banner") {
        setBannerFile(file);
        setBannerReset(false);
      } else {
        setAvatarFile(file);
        setAvatarReset(false);
      }
      setCropSource(null);
    },
    [cropSource],
  );

  const handleSave = useCallback(async () => {
    const form = new FormData();
    if (avatarFile) form.append("avatar", avatarFile);
    else if (avatarReset) form.append("avatarReset", "1");
    if (bannerFile) form.append("banner", bannerFile);
    else if (bannerReset) form.append("bannerReset", "1");
    if (nicknameTouched && nickname.trim() !== (profile?.nickname ?? "")) {
      form.append("nickname", nickname.trim());
    }
    if ([...form.keys()].length === 0) return;

    try {
      await save(form);
      setNicknameTouched(false);
      setAvatarFile(null);
      setAvatarReset(false);
      setBannerFile(null);
      setBannerReset(false);
      toast.success("봇 프로필을 저장했어요.", "봇이 Discord에 곧 적용해요.");
    } catch (err) {
      notifyApiError(err, "저장에 실패했어요.");
    }
  }, [
    avatarFile,
    avatarReset,
    bannerFile,
    bannerReset,
    nickname,
    nicknameTouched,
    profile?.nickname,
    save,
    toast,
  ]);

  // 로드 실패/초기 로딩부터는 조기 반환해요 — 모든 훅은 위에서 호출됐어요.
  if (error) return <PanelError error={error} onRetry={reload} />;
  if (isLoading && !profile)
    return <PanelLoading label="봇 프로필 상태 불러오는 중…" />;
  if (!profile) {
    return (
      <Card padding="lg" className="gap-4">
        <PanelHeader
          icon={<UserRoundCog className="h-5 w-5" />}
          title="봇 프로필"
          description="봇이 이 서버에서 보여질 이름과 프로필 사진을 관리해요."
        />
        <WarningBox>
          {refreshFailed
            ? "봇에서 최신 프로필 상태를 받지 못했어요. 봇이 서버에 접속해 있는지 확인하고 다시 시도해 주세요."
            : "봇이 이 서버의 프로필 상태를 아직 보내지 않았어요. 봇 접속 상태를 확인하고 잠시 후 시도해 주세요."}{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={reload}
          >
            다시 시도
          </button>
        </WarningBox>
      </Card>
    );
  }

  const nicknameDisabled = !profile.canChangeNickname;
  const originalNickname = profile.nickname ?? "";
  const nicknameDirty = nicknameTouched && nickname.trim() !== originalNickname;
  const dirty =
    nicknameDirty ||
    avatarFile !== null ||
    avatarReset ||
    bannerFile !== null ||
    bannerReset;
  // 미리보기: 새 파일 → 초기화 요청이면 전역 아바타 → 현재 길드 아바타 → 전역 아바타 순이에요.
  const previewUrl =
    avatarPreviewUrl ??
    (avatarReset ? profile.globalAvatarUrl : null) ??
    profile.guildAvatarUrl ??
    profile.globalAvatarUrl;
  const previewCaption = avatarPreviewUrl
    ? "새 아바타 미리보기예요. 저장하면 이 서버에서만 보여요."
    : avatarReset
      ? "기본 아바타로 초기화되고 있어요."
      : profile.guildAvatarUrl
        ? "이 서버 전용 아바타를 사용 중이에요."
        : "전역(앱) 아바타를 그대로 사용 중이에요. 이 서버에만 다른 사진을 넣을 수 있어요.";
  const bannerPreview =
    bannerPreviewUrl ?? (bannerReset ? null : profile.guildBannerUrl);
  const bannerCaption = bannerPreviewUrl
    ? "새 배너 미리보기예요. 16:5 비율로 잘려요. 저장하면 이 서버에서만 보여요."
    : bannerReset
      ? "배너를 제거하고 있어요."
      : profile.guildBannerUrl
        ? "이 서버 전용 배너를 사용 중이에요."
        : "배너 없음. 이 서버 전용 배너를 설정할 수 있어요.";
  const lastApplyError =
    profile.lastApply && !profile.lastApply.ok && profile.lastApply.error
      ? describeApplyError(profile.lastApply.error)
      : null;

  const handleNicknameChange = (value: string) => {
    setNicknameTouched(true);
    setNickname(value);
  };

  const handleNicknameReset = () => {
    // 빈 닉네임은 저장 때 '사용자명 표시'로 정규화돼요 — 서버 닉네임을 없애는 동작이어요.
    handleNicknameChange("");
  };

  const handleFormRevert = () => {
    setNicknameTouched(false);
    setNickname(originalNickname);
    setAvatarFile(null);
    setAvatarReset(false);
    setBannerFile(null);
    setBannerReset(false);
    setCropSource(null);
  };

  return (
    <Card padding="lg" className="gap-6 overflow-visible">
      <PanelHeader
        icon={<UserRoundCog className="h-5 w-5" />}
        title="봇 프로필"
        description="봇이 이 서버에서 보여질 이름과 프로필 사진을 관리해요. 다른 서버에는 영향이 없어요."
      />

      {lastApplyError && (
        <WarningBox>
          봇이 마지막 프로필 적용에 실패했어요: {lastApplyError}
        </WarningBox>
      )}

      {refreshFailed && (
        <WarningBox>
          봇에서 최신 상태를 받지 못해 마지막으로 확인한 닉네임·사진을 표시하고
          있어요.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={reload}
          >
            다시 시도
          </button>
        </WarningBox>
      )}

      <Field label="배너" description={bannerCaption}>
        <div className="space-y-2">
          <div className="relative h-[150px] max-w-lg overflow-hidden rounded-card bg-surface-2">
            {bannerPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerPreview}
                alt="봇 배너 미리보기"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                <ImagePlus className="h-5 w-5" aria-hidden />
                <span className="text-xs">
                  배너 없음 — 공개 서버 목록 등에 떠요
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-start gap-2">
            <input
              ref={bannerInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="sr-only"
              onChange={(event) => {
                handleBannerPick(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<ImagePlus size={14} />}
                onClick={() => bannerInputRef.current?.click()}
                disabled={saving}
                className="pointer-coarse:h-11"
              >
                배너 선택
              </Button>
              {profile.guildBannerUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={14} />}
                  onClick={() => {
                    setBannerFile(null);
                    setBannerReset(true);
                  }}
                  disabled={saving}
                  className="pointer-coarse:h-11"
                >
                  배너 제거
                </Button>
              )}
            </div>
          </div>
        </div>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2 sm:items-start">
        <Field label="프로필 사진" description={previewCaption}>
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface-2">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="봇 아바타 미리보기"
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRoundCog
                  className="m-auto h-6 w-6 text-muted-foreground"
                  aria-hidden
                />
              )}
            </span>
            <div className="flex flex-col items-start gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                className="sr-only"
                onChange={(event) => {
                  handleAvatarPick(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                icon={<ImagePlus size={14} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                className="pointer-coarse:h-11"
              >
                이미지 선택
              </Button>
              {(profile.guildAvatarUrl || avatarReset) && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={14} />}
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarReset(true);
                  }}
                  disabled={saving}
                  className="pointer-coarse:h-11"
                >
                  기본 아바타 사용
                </Button>
              )}
            </div>
          </div>
        </Field>

        <Field
          label="서버 닉네임"
          description={
            nicknameDisabled
              ? "봇에게 닉네임 변경 권한(CHANGE_NICKNAME)이 없어 변경할 수 없어요. 서버 역할 설정에서 권한을 추가하면 쓸 수 있어요."
              : "빈 칸으로 저장하면 봇 사용자명으로 표시돼요."
          }
        >
          <div className="space-y-2">
            <Input
              value={nickname}
              onChange={(event) => handleNicknameChange(event.target.value)}
              maxLength={MAX_NICKNAME_LENGTH}
              placeholder={profile.username}
              disabled={saving || nicknameDisabled}
              className="max-w-sm"
            />
            <p className="text-xs text-muted-foreground">
              {profile.nickname
                ? `현재 "${profile.nickname}"(으)로 표시 중이에요`
                : `닉네임 없음. 사용자명 "${profile.username}"으로 표시 중이에요`}
              {" · "}
              {nickname.length}/{MAX_NICKNAME_LENGTH}
            </p>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={handleNicknameReset}
              disabled={saving || nicknameDisabled}
              className="pointer-coarse:h-11"
            >
              기본 이름 사용
            </Button>
          </div>
        </Field>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave}>
        {dirty && (
          <Button
            variant="ghost"
            size="md"
            onClick={handleFormRevert}
            disabled={saving}
            className="min-h-11"
          >
            되돌리기
          </Button>
        )}
      </SaveBar>

      <AvatarCropModal
        source={cropSource?.file ?? null}
        shape={cropSource?.shape ?? "avatar"}
        onClose={() => setCropSource(null)}
        onApply={handleCropApply}
      />
    </Card>
  );
}

export function BotProfileSettings({ guildId }: { guildId: string }) {
  return <BotProfileSettingsPanel guildId={guildId} />;
}
