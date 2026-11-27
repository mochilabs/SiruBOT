import { useEffect } from "react";

import { CARD_W } from "./greeting-draw";

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
  nudgeSelected: (dxPercent: number, dyPercent: number) => void;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

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
