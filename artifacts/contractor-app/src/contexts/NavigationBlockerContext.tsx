import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface NavigationBlockerContextType {
  setBlocker: (fn: (() => boolean) | null) => void;
  guardNavigate: (fn: () => void) => void;
}

const NavigationBlockerContext = createContext<NavigationBlockerContextType | null>(null);

export function NavigationBlockerProvider({ children }: { children: ReactNode }) {
  const blockerRef = useRef<(() => boolean) | null>(null);
  const [pendingFn, setPendingFn] = useState<(() => void) | null>(null);
  const skipNextPopState = useRef(false);

  const setBlocker = useCallback((fn: (() => boolean) | null) => {
    blockerRef.current = fn;
  }, []);

  const guardNavigate = useCallback((fn: () => void) => {
    if (blockerRef.current?.()) {
      setPendingFn(() => fn);
    } else {
      fn();
    }
  }, []);

  useEffect(() => {
    function handlePopState() {
      if (skipNextPopState.current) {
        skipNextPopState.current = false;
        return;
      }

      if (!blockerRef.current?.()) return;

      skipNextPopState.current = true;
      history.go(1);

      setPendingFn(() => () => {
        blockerRef.current = null;
        history.back();
      });
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function confirmAndLeave() {
    const fn = pendingFn;
    blockerRef.current = null;
    setPendingFn(null);
    fn?.();
  }

  return (
    <NavigationBlockerContext.Provider value={{ setBlocker, guardNavigate }}>
      {children}
      <AlertDialog open={!!pendingFn} onOpenChange={(open) => { if (!open) setPendingFn(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the website editor. If you leave now, your edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay and keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAndLeave}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave and discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NavigationBlockerContext.Provider>
  );
}

export function useNavigationBlocker() {
  const ctx = useContext(NavigationBlockerContext);
  if (!ctx) throw new Error("useNavigationBlocker must be used within NavigationBlockerProvider");
  return ctx;
}
