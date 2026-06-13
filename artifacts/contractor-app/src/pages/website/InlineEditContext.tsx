import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle } from "lucide-react";

export type EnterBehavior = "newline" | "commit";
export type EscapeBehavior = "commit" | "cancel";

export interface InlineEditContextValue {
  editingId: string | null;
  /** ID of the element in the selected-but-not-editing state (single-click). */
  selectedId: string | null;
  draft: string;
  /** Current field's Enter key behavior (for badge hint). */
  enterBehavior: EnterBehavior;
  /** Current field's Escape key behavior (for badge hint). */
  escapeBehavior: EscapeBehavior;
  /**
   * Enter edit mode for a field.
   * @param enterBehavior "newline" (default) — headings/paragraphs; "commit" — button labels
   * @param escapeBehavior "commit" (default) — saves on Esc; "cancel" — reverts on Esc
   */
  startEditing: (
    id: string,
    value: string,
    onCommit: (v: string) => void,
    enterBehavior?: EnterBehavior,
    escapeBehavior?: EscapeBehavior,
  ) => void;
  updateDraft: (value: string) => void;
  /** Save current draft and exit. */
  commitEdit: () => void;
  /**
   * True non-mutating cancel: clears state without calling onCommit.
   * The parent's value prop is unchanged so the display reverts naturally.
   */
  cancelEdit: () => void;
  /**
   * Commit the current edit and advance focus to the next [data-inline-editable]
   * within the same section container.
   */
  moveToNext: (currentId: string) => void;
  /**
   * WebsiteEditor wires this once to reset the text-edit coalescing window
   * before each inline commit, ensuring each committed edit is one undo step.
   */
  setCommitBoundaryCallback: (fn: () => void) => void;
  /** Select an element without entering edit mode (single-click state — shows ring + toolbar). */
  selectElement: (id: string) => void;
  /** Clear the selection highlight. */
  deselectAll: () => void;
}

export const InlineEditContext = createContext<InlineEditContextValue | null>(null);

export function useInlineEditContext() {
  return useContext(InlineEditContext);
}

export function useInlineEdit() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [enterBehavior, setEnterBehavior] = useState<EnterBehavior>("newline");
  const [escapeBehavior, setEscapeBehavior] = useState<EscapeBehavior>("commit");
  const draftRef = useRef("");
  const onCommitRef = useRef<((v: string) => void) | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const commitBoundaryRef = useRef<() => void>(() => {});

  const setCommitBoundaryCallback = useCallback((fn: () => void) => {
    commitBoundaryRef.current = fn;
  }, []);

  const selectElement = useCallback((id: string) => {
    setSelectedId(id);
    selectedIdRef.current = id;
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedId(null);
    selectedIdRef.current = null;
  }, []);

  // Clear selection when user clicks outside any inline-editable element or toolbar
  useEffect(() => {
    function handleDocMouseDown(e: MouseEvent) {
      if (editingIdRef.current) return; // let editing handle its own teardown
      if (selectedIdRef.current === null) return;
      const target = e.target as HTMLElement;
      if (
        !target.closest("[data-inline-editable]") &&
        !target.closest("[data-inline-toolbar]")
      ) {
        setSelectedId(null);
        selectedIdRef.current = null;
      }
    }
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, []);

  const startEditing = useCallback(
    (
      id: string,
      value: string,
      onCommit: (v: string) => void,
      eb: EnterBehavior = "newline",
      esb: EscapeBehavior = "commit",
    ) => {
      // Also mark as selected so the ring stays visible during and after editing
      setSelectedId(id);
      selectedIdRef.current = id;
      setEditingId(id);
      editingIdRef.current = id;
      setDraft(value);
      draftRef.current = value;
      setEnterBehavior(eb);
      setEscapeBehavior(esb);
      onCommitRef.current = onCommit;
    },
    []
  );

  const updateDraft = useCallback((value: string) => {
    setDraft(value);
    draftRef.current = value;
  }, []);

  const commitEdit = useCallback(() => {
    // Reset the text-edit coalescing window so this commit gets its own undo snapshot.
    commitBoundaryRef.current();
    const cb = onCommitRef.current;
    const d = draftRef.current;
    setEditingId(null);
    editingIdRef.current = null;
    setDraft("");
    draftRef.current = "";
    onCommitRef.current = null;
    // Keep selectedId — ring and toolbar stay visible after commit so user can see which element was changed
    if (cb) cb(d);
  }, []);

  const cancelEdit = useCallback(() => {
    // True non-mutating cancel: do NOT call onCommit.
    // The parent's value prop is unchanged; display reverts naturally when isActive becomes false.
    setEditingId(null);
    editingIdRef.current = null;
    setDraft("");
    draftRef.current = "";
    onCommitRef.current = null;
    // Keep selectedId — same reasoning as commitEdit
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
    selectedId,
    draft,
    enterBehavior,
    escapeBehavior,
    startEditing,
    updateDraft,
    commitEdit,
    cancelEdit,
    moveToNext,
    setCommitBoundaryCallback,
    selectElement,
    deselectAll,
  };

  return { contextValue, editingId, editingIdRef };
}

/**
 * Two visually distinct toolbar elements shown during inline editing:
 *   1. "EDITING TEXT" badge — bold, prominent
 *   2. Smaller hint line — key bindings for the current field type
 * After commit, briefly shows "Saved" confirmation.
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
    const escHint = ctx?.escapeBehavior === "cancel" ? "Esc to cancel" : "Esc to save";
    const enterHint = ctx?.enterBehavior === "commit" ? "Enter to save" : null;
    const hint = [escHint, enterHint, "Tab to advance"].filter(Boolean).join(" · ");
    return (
      <>
        <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-bold tracking-wide uppercase select-none">
          Editing Text
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
          Editing…
        </span>
        <span className="text-[11px] text-muted-foreground/60 select-none">{hint}</span>
      </>
    );
  }

  if (savedVisible) {
    return (
      <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 rounded text-green-600 text-[11px] font-medium select-none">
        <CheckCircle className="w-3 h-3" />
        Saved
      </div>
    );
  }

  return null;
}
