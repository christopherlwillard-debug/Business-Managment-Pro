import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle } from "lucide-react";

export interface InlineEditContextValue {
  editingId: string | null;
  draft: string;
  /** Snapshot of the value at the moment startEditing was called — used by cancelEdit() to restore. */
  originalValue: string;
  /** Whether the current editable is multiline (affects Escape semantics in badge hint). */
  isMultilineEdit: boolean;
  startEditing: (id: string, value: string, onCommit: (v: string) => void, multiline?: boolean) => void;
  updateDraft: (value: string) => void;
  /** Save current draft and exit. */
  commitEdit: () => void;
  /**
   * Restore the original snapshot and exit WITHOUT calling onCommit.
   * The parent state never changes — the display reverts naturally because
   * value prop is unchanged.
   */
  cancelEdit: () => void;
  /**
   * Commit the current edit and advance focus to the next [data-inline-editable]
   * within the same section container.
   */
  moveToNext: (currentId: string) => void;
}

export const InlineEditContext = createContext<InlineEditContextValue | null>(null);

export function useInlineEditContext() {
  return useContext(InlineEditContext);
}

export function useInlineEdit() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isMultilineEdit, setIsMultilineEdit] = useState(false);
  const draftRef = useRef("");
  const originalValueRef = useRef("");
  const onCommitRef = useRef<((v: string) => void) | null>(null);
  const editingIdRef = useRef<string | null>(null);

  const startEditing = useCallback(
    (id: string, value: string, onCommit: (v: string) => void, multiline = false) => {
      setEditingId(id);
      editingIdRef.current = id;
      setDraft(value);
      draftRef.current = value;
      originalValueRef.current = value;
      setIsMultilineEdit(multiline);
      onCommitRef.current = onCommit;
    },
    []
  );

  const updateDraft = useCallback((value: string) => {
    setDraft(value);
    draftRef.current = value;
  }, []);

  const commitEdit = useCallback(() => {
    const cb = onCommitRef.current;
    const d = draftRef.current;
    setEditingId(null);
    editingIdRef.current = null;
    setDraft("");
    draftRef.current = "";
    originalValueRef.current = "";
    onCommitRef.current = null;
    if (cb) cb(d);
  }, []);

  const cancelEdit = useCallback(() => {
    // Restore the original snapshot. Calling onCommit(originalValue) writes it back
    // explicitly — safe no-op when value hasn't changed in the parent store.
    const cb = onCommitRef.current;
    const orig = originalValueRef.current;
    setEditingId(null);
    editingIdRef.current = null;
    setDraft("");
    draftRef.current = "";
    originalValueRef.current = "";
    onCommitRef.current = null;
    if (cb) cb(orig);
  }, []);

  const moveToNext = useCallback((currentId: string) => {
    requestAnimationFrame(() => {
      const thisEl = document.querySelector<HTMLElement>(`[data-inline-editable="${currentId}"]`);
      const sectionEl: Element =
        thisEl?.closest("[data-section-canvas-id]") ?? document.documentElement;
      const all = Array.from(
        sectionEl.querySelectorAll<HTMLElement>("[data-inline-editable]")
      );
      const idx = all.findIndex(el => el.dataset.inlineEditable === currentId);
      if (idx >= 0 && idx + 1 < all.length) {
        all[idx + 1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      }
    });
  }, []);

  const contextValue: InlineEditContextValue = {
    editingId,
    draft,
    originalValue: originalValueRef.current,
    isMultilineEdit,
    startEditing,
    updateDraft,
    commitEdit,
    cancelEdit,
    moveToNext,
  };

  return { contextValue, editingId, editingIdRef };
}

/**
 * Toolbar badge — shows "Editing Text" while inline editing is active
 * with a context-aware hint ("Esc to cancel · Enter to save" vs "Esc to save"),
 * then briefly shows "Saved ✓" after commit.
 */
export function InlineEditStatus({ editingId }: { editingId: string | null }) {
  const [savedVisible, setSavedVisible] = useState(false);
  const prevId = useRef(editingId);
  const ctx = useInlineEditContext();

  useEffect(() => {
    if (prevId.current !== null && editingId === null) {
      setSavedVisible(true);
      const t = setTimeout(() => setSavedVisible(false), 2000);
      prevId.current = null;
      return () => clearTimeout(t);
    }
    prevId.current = editingId;
  }, [editingId]);

  if (editingId) {
    const hint = ctx?.isMultilineEdit
      ? "Esc to save"
      : "Esc to cancel · Enter to save";
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-md text-primary text-[11px] font-medium select-none">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
        Editing text
        <span className="text-primary/60 ml-0.5">· {hint}</span>
      </div>
    );
  }

  if (savedVisible) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded-md text-green-600 text-[11px] font-medium select-none">
        <CheckCircle className="w-3 h-3" />
        Saved ✓
      </div>
    );
  }

  return null;
}
