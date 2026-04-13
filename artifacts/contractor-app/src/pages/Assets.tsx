import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type Asset, type AssetStatus, type AssetType } from "@workspace/api-client-react";
import {
  Wrench, Plus, Pencil, Trash2, Upload, X, Check, ChevronDown, ChevronUp,
  Car, Truck, Hammer, Package2, BadgeCheck, DollarSign, BarChart2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function api(path: string) { return `${BASE}${path}`; }

const ASSET_TYPES: AssetType[] = ["Vehicle", "Equipment", "Tool", "Trailer", "Other"];
const ASSET_STATUSES: AssetStatus[] = ["active", "sold", "retired"];

const STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Active",
  sold: "Sold",
  retired: "Retired",
};

const STATUS_COLORS: Record<AssetStatus, string> = {
  active: "bg-green-100 text-green-800",
  sold: "bg-blue-100 text-blue-800",
  retired: "bg-gray-100 text-gray-600",
};

const TYPE_ICON: Record<AssetType, typeof Wrench> = {
  Vehicle: Car,
  Trailer: Truck,
  Tool: Hammer,
  Equipment: Wrench,
  Other: Package2,
};

const CURRENT_YEAR = new Date().getFullYear();

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function parseDate(d?: string | null) {
  if (!d) return "";
  return d.slice(0, 10);
}

interface FormState {
  name: string;
  assetType: AssetType;
  purchaseDate: string;
  purchasePrice: string;
  vendor: string;
  serialNumber: string;
  notes: string;
  section179Eligible: boolean;
  status: AssetStatus;
  saleDate: string;
  salePrice: string;
}

const emptyForm = (): FormState => ({
  name: "",
  assetType: "Other",
  purchaseDate: "",
  purchasePrice: "",
  vendor: "",
  serialNumber: "",
  notes: "",
  section179Eligible: false,
  status: "active",
  saleDate: "",
  salePrice: "",
});

function assetToForm(a: Asset): FormState {
  return {
    name: a.name,
    assetType: a.assetType,
    purchaseDate: parseDate(a.purchaseDate),
    purchasePrice: a.purchasePrice.toString(),
    vendor: a.vendor ?? "",
    serialNumber: a.serialNumber ?? "",
    notes: a.notes ?? "",
    section179Eligible: a.section179Eligible,
    status: a.status,
    saleDate: parseDate(a.saleDate),
    salePrice: a.salePrice != null ? a.salePrice.toString() : "",
  };
}

function fetchAssets(): Promise<Asset[]> {
  return fetch(api("/api/assets"), { credentials: "include" })
    .then(r => r.json());
}

