import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { ChevronRight } from "lucide-react";

export interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  children?: ContextMenuItem[];
  onClick?: () => void;
}

export interface ContextMenuGroup {
  items: ContextMenuItem[];
}

interface CanvasContextMenuProps {
  x: number;
  y: number;
  groups: ContextMenuGroup[];
  onClose: () => void;
}

export function CanvasContextMenu({ x, y, groups, onClose }: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const [adjPos, setAdjPos] = useState({ x, y });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const nx = x + rect.width > vw - 8 ? Math.max(8, vw - rect.width - 8) : x;
    const ny = y + rect.height > vh - 8 ? Math.max(8, vh - rect.height - 8) : y;
    if (nx !== x || ny !== y) setAdjPos({ x: nx, y: ny });
    else setAdjPos({ x, y });
  }, [x, y]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    }
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose]);

  function handleItem(item: ContextMenuItem) {
    if (item.disabled) return;
    if (item.children?.length) {
      setOpenSubmenuId(prev => prev === item.id ? null : item.id);
      return;
    }
    item.onClick?.();
    onClose();
  }

  function itemClass(item: ContextMenuItem) {
    if (item.disabled) return "flex items-center justify-between gap-4 w-full text-left px-3 py-[5px] text-[12px] text-muted-foreground/35 cursor-not-allowed select-none";
    if (item.danger) return "flex items-center justify-between gap-4 w-full text-left px-3 py-[5px] text-[12px] text-destructive hover:bg-destructive/10 cursor-pointer select-none transition-colors rounded-sm mx-[2px]";
    return "flex items-center justify-between gap-4 w-full text-left px-3 py-[5px] text-[12px] text-foreground hover:bg-muted cursor-pointer select-none transition-colors rounded-sm mx-[2px]";
  }

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[210px] bg-popover border border-border rounded-xl shadow-2xl py-1"
      style={{ left: adjPos.x, top: adjPos.y }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}
    >
      {groups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <hr className="my-1 border-border/60 mx-2" />}
          {group.items.map(item => (
            <div key={item.id}>
              <button
                type="button"
                className={item.disabled
                  ? "flex items-center justify-between gap-4 w-full text-left px-3 py-[5px] text-[12px] text-muted-foreground/35 cursor-not-allowed select-none"
                  : item.danger
                  ? "flex items-center justify-between gap-4 w-full text-left px-3 py-[5px] text-[12px] text-destructive hover:bg-destructive/10 cursor-pointer select-none transition-colors rounded-sm mx-[2px]"
                  : "flex items-center justify-between gap-4 w-full text-left px-3 py-[5px] text-[12px] text-foreground hover:bg-muted cursor-pointer select-none transition-colors rounded-sm mx-[2px]"
                }
                style={item.disabled ? undefined : item.danger ? { width: "calc(100% - 4px)" } : { width: "calc(100% - 4px)" }}
                onClick={() => handleItem(item)}
              >
                <span className="font-medium leading-5">{item.label}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {item.shortcut && (
                    <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">{item.shortcut}</span>
                  )}
                  {item.children?.length ? (
                    <ChevronRight className={`w-3 h-3 text-muted-foreground/60 transition-transform ${openSubmenuId === item.id ? "rotate-90" : ""}`} />
                  ) : null}
                </div>
              </button>

              {item.children?.length && openSubmenuId === item.id && (
                <div className="mx-2 mb-0.5 rounded-lg bg-muted/50 border border-border/40 overflow-hidden">
                  {item.children.map(child => (
                    <button
                      key={child.id}
                      type="button"
                      disabled={child.disabled}
                      className={`flex items-center justify-between gap-4 w-full text-left px-4 py-[4px] text-[11px] transition-colors ${child.disabled ? "text-muted-foreground/35 cursor-not-allowed" : "text-foreground hover:bg-muted cursor-pointer"}`}
                      onClick={() => { if (!child.disabled) { child.onClick?.(); onClose(); } }}
                    >
                      <span className="font-medium leading-5">{child.label}</span>
                      {child.shortcut && (
                        <span className="text-[10px] text-muted-foreground/50 font-mono">{child.shortcut}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>,
    document.body
  );
}
