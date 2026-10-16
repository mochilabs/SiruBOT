"use client";

import { useState } from "react";
import type { CustomCommandSpec, CustomCommandStep } from "@sirubot/utils/customCommand";
import {
  CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS,
  CUSTOM_COMMAND_MAX_STEPS,
  CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS,
  customCommandSpecSchema,
  validateCustomCommandName,
} from "@sirubot/utils/customCommand";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";

import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { toApiError, toError } from "@/lib/api-error";
import type { CustomCommandsState,CustomCommandSummary } from "@/lib/custom-commands";

type EditorStep = CustomCommandStep;

function emptyStep(): EditorStep {
  return { type: "send_message", text: "" };
}

function totalDelaySeconds(steps: EditorStep[]): number {
  return steps.reduce((total, step) => (step.type === "delay" ? total + step.seconds : total), 0);
}

interface CustomCommandEditorProps {
  guildId: string;
  /** null이면 새로 만들기 */
  command: CustomCommandSummary | null;
  /** 실행 예시 표시용 접두사 */
  prefix: string;
  onClose: () => void;
  /** 저장 성공 시 서버가 돌려준 최신 상태를 부모에 전달해요 */
  onSaved: (state: CustomCommandsState) => void;
}

/**
 * 커스텀 명령어 편집기 — 이름·설명·스텝 블록 조립 + AI 초안 생성.
 * 저장 전에 utils의 스펙 스키마로 검증해 봇 실행 시와 같은 규칙을 보장해요.
 */