export default function Assets() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [filterStatus, setFilterStatus] = useState<"all" | AssetStatus>("all");
  const [selectedYear, setSelectedYear] = useState<string>(CURRENT_YEAR.toString());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [formFile, setFormFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formFileInputRef = useRef<HTMLInputElement>(null);
  const uploadAssetRef = useRef<number | null>(null);

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: fetchAssets,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(api(`/api/assets/${id}`), { method: "DELETE", credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast({ title: "Asset deleted" });
    },
    onError: () => toast({ title: "Failed to delete asset", variant: "destructive" }),
  });

  function openAdd() {
    setEditAsset(null);
    setForm(emptyForm());
    setFormFile(null);
    setShowForm(true);
  }

  function openEdit(a: Asset) {
    setEditAsset(a);
    setForm(assetToForm(a));
    setFormFile(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditAsset(null);
    setForm(emptyForm());
    setFormFile(null);
    if (formFileInputRef.current) formFileInputRef.current.value = "";
  }

  async function uploadReceiptFile(assetId: number, file: File) {
    const fd = new FormData();
    fd.append("receipt", file);
    const r = await fetch(api(`/api/assets/${assetId}/receipt`), {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!r.ok) throw new Error("Upload failed");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    const payload = {
      name: form.name.trim(),
      assetType: form.assetType,
      purchaseDate: form.purchaseDate,
      purchasePrice: parseFloat(form.purchasePrice),
      vendor: form.vendor.trim() || null,
      serialNumber: form.serialNumber.trim() || null,
      notes: form.notes.trim() || null,
      section179Eligible: form.section179Eligible,
      status: form.status,
      saleDate: form.saleDate || null,
      salePrice: form.salePrice ? parseFloat(form.salePrice) : null,
    };
    if (!payload.name || !payload.purchaseDate || isNaN(payload.purchasePrice)) {
      toast({ title: "Name, purchase date, and purchase price are required", variant: "destructive" });
      setIsSaving(false);
      return;
    }
    const fileToUpload = formFile;
    try {
      if (editAsset) {
        const r = await fetch(api(`/api/assets/${editAsset.id}`), {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) { toast({ title: "Failed to update asset", variant: "destructive" }); return; }
        const updated = await r.json();
        if (fileToUpload) {
          try { await uploadReceiptFile(updated.id, fileToUpload); } catch { toast({ title: "Asset saved but receipt upload failed", variant: "destructive" }); }
        }
        queryClient.invalidateQueries({ queryKey: ["assets"] });
        closeForm();
        toast({ title: "Asset updated" });
      } else {
        const r = await fetch(api("/api/assets"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) { toast({ title: "Failed to save asset", variant: "destructive" }); return; }
        const created = await r.json();
        if (fileToUpload) {
          try { await uploadReceiptFile(created.id, fileToUpload); } catch { toast({ title: "Asset saved but receipt upload failed", variant: "destructive" }); }
        }
        queryClient.invalidateQueries({ queryKey: ["assets"] });
        closeForm();
        toast({ title: "Asset added" });
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleUploadReceipt(assetId: number) {
    uploadAssetRef.current = assetId;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const assetId = uploadAssetRef.current;
    if (!file || !assetId) return;

    setUploadingId(assetId);
    const fd = new FormData();
    fd.append("receipt", file);
    try {
      const r = await fetch(api(`/api/assets/${assetId}/receipt`), {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!r.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast({ title: "Receipt uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingId(null);
      uploadAssetRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const filtered = assets.filter(a => filterStatus === "all" || a.status === filterStatus);
  const totalValue = assets.reduce((s, a) => s + a.purchasePrice, 0);
  const activeCount = assets.filter(a => a.status === "active").length;
  const soldCount = assets.filter(a => a.status === "sold").length;
  const retiredCount = assets.filter(a => a.status === "retired").length;

  const s179Assets = assets.filter(a =>
    a.section179Eligible &&
    a.purchaseDate?.startsWith(selectedYear)
  );
  const s179Total = s179Assets.reduce((s, a) => s + a.purchasePrice, 0);

  const [isSaving, setIsSaving] = useState(false);

  const yearOptions = Array.from({ length: 5 }, (_, i) => (CURRENT_YEAR - i).toString());

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.heic,.heif"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Wrench className="w-6 h-6 text-primary" />
            Equipment & Assets
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track business equipment, vehicles, and tools for Section 179 deductions</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Asset
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
            <DollarSign className="w-3.5 h-3.5" /> Total Asset Value
          </div>
          <div className="text-2xl font-bold text-foreground">{fmt(totalValue)}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
            <BarChart2 className="w-3.5 h-3.5" /> Active / Sold / Retired
          </div>
          <div className="text-2xl font-bold text-foreground">
            <span className="text-green-700">{activeCount}</span>
            <span className="text-muted-foreground text-lg"> / </span>
            <span className="text-blue-700">{soldCount}</span>
            <span className="text-muted-foreground text-lg"> / </span>
            <span className="text-gray-500">{retiredCount}</span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 space-y-1 col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
              <BadgeCheck className="w-3.5 h-3.5 text-amber-600" /> Sec. 179 Eligible
            </div>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="text-xs border border-border rounded px-1.5 py-0.5 bg-background"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="text-2xl font-bold text-amber-700">{fmt(s179Total)}</div>
          <div className="text-xs text-muted-foreground">{s179Assets.length} eligible purchase{s179Assets.length !== 1 ? "s" : ""} in {selectedYear}</div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", ...ASSET_STATUSES] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
              filterStatus === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/40"
            )}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
            <span className="ml-1 text-xs opacity-70">
              {s === "all" ? assets.length : assets.filter(a => a.status === s).length}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Loading assets…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
          <Wrench className="w-10 h-10 opacity-30" />
          <p className="text-sm">{filterStatus === "all" ? "No assets yet — add your first piece of equipment." : `No ${filterStatus} assets.`}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(asset => {
            const Icon = TYPE_ICON[asset.assetType] ?? Wrench;
            const isExpanded = expandedId === asset.id;
            return (
              <div key={asset.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : asset.id)}
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground truncate">{asset.name}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[asset.status])}>
                        {STATUS_LABELS[asset.status]}
                      </span>
                      {asset.section179Eligible && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 flex items-center gap-1">
                          <BadgeCheck className="w-3 h-3" /> §179
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span>{asset.assetType}</span>
                      <span>·</span>
                      <span>{fmt(asset.purchasePrice)}</span>
                      <span>·</span>
                      <span>{parseDate(asset.purchaseDate)}</span>
                      {asset.vendor && <><span>·</span><span>{asset.vendor}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(asset); }}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (deletingId === asset.id) {
                          deleteMutation.mutate(asset.id);
                          setDeletingId(null);
                        } else {
                          setDeletingId(asset.id);
                        }
                      }}
                      className={cn(
                        "p-1.5 rounded transition-colors",
                        deletingId === asset.id
                          ? "bg-destructive text-destructive-foreground"
                          : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      )}
                      title={deletingId === asset.id ? "Click again to confirm" : "Delete"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-border space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                      {asset.serialNumber && (
                        <div>
                          <div className="text-xs text-muted-foreground">Serial #</div>
                          <div className="text-sm font-medium">{asset.serialNumber}</div>
                        </div>
                      )}
                      {asset.status === "sold" && asset.saleDate && (
                        <div>
                          <div className="text-xs text-muted-foreground">Sale Date</div>
                          <div className="text-sm font-medium">{parseDate(asset.saleDate)}</div>
                        </div>
                      )}
                      {asset.status === "sold" && asset.salePrice != null && (
                        <div>
                          <div className="text-xs text-muted-foreground">Sale Price</div>
                          <div className="text-sm font-medium">{fmt(asset.salePrice)}</div>
                        </div>
                      )}
                    </div>

                    {asset.notes && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Notes</div>
                        <div className="text-sm text-foreground">{asset.notes}</div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      {asset.receiptUrl ? (
                        <a
                          href={asset.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline underline-offset-2 flex items-center gap-1"
                        >
                          <Upload className="w-3 h-3" /> View Receipt
                        </a>
                      ) : null}
                      <button
                        onClick={() => handleUploadReceipt(asset.id)}
                        disabled={uploadingId === asset.id}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        {uploadingId === asset.id ? "Uploading…" : asset.receiptUrl ? "Replace Receipt" : "Upload Receipt"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {s179Assets.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-amber-900 flex items-center gap-2">
            <BadgeCheck className="w-5 h-5 text-amber-600" />
            Section 179 Summary — {selectedYear}
          </h3>
          <div className="text-sm text-amber-800 space-y-1">
            {s179Assets.map(a => (
              <div key={a.id} className="flex items-center justify-between">
                <span>{a.name} <span className="text-amber-600">({a.assetType})</span></span>
                <span className="font-semibold">{fmt(a.purchasePrice)}</span>
              </div>
            ))}
            <div className="border-t border-amber-300 pt-2 flex items-center justify-between font-bold">
              <span>Total Section 179 Deduction Available</span>
              <span>{fmt(s179Total)}</span>
            </div>
          </div>
          <p className="text-xs text-amber-700">The IRS Section 179 deduction limit changes each year — consult your accountant to confirm the limit and phase-out rules for {selectedYear}.</p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-card z-10 flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">{editAsset ? "Edit Asset" : "Add Asset"}</h2>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">Asset Name <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="e.g. 2020 Ford F-250, Graco Asphalt Sprayer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Type</label>
                  <select
                    value={form.assetType}
                    onChange={e => setForm(f => ({ ...f, assetType: e.target.value as AssetType }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as AssetStatus }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {ASSET_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Purchase Date <span className="text-destructive">*</span></label>
                  <input
                    type="date"
                    required
                    value={form.purchaseDate}
                    onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Purchase Price <span className="text-destructive">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={form.purchasePrice}
                      onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))}
                      className="w-full border border-border rounded-lg pl-6 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Vendor / Dealer</label>
                  <input
                    type="text"
                    value={form.vendor}
                    onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={form.serialNumber}
                    onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Optional"
                  />
                </div>

                {(form.status === "sold") && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Sale Date</label>
                      <input
                        type="date"
                        value={form.saleDate}
                        onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Sale Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.salePrice}
                          onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))}
                          className="w-full border border-border rounded-lg pl-6 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    placeholder="Optional"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">Receipt / Photo</label>
                  <input
                    ref={formFileInputRef}
                    type="file"
                    accept="image/*,.pdf,.heic,.heif"
                    onChange={e => setFormFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                  />
                  {formFile && (
                    <p className="text-xs text-muted-foreground mt-1">Selected: {formFile.name}</p>
                  )}
                  {editAsset?.receiptUrl && !formFile && (
                    <p className="text-xs text-muted-foreground mt-1">Current receipt on file — select a file to replace it</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div
                      onClick={() => setForm(f => ({ ...f, section179Eligible: !f.section179Eligible }))}
                      className={cn(
                        "w-10 h-6 rounded-full transition-colors flex items-center px-0.5",
                        form.section179Eligible ? "bg-amber-500" : "bg-border"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-full bg-white shadow transition-transform",
                        form.section179Eligible ? "translate-x-4" : "translate-x-0"
                      )} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground flex items-center gap-1">
                        <BadgeCheck className="w-4 h-4 text-amber-600" /> Section 179 Eligible
                      </div>
                      <div className="text-xs text-muted-foreground">Include full purchase price in the current-year deduction total</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {editAsset ? "Save Changes" : "Add Asset"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2.5 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
