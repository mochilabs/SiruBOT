import { useCallback, useEffect, useRef, useState } from "react";
import type { GreetingImage } from "@sirubot/utils/memberGreeting";

const HISTORY_LIMIT = 50;

export interface GreetingHistory {
  canUndo: boolean;
  canRedo: boolean;
  commit: () => void;
  undo: () => void;
  redo: () => void;
}

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
