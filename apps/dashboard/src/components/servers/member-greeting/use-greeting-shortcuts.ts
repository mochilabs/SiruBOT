import { useEffect } from "react";

import { CARD_W } from "./greeting-draw";

/** 단축키·Delete를 무시할 편집 대상(입력 필드·IME) 판별 — 키보드 단축키가 입력을 먹지 않게 해요 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable]") !== null
  );
}

export interface GreetingShortcutActions {
  undo: () => void;
  redo: () => void;
  removeSelected: () => void;
  copySelected: () => void;
  cutSelected: () => void;
  paste: () => void;
  duplicateSelected: () => void;
  selectAll: () => void;
  clearSelection: () => void;
  /** 선택한 레이어를 카드 % 단위로 옮겨요 */
  nudgeSelected: (dxPercent: number, dyPercent: number) => void;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * 키보드 단축키 — Ctrl/Cmd+Z 되돌리기 · +Shift 다시실행 · Ctrl+C/X/V 복사·잘라내기·붙여넣기 · Ctrl+D 복제 · Ctrl+A 전체 선택 ·
 * Delete/Backspace 삭제 · 방향키 1px 이동(Shift 10px) · Esc 선택 해제. 선택이 없으면 선택이 필요한 키는 지나가요.
 */
export function useGreetingShortcuts({
  active,
  saving,
  hasSelection,
  actions,
}: {
  active: boolean;
  saving: boolean;
  hasSelection: boolean;
  actions: GreetingShortcutActions;
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
        switch (key) {
          case "z":
            event.preventDefault();
            if (event.shiftKey) actions.redo();
            else actions.undo();
            return;
          case "y":
            event.preventDefault();
            actions.redo();
            return;
          case "c":
            if (!hasSelection) return;
            event.preventDefault();
            actions.copySelected();
            return;
          case "x":
            if (!hasSelection) return;
            event.preventDefault();
            actions.cutSelected();
            return;
          case "v":
            event.preventDefault();
            actions.paste();
            return;
          case "d":
            if (!hasSelection) return;
            event.preventDefault();
            actions.duplicateSelected();
            return;
          case "a":
            event.preventDefault();
            actions.selectAll();
            return;
        }
        return;
      }
      if (event.key === "Escape") {
        if (hasSelection) actions.clearSelection();
        return;
      }
      if (!hasSelection) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        actions.removeSelected();
        return;
      }
      const arrow = ARROWS[event.key];
      if (arrow) {
        // 라디오·슬라이더 같은 위젯이 방향키를 쓰는 중이면 레이어를 옮기지 않아요
        if (event.target instanceof HTMLElement && event.target.closest('[role="radiogroup"], [role="slider"], [role="listbox"], [role="menu"]')) return;
        event.preventDefault();
        const step = (event.shiftKey ? 10 : 1) * (100 / CARD_W);
        actions.nudgeSelected(arrow[0] * step, arrow[1] * step);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, saving, hasSelection, actions]);
}
