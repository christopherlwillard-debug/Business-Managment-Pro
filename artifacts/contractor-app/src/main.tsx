import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { reportCrash } from "./lib/reportCrash";

const recentErrors = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;

function shouldSuppress(key: string): boolean {
  const now = Date.now();
  const last = recentErrors.get(key);
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) {
    return true;
  }
  recentErrors.set(key, now);
  return false;
}

window.onerror = (message, source, lineno, colno, error) => {
  const msg = String(message);
  const key = `${msg}|${source}|${lineno}|${colno}`;
  if (!shouldSuppress(key)) {
    reportCrash({
      message: msg,
      stack: error?.stack,
      location: source ? `${source}:${lineno}:${colno}` : undefined,
    });
  }
  return false;
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const reason = event.reason;
  const msg =
    reason instanceof Error
      ? reason.message
      : String(reason ?? "Unhandled promise rejection");
  const stack = reason instanceof Error ? reason.stack : undefined;
  const key = `${msg}|${stack ?? ""}`;
  if (!shouldSuppress(key)) {
    reportCrash({ message: msg, stack });
  }
};

createRoot(document.getElementById("root")!).render(<App />);
