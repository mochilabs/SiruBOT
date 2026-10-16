"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CUSTOM_COMMAND_MAX_PER_GUILD,
  CUSTOM_COMMAND_MAX_SLASH_PER_GUILD,
  CUSTOM_COMMAND_PREFIX_DEFAULT,
  validateCustomCommandPrefix,
} from "@sirubot/utils/customCommand";
import { Loader2, Pencil, Plus, SquareSlash, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import { Field } from "@/components/primitives/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { type ApiError,toApiError, toError } from "@/lib/api-error";
import type {
  CustomCommandsState,
  CustomCommandSummary,
} from "@/lib/custom-commands";

import { CustomCommandEditor } from "./custom-command-editor";
import {
  InfoBox,
  PanelError,
  PanelHeader,
  PanelLoading,
  SaveBar,
} from "./settings-shared";

function CustomCommandsPanel({ guildId }: { guildId: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<CustomCommandsState | null>(null);
  const [prefixInput, setPrefixInput] = useState(CUSTOM_COMMAND_PREFIX_DEFAULT);
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [editor, setEditor] = useState<
    { open: true; command: CustomCommandSummary | null } | { open: false }
  >({ open: false });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null)
        window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const applyState = useCallback((next: CustomCommandsState) => {
    setState(next);
    setPrefixInput(next.prefix);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const res = await fetch(`/api/servers/${guildId}/custom-commands`, {
          cache: "no-store",
        });
        if (!res.ok)
          throw await toApiError(res, "커스텀 명령어를 불러오지 못했어요.");
        const data: CustomCommandsState = await res.json();
        if (!cancelled) applyState(data);
      } catch (error) {
        if (!cancelled)
          setLoadError(toError(error, "커스텀 명령어를 불러오지 못했어요."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, applyState, retryToken]);

  const reportError = (error: unknown, fallback: string) => {
    const apiError = toError(error, fallback);
    toast.error(
      apiError.message,
      apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
    );
  };

  const prefixDirty = state !== null && prefixInput !== state.prefix;

  const handleSavePrefix = async () => {
    const prefixError = validateCustomCommandPrefix(prefixInput);
    if (prefixError) {
      toast.error(prefixError);
      return;
    }
    setSavingPrefix(true);
    try {
      const res = await fetch(`/api/servers/${guildId}/custom-commands`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: prefixInput }),
      });
      if (!res.ok) throw await toApiError(res, "접두사 저장에 실패했어요.");
      applyState((await res.json()) as CustomCommandsState);
      toast.success("접두사를 저장했어요.", "봇이 곧 새 접두사를 적용해요.");
    } catch (error) {
      reportError(error, "접두사 저장에 실패했어요.");
    } finally {
      setSavingPrefix(false);
    }
  };

  const handleDelete = async (command: CustomCommandSummary) => {
    if (confirmDeleteId !== command.id) {
      if (confirmTimerRef.current !== null)
        window.clearTimeout(confirmTimerRef.current);
      setConfirmDeleteId(command.id);
      confirmTimerRef.current = window.setTimeout(
        () => setConfirmDeleteId(null),
        4000,
      );
      return;
    }
    if (confirmTimerRef.current !== null)
      window.clearTimeout(confirmTimerRef.current);
    setConfirmDeleteId(null);
    try {
      const res = await fetch(
        `/api/servers/${guildId}/custom-commands/${command.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw await toApiError(res, "삭제에 실패했어요.");
      applyState((await res.json()) as CustomCommandsState);
      toast.success(`\`${command.name}\` 커스텀 명령어를 삭제했어요.`);
    } catch (error) {
      reportError(error, "삭제에 실패했어요.");
    }
  };

  if (loading) return <PanelLoading label="커스텀 명령어 불러오는 중…" />;
  if (loadError)
    return (
      <PanelError
        error={loadError}
        onRetry={() => {
          setLoading(true);
          setRetryToken((t) => t + 1);
        }}
      />
    );

  const commands = state?.commands ?? [];

  return (
    <Card padding="lg" className="gap-6 overflow-visible">
      <PanelHeader
        icon={<SquareSlash className="h-5 w-5" />}
        title="커스텀 명령어"
        description="메시지 트리거·슬래시 명령어를 만들고 관리해요. 예: !아침브리핑 또는 /아침브리핑"
        action={
          <>
            <Button
              variant="icon"
              size="sm"
              aria-label="목록 새로고침"
              disabled={prefixDirty || savingPrefix}
              icon={<Loader2 size={16} className={loading ? "animate-spin" : ""} />}
              onClick={() => {
                setLoading(true);
                setRetryToken((t) => t + 1);
              }}
            />
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => setEditor({ open: true, command: null })}
            >
              새 명령어
            </Button>
          </>
        }
      />

      {/* 접두사 설정 */}
      <Field
        htmlFor="cc-prefix"
        label="접두사"
        description={`채팅에 \`${prefixInput}아침브리핑\`처럼 입력하면 실행돼요. 길이 1~3자, 공백 불가. \`${prefixInput}도움말\`은 목록을 보여주는 예약어예요.`}
      >
        <Input
          id="cc-prefix"
          type="text"
          value={prefixInput}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setPrefixInput(e.target.value)
          }
          maxLength={3}
          disabled={savingPrefix}
          className="max-w-24"
        />
      </Field>

      {/* 명령어 목록 */}
      {commands.length === 0 ? (
        <EmptyState
          icon={SquareSlash}
          title="커스텀 명령어가 없어요"
          description="AI로 초안을 만들거나 스텝을 직접 조립해 보세요."
          action={
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setEditor({ open: true, command: null })}
            >
              첫 명령어 만들기
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {commands.map((command) => (
            <li
              key={command.id}
              className="flex items-center justify-between gap-3 rounded-menu bg-surface-2 px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="primary" size="sm">
                    {command.method === "slash"
                      ? `/${command.name}`
                      : `${state?.prefix ?? CUSTOM_COMMAND_PREFIX_DEFAULT}${command.name}`}
                  </Badge>
                  <Badge variant="secondary" size="sm">
                    {command.method === "slash" ? "슬래시" : "메시지"}
                  </Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {command.description || "설명 없음"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="secondary" size="sm">
                  스텝 {command.spec.steps.length}개
                </Badge>
                <Button
                  variant="icon"
                  size="sm"
                  aria-label={`${command.name} 수정`}
                  icon={<Pencil size={14} />}
                  onClick={() => setEditor({ open: true, command })}
                />
                <Button
                  variant="icon"
                  size="sm"
                  aria-label={`${command.name} 삭제`}
                  className={
                    confirmDeleteId === command.id
                      ? "ring-2 ring-destructive/50"
                      : ""
                  }
                  icon={
                    confirmDeleteId === command.id ? (
                      <Trash2 size={14} className="text-destructive" />
                    ) : (
                      <Trash2 size={14} />
                    )
                  }
                  onClick={() => handleDelete(command)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <InfoBox>
        <p>
          디스코드 채팅에{" "}
          <span className="font-semibold text-foreground">
            {`${state?.prefix ?? CUSTOM_COMMAND_PREFIX_DEFAULT}도움말`}
          </span>
          을(를) 입력하면 사용자가 커스텀 명령어 목록을 볼 수 있어요.
        </p>
        <p>
          명령어 개수:{" "}
          <span className="font-semibold text-foreground">
            {commands.length}
          </span>
          /{CUSTOM_COMMAND_MAX_PER_GUILD}개 · 슬래시 슬롯:{" "}
          <span className="font-semibold text-foreground">
            {state?.slashCount ?? 0}
          </span>
          /{CUSTOM_COMMAND_MAX_SLASH_PER_GUILD}개 · 실행 제한은 명령어마다 정할 수
          있고, 만들기·수정·삭제는 서버 관리자만 가능해요.
        </p>
      </InfoBox>

      <SaveBar
        dirty={prefixDirty}
        saving={savingPrefix}
        onSave={handleSavePrefix}
      />

      {editor.open && (
        <CustomCommandEditor
          guildId={guildId}
          command={editor.command}
          prefix={state?.prefix ?? CUSTOM_COMMAND_PREFIX_DEFAULT}
          onClose={() => setEditor({ open: false })}
          onSaved={(next) => {
            applyState(next);
            setEditor({ open: false });
          }}
        />
      )}
    </Card>
  );
}

export function CustomCommandsSettings({ guildId }: { guildId: string }) {
  return <CustomCommandsPanel guildId={guildId} />;
}
