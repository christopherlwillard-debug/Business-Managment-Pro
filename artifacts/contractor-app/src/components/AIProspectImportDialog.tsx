import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, AlertCircle, CheckSquare, Square, ChevronRight, ImagePlus, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PROPERTY_TYPES = ["Church", "Retail", "Apartment", "Industrial", "Other"] as const;
type PropertyType = typeof PROPERTY_TYPES[number];

const MAX_IMAGE_BYTES = 3.75 * 1024 * 1024;

type ParsedProspect = {
  address: string;
  city: string;
  state: string;
  zip: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  propertyType: PropertyType;
  notes: string;
  selected: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function AIProspectImportDialog({ open, onClose, onImported }: Props) {
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [prospects, setProspects] = useState<ParsedProspect[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [duplicateSet, setDuplicateSet] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("paste");
    setText("");
    setImageFile(null);
    setImagePreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setIsDragging(false);
    setIsExtracting(false);
    setExtractError(null);
    setProspects([]);
    setIsCreating(false);
    setCreateError(null);
    setDuplicateSet(new Set());
  }

  function handleClose() {
    reset();
    onClose();
  }

  function applyImageFile(file: File) {
    if (!isImageFile(file)) {
      setExtractError("Please select an image file (JPG, PNG, GIF, WebP, etc.).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setExtractError("Image is too large — please use an image under 3.75 MB.");
      return;
    }
    setExtractError(null);
    setImageFile(file);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function removeImage() {
    setImagePreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  useEffect(() => {
    return () => {
      setImagePreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, []);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (step !== "paste") return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((i) => i.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        applyImageFile(file);
      }
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) {
      document.addEventListener("paste", handlePaste);
      return () => document.removeEventListener("paste", handlePaste);
    }
  }, [open, handlePaste]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) applyImageFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) applyImageFile(file);
  }

  const canExtract = text.trim().length >= 5 || imageFile !== null;

  async function handleExtract() {
    if (!canExtract) return;
    setIsExtracting(true);
    setExtractError(null);

    try {
      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;

      if (imageFile) {
        imageBase64 = await fileToBase64(imageFile);
        imageMimeType = imageFile.type;
      }

      const res = await fetch(`${BASE}/api/prospects/ai-import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim() || undefined,
          imageBase64,
          imageMimeType,
        }),
      });

      const data = await res.json() as { prospects?: object[]; error?: string };

      if (!res.ok) {
        setExtractError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      const raw = (data.prospects ?? []) as Array<Record<string, unknown>>;

      if (raw.length === 0) {
        setExtractError("No prospects found — try adding more detail like addresses or phone numbers.");
        return;
      }

      const parsed = raw.map((p) => ({
        address: String(p.address ?? ""),
        city: String(p.city ?? ""),
        state: String(p.state ?? ""),
        zip: String(p.zip ?? ""),
        contactName: String(p.contactName ?? ""),
        contactPhone: String(p.contactPhone ?? ""),
        contactEmail: String(p.contactEmail ?? ""),
        propertyType: (PROPERTY_TYPES.includes(p.propertyType as PropertyType)
          ? p.propertyType
          : "Other") as PropertyType,
        notes: String(p.notes ?? ""),
        selected: true,
      }));
      setProspects(parsed);
      setStep("review");

      const addresses = parsed.map((p) => p.address).filter(Boolean);
      if (addresses.length > 0) {
        fetch(`${BASE}/api/prospects/check-duplicates`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses }),
        })
          .then((r) => r.ok ? r.json() : Promise.resolve({ matchedAddresses: [] }))
          .then((d: { matchedAddresses?: string[] }) => {
            const matched = d.matchedAddresses ?? [];
            setDuplicateSet(new Set(matched.map((a) => a.toLowerCase().trim())));
          })
          .catch(() => { /* silently ignore — warning is informational only */ });
      }
    } catch {
      setExtractError("Failed to connect to server. Please try again.");
    } finally {
      setIsExtracting(false);
    }
  }

  function updateProspect(idx: number, field: keyof Omit<ParsedProspect, "selected">, value: string) {
    setProspects((prev) =>
      prev.map((p, i) =>
        i === idx ? { ...p, [field]: value } : p
      )
    );
  }

  function toggleSelected(idx: number) {
    setProspects((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, selected: !p.selected } : p))
    );
  }

  function toggleAll() {
    const allSelected = prospects.every((p) => p.selected);
    setProspects((prev) => prev.map((p) => ({ ...p, selected: !allSelected })));
  }

  const selectedCount = prospects.filter((p) => p.selected).length;

  async function handleCreate() {
    const toCreate = prospects.filter((p) => p.selected && p.address.trim());
    if (toCreate.length === 0) return;

    setIsCreating(true);
    setCreateError(null);

    let successCount = 0;
    let firstError: string | null = null;

    for (const p of toCreate) {
      try {
        const res = await fetch(`${BASE}/api/prospects`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: p.address.trim(),
            city: p.city.trim() || null,
            state: p.state.trim() || null,
            zip: p.zip.trim() || null,
            contactName: p.contactName.trim() || null,
            contactPhone: p.contactPhone.trim() || null,
            contactEmail: p.contactEmail.trim() || null,
            propertyType: p.propertyType,
            notes: p.notes.trim() || null,
            status: "cold",
          }),
        });
        if (res.ok) {
          successCount++;
        } else {
          const d = await res.json() as { error?: string };
          if (!firstError) firstError = d.error ?? "Failed to create one prospect";
        }
      } catch {
        if (!firstError) firstError = "Network error creating prospects";
      }
    }

    setIsCreating(false);

    if (successCount > 0) {
      onImported();
      handleClose();
    } else {
      setCreateError(firstError ?? "Failed to create prospects");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {step === "paste" ? "Import Prospects from List" : `Review ${prospects.length} Extracted Prospect${prospects.length !== 1 ? "s" : ""}`}
          </DialogTitle>
        </DialogHeader>

        {step === "paste" ? (
          <div className="flex flex-col gap-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Paste a list of businesses below, attach a photo or screenshot, or both. The AI will extract structured prospects for you to review.
            </p>

            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setExtractError(null); }}
              placeholder="Paste a list of businesses, addresses, or contacts here... (optional if uploading an image)"
              rows={6}
              className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono leading-relaxed"
            />

            {/* Image upload area */}
            {imagePreviewUrl ? (
              <div className="relative flex items-start gap-3 px-3 py-3 border border-border rounded-lg bg-muted/30">
                <img
                  src={imagePreviewUrl}
                  alt="Selected image"
                  className="h-24 w-auto max-w-[180px] rounded object-cover border border-border flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{imageFile?.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {imageFile ? `${(imageFile.size / 1024).toFixed(0)} KB` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Image will be analyzed by AI alongside any pasted text.</p>
                </div>
                <button
                  onClick={removeImage}
                  className="flex-shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 px-4 py-5 border-2 border-dashed rounded-lg cursor-pointer transition-colors select-none ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <ImagePlus className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  <span className="font-medium text-foreground">Attach a photo or screenshot</span>
                  {" "}— drag & drop, click to browse, or paste (Ctrl+V)
                </p>
                <p className="text-xs text-muted-foreground">JPG, PNG, WebP · Max 3.75 MB · Optional</p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {extractError && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {extractError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExtract}
                disabled={isExtracting || !canExtract}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Extract Prospects
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-2 min-h-0 flex-1">
            <p className="text-sm text-muted-foreground flex-shrink-0">
              Review the extracted prospects below. Edit any field, uncheck ones you don't want, then confirm to create them all.
            </p>

            <div className="overflow-auto flex-1 border border-border rounded-lg">
              <table className="w-full text-xs min-w-[900px]">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <tr>
                    <th className="w-8 px-2 py-2 text-left">
                      <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                        {prospects.every((p) => p.selected) ? (
                          <CheckSquare className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Address</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-24">City</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-10">St</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-14">Zip</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-28">Contact</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-26">Phone</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-36">Email</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-22">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {prospects.map((p, idx) => (
                    <tr
                      key={idx}
                      className={`transition-colors ${p.selected ? "bg-background" : "bg-muted/30 opacity-60"}`}
                    >
                      <td className="px-2 py-1.5">
                        <button onClick={() => toggleSelected(idx)} className="text-muted-foreground hover:text-foreground">
                          {p.selected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={p.address}
                          onChange={(e) => updateProspect(idx, "address", e.target.value)}
                          className="w-full px-1.5 py-0.5 border border-transparent rounded hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent text-xs"
                        />
                        {duplicateSet.has(p.address.toLowerCase().trim()) && (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600 mt-0.5">
                            <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />
                            May already exist
                          </span>
                        )}
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={p.city}
                          onChange={(e) => updateProspect(idx, "city", e.target.value)}
                          className="w-full px-1.5 py-0.5 border border-transparent rounded hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={p.state}
                          onChange={(e) => updateProspect(idx, "state", e.target.value.toUpperCase().slice(0, 2))}
                          maxLength={2}
                          className="w-full px-1.5 py-0.5 border border-transparent rounded hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent text-xs uppercase"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={p.zip}
                          onChange={(e) => updateProspect(idx, "zip", e.target.value.replace(/\D/g, "").slice(0, 5))}
                          maxLength={5}
                          className="w-full px-1.5 py-0.5 border border-transparent rounded hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={p.contactName}
                          onChange={(e) => updateProspect(idx, "contactName", e.target.value)}
                          className="w-full px-1.5 py-0.5 border border-transparent rounded hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={p.contactPhone}
                          onChange={(e) => updateProspect(idx, "contactPhone", e.target.value)}
                          className="w-full px-1.5 py-0.5 border border-transparent rounded hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={p.contactEmail}
                          onChange={(e) => updateProspect(idx, "contactEmail", e.target.value)}
                          type="email"
                          className="w-full px-1.5 py-0.5 border border-transparent rounded hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <select
                          value={p.propertyType}
                          onChange={(e) => updateProspect(idx, "propertyType", e.target.value)}
                          className="w-full px-1 py-0.5 border border-transparent rounded hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent text-xs"
                        >
                          {PROPERTY_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {createError && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex-shrink-0">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {createError}
              </div>
            )}

            <div className="flex items-center justify-between flex-shrink-0 pt-1">
              <button
                onClick={() => setStep("paste")}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating || selectedCount === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <ChevronRight className="w-4 h-4" />
                      Create {selectedCount} Prospect{selectedCount !== 1 ? "s" : ""}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