export function CustomCommandEditor({
  guildId,
  command,
  prefix,
  onClose,
  onSaved,
}: CustomCommandEditorProps) {
  const toast = useToast();
  const [name, setName] = useState(command?.name ?? "");
  const [description, setDescription] = useState(command?.description ?? "");
  const [steps, setSteps] = useState<EditorStep[]>(
    command ? command.spec.steps.map((step) => ({ ...step })) : [emptyStep()],
  );
  const [saving, setSaving] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);

  const totalDelay = totalDelaySeconds(steps);

  const updateStep = (index: number, next: EditorStep) => {
    setSteps((prev) => prev.map((step, i) => (i === index ? next : step)));
  };

  const moveStep = (index: number, delta: -1 | 1) => {
    setSteps((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const generateDraft = async () => {
    setDrafting(true);
    try {
      const res = await fetch(`/api/servers/${guildId}/custom-commands/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: draftPrompt }),
      });
      if (!res.ok) throw await toApiError(res, "AI 초안 생성에 실패했어요.");
      const data = (await res.json()) as {
        draft: { name: string; description: string; spec: CustomCommandSpec };
      };
      setName(data.draft.name);
      setDescription(data.draft.description);
      setSteps(data.draft.spec.steps.map((step) => ({ ...step })));
      toast.success(
        "초안이 준비됐어요.",
        "내용을 확인하고 저장해 주세요. 저장하지 않으면 사라져요.",
      );
    } catch (error) {
      const apiError = toError(error, "AI 초안 생성에 실패했어요.");
      toast.error(
        apiError.message,
        apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
      );
    } finally {
      setDrafting(false);
    }
  };

  const handleSave = async () => {
    const nameError = validateCustomCommandName(name);
    if (nameError) {
      toast.error(nameError);
      return;
    }
    const spec = customCommandSpecSchema.safeParse({ version: 1, steps });
    if (!spec.success) {
      toast.error(
        spec.error.issues[0]?.message ?? "스텝 구성이 올바르지 않아요.",
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        command
          ? `/api/servers/${guildId}/custom-commands/${command.id}`
          : `/api/servers/${guildId}/custom-commands`,
        {
          method: command ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            spec: spec.data,
          }),
        },
      );
      if (!res.ok) throw await toApiError(res, "저장에 실패했어요.");
      onSaved((await res.json()) as CustomCommandsState);
      toast.success(
        command ? "커스텀 명령어를 수정했어요." : "커스텀 명령어를 만들었어요.",
        `디스코드에서 \`${prefix}${name.trim().toLowerCase()}\`로 실행해요.`,
      );
    } catch (error) {
      const apiError = toError(error, "저장에 실패했어요.");
      toast.error(
        apiError.message,
        apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {command ? "커스텀 명령어 수정" : "새 커스텀 명령어"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* AI 초안 생성기 */}
          <div className="space-y-2 rounded-menu bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              AI로 초안 만들기 — 어떤 명령어인지 적으면 스텝 초안을 채워줘요.
            </p>
            <Textarea
              placeholder="예: 인사말 보내고 3초 뒤에 서버 규칙 요약 알려줘"
              value={draftPrompt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDraftPrompt(e.target.value)
              }
              maxLength={500}
              disabled={drafting}
              className="min-h-12"
            />
            <Button
              variant="secondary"
              size="sm"
              loading={drafting}
              disabled={!draftPrompt.trim() || drafting}
              icon={drafting ? undefined : <Sparkles size={16} />}
              onClick={generateDraft}
            >
              AI로 초안 생성
            </Button>
          </div>

          <Field
            htmlFor="cc-name"
            label="이름"
            description={`공백 없이 20자 이하. 디스코드에서 \`${prefix}이름\`으로 실행해요. '도움말'은 예약어예요.`}
          >
            <Input
              id="cc-name"
              type="text"
              placeholder="예: 아침브리핑"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              maxLength={20}
              disabled={saving}
            />
          </Field>

          <Field htmlFor="cc-desc" label="설명 (선택사항)">
            <Input
              id="cc-desc"
              type="text"
              placeholder="이 명령어가 뭘 하는지 한 줄로"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDescription(e.target.value)
              }
              maxLength={100}
              disabled={saving}
            />
          </Field>

          {/* 스텝 블록 조립 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">
                스텝 ({steps.length}/{CUSTOM_COMMAND_MAX_STEPS})
              </p>
              <p
                className={`text-xs ${
                  totalDelay > CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                대기 합계 {totalDelay}/{CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS}초
              </p>
            </div>

            {steps.map((step, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-menu bg-surface-2 p-3"
              >
                <div className="flex flex-col gap-1">
                  <Button
                    variant="icon"
                    size="icon-xs"
                    aria-label="위로 이동"
                    disabled={index === 0 || saving}
                    icon={<ArrowUp size={14} />}
                    onClick={() => moveStep(index, -1)}
                  />
                  <Button
                    variant="icon"
                    size="icon-xs"
                    aria-label="아래로 이동"
                    disabled={index === steps.length - 1 || saving}
                    icon={<ArrowDown size={14} />}
                    onClick={() => moveStep(index, 1)}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Select
                    value={step.type}
                    onValueChange={(value: string | null) => {
                      if (value !== "delay" && value !== "send_message") return;
                      if (value === step.type) return;
                      updateStep(
                        index,
                        value === "delay"
                          ? { type: "delay", seconds: 5 }
                          : { type: "send_message", text: "" },
                      );
                    }}
                  >
                    <SelectTrigger size="sm" aria-label="스텝 종류">
                      <SelectValue>
                        {(value: string) =>
                          value === "delay" ? "대기" : "메시지 전송"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="send_message">메시지 전송</SelectItem>
                      <SelectItem value="delay">대기</SelectItem>
                    </SelectContent>
                  </Select>
                  {step.type === "send_message" ? (
                    <Textarea
                      placeholder="보낼 메시지 (디스코드 마크다운, 멘션은 무시돼요)"
                      value={step.text}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        updateStep(index, {
                          type: "send_message",
                          text: e.target.value,
                        })
                      }
                      maxLength={2000}
                      disabled={saving}
                      className="min-h-12"
                    />
                  ) : step.type === "delay" ? (
                    <Input
                      type="number"
                      min={1}
                      max={CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS}
                      value={step.seconds}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateStep(index, {
                          type: "delay",
                          seconds: Number(e.target.value) || 1,
                        })
                      }
                      disabled={saving}
                    />
                  )}
                </div>
                <Button
                  variant="icon"
                  size="icon-xs"
                  aria-label="스텝 삭제"
                  disabled={saving}
                  icon={<Trash2 size={14} />}
                  onClick={() => removeStep(index)}
                />
              </div>
            ))}

            <Button
              variant="secondary"
              size="sm"
              disabled={steps.length >= CUSTOM_COMMAND_MAX_STEPS || saving}
              icon={<Plus size={16} />}
              onClick={() => setSteps((prev) => [...prev, emptyStep()])}
            >
              스텝 추가
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            {command ? "수정 완료" : "만들기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
