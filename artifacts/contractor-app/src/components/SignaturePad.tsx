import { useRef, useEffect, useState, useCallback } from "react";
import SignaturePadLib from "signature_pad";
import { Trash2, Save, PenLine, Loader2, RotateCcw } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SignaturePadProps {
  savedUrl: string | null;
  onSaved: (url: string) => void;
  onRemoved: () => void;
}

export function SignaturePad({ savedUrl, onSaved, onRemoved }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [mode, setMode] = useState<"preview" | "draw">(savedUrl ? "preview" : "draw");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [isEmpty, setIsEmpty] = useState(true);

  // Initialize / resize canvas when entering draw mode
  const initPad = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Scale for device pixel ratio so it looks crisp on retina
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);

    padRef.current = new SignaturePadLib(canvas, {
      penColor: "#111111",
      backgroundColor: "rgba(0,0,0,0)",
      minWidth: 1.5,
      maxWidth: 3,
    });

    padRef.current.addEventListener("endStroke", () => {
      setIsEmpty(padRef.current?.isEmpty() ?? true);
    });

    setIsEmpty(true);
  }, []);

  useEffect(() => {
    if (mode === "draw") {
      // Small delay lets the canvas render before we measure it
      const t = setTimeout(initPad, 50);
      return () => clearTimeout(t);
    }
  }, [mode, initPad]);

  // Re-init on window resize so the canvas stays the right size
  useEffect(() => {
    if (mode !== "draw") return;
    const onResize = () => initPad();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode, initPad]);

  function handleClear() {
    padRef.current?.clear();
    setIsEmpty(true);
  }

  async function handleSave() {
    if (!padRef.current || padRef.current.isEmpty()) return;
    setError("");
    setSaving(true);
    try {
      const dataUrl = padRef.current.toDataURL("image/png");
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const form = new FormData();
      form.append("logo", blob, "signature.png");
      const r = await fetch(`${BASE}/api/settings/signature`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Upload failed");
      const data = await r.json();
      onSaved(data.signatureImage);
      setMode("preview");
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setError("");
    setRemoving(true);
    try {
      await fetch(`${BASE}/api/settings/signature`, {
        method: "DELETE",
        credentials: "include",
      });
      onRemoved();
      setMode("draw");
    } finally {
      setRemoving(false);
    }
  }

  if (mode === "preview" && savedUrl) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border-2 border-border bg-white overflow-hidden inline-block">
          <img
            src={`${BASE}${savedUrl}`}
            alt="Saved signature"
            className="block max-h-24 max-w-xs object-contain p-3"
          />
        </div>
        <p className="text-xs text-emerald-600 font-medium">Signature saved — auto-embeds on every PDF export.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { padRef.current?.clear(); setMode("draw"); setIsEmpty(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/60 transition-colors"
          >
            <PenLine className="w-3.5 h-3.5" /> Redraw
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
          >
            {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Draw your signature below using your finger or mouse.</p>

      {/* Canvas area */}
      <div className="relative rounded-xl border-2 border-dashed border-border bg-white overflow-hidden"
           style={{ height: 140 }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none"
          style={{ cursor: "crosshair" }}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <span className="text-muted-foreground/40 text-sm italic">Sign here</span>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleClear}
          disabled={isEmpty || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/60 transition-colors disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isEmpty || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save Signature"}
        </button>
        {savedUrl && (
          <button
            type="button"
            onClick={() => setMode("preview")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/60 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
