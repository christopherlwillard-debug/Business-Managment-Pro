const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function reportCrash(opts: {
  message: string;
  stack?: string;
  componentStack?: string;
  location?: string;
}) {
  try {
    fetch(`${BASE}/api/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    }).catch(() => {});
  } catch {
  }
}
