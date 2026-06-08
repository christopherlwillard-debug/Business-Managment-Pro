import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle } from "lucide-react";

export interface InlineEditContextValue {
  editingId: string | null;
  draft: string;
  startEditing: (id: string, value: string, onCommit: (v: string) => void) => void;
  updateDraft: (value: string) => void;
  commitEdit: () => void;
  cancelEdit: () => void;
}

export const InlineEditContext = createContext<InlineEditContextValue | null>(null);

/**
 * Returns null (not throws) when used outside a Provider — so InlineEditableText
 * renders safely as static text in public-site / preview contexts.
 */
export function useInlineEditContext() {
  return useContext(InlineEditContext);
}

/**
 * Hook for WebsiteEditor — manages inline-edit state and exposes a context value.
 * editingIdRef is a stable ref for use inside keydown handlers with stale closures.
 */
export function useInlineEdit() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const onCommitRef = useRef<((v: string) => void) | null>(null);
  const editingIdRef = useRef<string | null>(null);

  const startEditing = useCallback(
    (id: string, value: string, onCommit: (v: string) => void) => {
      setEditingId(id);
      editingIdRef.current = id;
      setDraft(value);
      draftRef.current = value;
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
    onCommitRef.current = null;
    if (cb) cb(d);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    editingIdRef.current = null;
    setDraft("");
    draftRef.current = "";
    onCommitRef.current = null;
  }, []);

  const contextValue: InlineEditContextValue = {
    editingId,
    draft,
    startEditing,
    updateDraft,
    commitEdit,
    cancelEdit,
  };

  return { contextValue, editingId, editingIdRef };
}

/**
 * Toolbar badge that shows "Editing…" while inline editing is active, then
 * briefly shows "Saved ✓" after the edit is committed.
 */
export function InlineEditStatus({ editingId }: { editingId: string | null }) {
  const [savedVisible, setSavedVisible] = useState(false);
  const prevId = useRef(editingId);

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
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-md text-primary text-[11px] font-medium select-none">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
        Editing…
        <span className="text-primary/60 ml-0.5">· Esc to cancel</span>
      </div>
    );
  }

  if (savedVisible) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded-md text-green-600 text-[11px] font-medium select-none">
        <CheckCircle className="w-3 h-3" />
        Saved
      </div>
    );
  }

  return null;
}
