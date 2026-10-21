import { useEffect } from "react";

import type { GreetingLayer } from "@/types/member-greeting";

/** 단축키·Delete를 무시할 편집 대상(입력 필드·IME) 판별 — 키보드 단축키가 입력을 먹지 않게 해요 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable]") !== null
  );
}

/** 키보드 단축키 — Ctrl/Cmd+Z 되돌리기 · Ctrl/Cmd+Shift+Z 다시실행 · Delete/Backspace 선택 레이어 삭제 */
export function useGreetingShortcuts({
  active,
  saving,
  undo,
  redo,
  selectedId,
  layers,
  removeLayer,
}: {
  active: boolean;
  saving: boolean;
  undo: () => void;
  redo: () => void;
  selectedId: string | null;
  layers: GreetingLayer[];
  removeLayer: (id: string) => void;
}): void {
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (saving) return;
      // IME 조합 중이거나 입력 필드에 타이핑 중이면 단축키를 쓰지 않아요
      if (event.isComposing || event.keyCode === 229) return;
      if (isEditableTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
          return;
        }
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedId) return;
        if (!layers.some((layer) => layer.id === selectedId)) return;
        event.preventDefault();
        removeLayer(selectedId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, saving, undo, redo, selectedId, layers, removeLayer]);
}
