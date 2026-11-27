"use client";

import { type Dispatch, type SetStateAction,useRef, useState } from "react";
import type { RolePanelButton, RolePanelMode } from "@sirubot/utils/rolePanel";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";

import { RoleSelect } from "@/components/discord/role-select";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useGuildRoles } from "@/hooks/use-guild-settings";
import { cn } from "@/lib/utils";

import { BUTTON_STYLE_META, BUTTON_STYLES } from "./role-panel-meta";

/** Editable role rows (pointer-drag or arrow reordering, role, emoji, label, style) and the add button. */
export function RolePanelButtonList({
  buttons,
  onButtonsChange: setButtons,
  roles,
  mode,
  maxItems,
  saving,
}: {
  buttons: RolePanelButton[];
  onButtonsChange: Dispatch<SetStateAction<RolePanelButton[]>>;
  roles: ReturnType<typeof useGuildRoles>["roles"];
  mode: RolePanelMode;
  maxItems: number;
  saving: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const rowIndexAt = (clientY: number) => {
    const rects = rowRefs.current
      .slice(0, buttons.length)
      .map((node) => node?.getBoundingClientRect());
    const first = rects[0];
    if (!first || clientY < first.top) return 0;
    const found = rects.findIndex((rect) => rect && clientY >= rect.top && clientY <= rect.bottom);
    return found === -1 ? buttons.length - 1 : found;
  };

  const addButton = () => {
    if (buttons.length >= maxItems) return;
    setButtons((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        roleId: "",
        label: "",
        emoji: null,
        style: "secondary",
        position: prev.length,
      },
    ]);
  };

  const updateButton = (id: string, partial: Partial<RolePanelButton>) => {
    setButtons((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...partial } : b)),
    );
  };

  const moveButton = (from: number, to: number) => {
    if (from === to || to < 0 || to >= buttons.length) return;
    setButtons((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    });
  };

  const removeButton = (id: string) => {
    setButtons((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="space-y-3 rounded-menu bg-surface-2 p-3">
      {buttons.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          아직 추가된 역할이 없어요. 아래 역할 추가 버튼을 눌러 시작해 보세요.
        </p>
      ) : (
        <div className="space-y-2">
          {buttons.map((button, index) => (
            <div
              key={button.id}
              ref={(node) => {
                rowRefs.current[index] = node;
              }}
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-control bg-surface-1 p-2 sm:flex-nowrap",
                dragIndex === index && "opacity-50",
                overIndex === index &&
                  dragIndex !== null &&
                  dragIndex !== index &&
                  "ring-2 ring-ring",
              )}
            >
              <div className="flex shrink-0 items-center">
                <span
                  onPointerDown={(event) => {
                    if (saving || buttons.length < 2) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragIndex(index);
                    setOverIndex(index);
                  }}
                  onPointerMove={(event) => {
                    if (dragIndex !== index) return;
                    setOverIndex(rowIndexAt(event.clientY));
                  }}
                  onPointerUp={(event) => {
                    if (dragIndex !== index) return;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    const target = rowIndexAt(event.clientY);
                    setDragIndex(null);
                    setOverIndex(null);
                    moveButton(index, target);
                  }}
                  onPointerCancel={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className={cn(
                    "flex size-8 touch-none items-center justify-center rounded-control text-muted-foreground select-none",
                    buttons.length > 1 && !saving
                      ? "cursor-grab hover:bg-surface-2 hover:text-foreground active:cursor-grabbing"
                      : "opacity-40",
                  )}
                  aria-hidden
                >
                  <GripVertical size={16} />
                </span>
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => moveButton(index, index - 1)}
                    disabled={saving || index === 0}
                    aria-label={`${button.label.trim() || "역할"} 위로 이동`}
                  >
                    <ChevronUp size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => moveButton(index, index + 1)}
                    disabled={saving || index === buttons.length - 1}
                    aria-label={`${button.label.trim() || "역할"} 아래로 이동`}
                  >
                    <ChevronDown size={14} />
                  </Button>
                </div>
              </div>

              <div className="min-w-[10rem] flex-1">
                <RoleSelect
                  roles={roles}
                  value={button.roleId || ""}
                  onChange={(roleId) => {
                    const matchedRole = roles?.find(
                      (r) => r.id === roleId,
                    );
                    updateButton(button.id, {
                      roleId,
                      ...(!button.label.trim() && matchedRole
                        ? { label: matchedRole.name }
                        : {}),
                    });
                  }}
                  disabled={saving}
                  placeholder="역할을 선택해 주세요"
                />
              </div>

              <EmojiPicker
                value={button.emoji}
                onChange={(emoji) => updateButton(button.id, { emoji })}
                required={mode === "reaction"}
                disabled={saving}
                placeholder="이모지"
              />

              <Input
                value={button.label}
                onChange={(e) =>
                  updateButton(button.id, { label: e.target.value })
                }
                maxLength={80}
                disabled={saving}
                placeholder="버튼 라벨"
                aria-label="버튼 라벨"
                className="w-32 shrink-0"
              />

              {mode === "button" ? (
                <Select
                  value={button.style}
                  onValueChange={(value) =>
                    value &&
                    updateButton(button.id, {
                      style: value as RolePanelButton["style"],
                    })
                  }
                  disabled={saving}
                >
                  <SelectTrigger
                    className="w-36 shrink-0"
                    aria-label="버튼 색상"
                  >
                    <SelectValue>
                      {(value: RolePanelButton["style"]) => {
                        const meta =
                          BUTTON_STYLE_META[value] ??
                          BUTTON_STYLE_META.secondary;
                        return (
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                "size-2.5 shrink-0 rounded-full",
                              meta.dotClass,
                              )}
                              aria-hidden
                            />
                            <span className="truncate">{meta.label}</span>
                          </span>
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {BUTTON_STYLES.map((style) => {
                      const meta = BUTTON_STYLE_META[style];
                      return (
                        <SelectItem key={style} value={style}>
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                "size-2.5 shrink-0 rounded-full",
                                meta.dotClass,
                              )}
                              aria-hidden
                            />
                            <span>{meta.label}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : null}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeButton(button.id)}
                disabled={saving}
                aria-label="버튼 제거"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={addButton}
          disabled={saving || buttons.length >= maxItems}
        >
          <Plus size={14} /> 역할 추가
        </Button>
        <span className="text-xs text-muted-foreground">
          최대 {maxItems}개
        </span>
      </div>

    </div>
  );
}
