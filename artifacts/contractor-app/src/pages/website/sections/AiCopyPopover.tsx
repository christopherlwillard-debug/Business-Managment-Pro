import { useState } from "react";
import { Sparkles, Loader2, Check, RefreshCcw, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AiCopyPopoverProps {
  defaultPrompt: string;
  onAccept: (text: string) => void;
  variant?: "light" | "dark";
  label?: string;
}

export function AiCopyPopover({ defaultPrompt, onAccept, variant = "light", label }: AiCopyPopoverProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setResult(null);
    setError(null);
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${BASE}/api/website/generate-copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setResult(data.result ?? "");
    } catch {
      setError("Generation failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const isDark = variant === "dark";
  const panelCls = isDark
    ? "bg-gray-900/95 border-white/20 text-white"
    : "bg-white dark:bg-gray-900 border-border text-foreground";
  const textareaCls = isDark
    ? "w-full text-xs border border-white/20 rounded p-2 resize-none bg-black/30 text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-purple-400"
    : "w-full text-xs border border-border rounded p-2 resize-none bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-purple-400";
  const resultBg = isDark
    ? "bg-black/30 border-white/10 text-white"
    : "bg-muted/40 border-border text-foreground";
  const mutedText = isDark ? "text-white/60" : "text-muted-foreground";

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 transition-colors ${
          isDark
            ? "text-purple-300 hover:text-purple-200 bg-white/10 hover:bg-white/20 border border-white/20"
            : "text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200"
        }`}
      >
        <Sparkles className="w-2.5 h-2.5" />
        Write with AI
      </button>

      {open && (
        <div className={`mt-1.5 rounded-xl border shadow-lg p-3 space-y-2 ${panelCls}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              {label ? `AI — ${label}` : "AI Copy Generator"}
            </span>
            <button onClick={close} className={`${mutedText} hover:opacity-70`}>
              <X className="w-3 h-3" />
            </button>
          </div>

          {!result ? (
            <>
              <textarea
                className={textareaCls}
                rows={3}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe what to write…"
              />
              {error && <p className="text-[10px] text-red-400">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={generate}
                  disabled={loading || !prompt.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded px-3 py-1.5 transition-colors disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {loading ? "Generating…" : "Generate"}
                </button>
                <button onClick={close} className={`text-xs ${mutedText} hover:opacity-70 px-2 py-1.5`}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={`text-xs rounded p-2 leading-relaxed max-h-28 overflow-y-auto border ${resultBg}`}>
                {result}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => { onAccept(result!); close(); }}
                  className="flex items-center gap-1 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded px-3 py-1.5 transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Use This
                </button>
                <button
                  onClick={generate}
                  disabled={loading}
                  className={`flex items-center gap-1 text-xs border rounded px-2 py-1.5 transition-colors disabled:opacity-60 ${
                    isDark ? "border-white/20 text-white/70 hover:text-white" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                  Try Again
                </button>
                <button onClick={() => setResult(null)} className={`text-xs ${mutedText} hover:opacity-70 px-2 py-1.5`}>
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
