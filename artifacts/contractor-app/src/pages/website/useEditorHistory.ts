import { useRef, useState } from "react";

export interface EditorSnapshot<TSection, TSettings> {
  sections: TSection[];
  settings: TSettings;
}

const MAX_HISTORY = 50;

export function useEditorHistory<TSection, TSettings>() {
  type Snap = EditorSnapshot<TSection, TSettings>;
  const pastRef = useRef<Snap[]>([]);
  const futureRef = useRef<Snap[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function sync() {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }

  function pushSnapshot(snapshot: Snap) {
    pastRef.current = [...pastRef.current, snapshot].slice(-MAX_HISTORY);
    futureRef.current = [];
    sync();
  }

  function undo(current: Snap): Snap | null {
    if (pastRef.current.length === 0) return null;
    const past = pastRef.current;
    const prev = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [current, ...futureRef.current].slice(0, MAX_HISTORY);
    sync();
    return prev;
  }

  function redo(current: Snap): Snap | null {
    if (futureRef.current.length === 0) return null;
    const future = futureRef.current;
    const next = future[0];
    futureRef.current = future.slice(1);
    pastRef.current = [...pastRef.current, current].slice(-MAX_HISTORY);
    sync();
    return next;
  }

  return { pushSnapshot, undo, redo, canUndo, canRedo };
}
