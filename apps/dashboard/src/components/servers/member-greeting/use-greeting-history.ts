import { useCallback, useEffect, useRef, useState } from "react";
import type { GreetingImage } from "@sirubot/utils/memberGreeting";

/** 되돌리기 히스토리 최대 길이 — 넘치면 가장 오래된 스냅샷부터 버려요 */
const HISTORY_LIMIT = 50;

export interface GreetingHistory {
  canUndo: boolean;
  canRedo: boolean;
  /** 현재 이미지를 체크포인트로 확정해요 — 직전 커밋과 내용이 같으면 아무것도 안 해요 */
  commit: () => void;
  undo: () => void;
  redo: () => void;
}

/**
 * GreetingImage 스냅샷 히스토리 (되돌리기/다시실행).
 *
 * 커밋 시점이 핵심이에요 — 드래그 rAF·슬라이더·타이핑 중의 실시간 패치는 히스토리에
 * 쌓이지 않고, 조작이 끝나는 시점(포인터 놓기 / 슬라이더 값 확정 / 입력 blur / 버튼 클릭)의
 * `commit()` 1회로 묶여 되돌리기 한 단계가 돼요.
 */
export function useGreetingHistory({
  getSnapshot,
  applySnapshot,
}: {
  getSnapshot: () => GreetingImage;
  applySnapshot: (snapshot: GreetingImage) => void;
}): GreetingHistory {
  const getSnapshotRef = useRef(getSnapshot);
  const applySnapshotRef = useRef(applySnapshot);
  useEffect(() => {
    getSnapshotRef.current = getSnapshot;
    applySnapshotRef.current = applySnapshot;
  });

  const pastRef = useRef<GreetingImage[]>([]);
  const futureRef = useRef<GreetingImage[]>([]);
  const checkpointRef = useRef<GreetingImage>(getSnapshot());
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false });

  const commit = useCallback(() => {
    const current = getSnapshotRef.current();
    if (current === checkpointRef.current) return;
    if (JSON.stringify(current) === JSON.stringify(checkpointRef.current)) return;
    pastRef.current = [...pastRef.current, checkpointRef.current].slice(-HISTORY_LIMIT);
    futureRef.current = [];
    checkpointRef.current = current;
    setFlags({ canUndo: true, canRedo: false });
  }, []);

  const undo = useCallback(() => {
    // 아직 확정 안 된 변경(타이핑 등)이 있으면 먼저 한 단계로 묶고 되돌려요
    commit();
    const past = pastRef.current;
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [...futureRef.current, checkpointRef.current];
    checkpointRef.current = previous;
    applySnapshotRef.current(previous);
    setFlags({ canUndo: pastRef.current.length > 0, canRedo: true });
  }, [commit]);

  const redo = useCallback(() => {
    // 새 변경이 있으면 확정돼요 — 확정은 redo 스택을 지우므로 그대로 무효화됩니다
    commit();
    const future = futureRef.current;
    if (future.length === 0) return;
    const next = future[future.length - 1];
    futureRef.current = future.slice(0, -1);
    pastRef.current = [...pastRef.current, checkpointRef.current].slice(-HISTORY_LIMIT);
    checkpointRef.current = next;
    applySnapshotRef.current(next);
    setFlags({ canUndo: true, canRedo: futureRef.current.length > 0 });
  }, [commit]);

  return { canUndo: flags.canUndo, canRedo: flags.canRedo, commit, undo, redo };
}
