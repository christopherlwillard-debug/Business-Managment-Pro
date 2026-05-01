import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type Asset, type AssetStatus, type AssetType } from "@workspace/api-client-react";
import {
  Wrench, Plus, Pencil, Trash2, Upload, X, Check, ChevronDown, ChevronUp,
  Car, Truck, Hammer, Package2, BadgeCheck, DollarSign, BarChart2, TrendingDown,
  Info, Building2, Shovel, Percent, Download,
} from "lucide-react";

interface BusUseRow { id: number; assetId: number; year: number; businessUsePct: number; }
type AssetWithBusUse = Asset & { businessUseRows: { year: number; businessUsePct: number }[] };

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function api(path: string) { return `${BASE}${path}`; }

const ASSET_TYPES: AssetType[] = ["Vehicle", "Equipment", "Tool", "Trailer", "Land Improvement", "Building", "Other"];
const ASSET_STATUSES: AssetStatus[] = ["active", "sold", "retired"];

const DEPRECIATION_METHODS = [
  { value: "straight-line", label: "Straight-Line", description: "Equal deduction each year over useful life" },
  { value: "section-179", label: "Section 179 (Full Year 1)", description: "Deduct full cost in year of purchase" },
  { value: "bonus", label: "Bonus Depreciation", description: "Large % year 1, straight-line on remainder" },
] as const;

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
  "Land Improvement": Shovel,
  Building: Building2,
  Other: Package2,
};

const TYPE_USEFUL_LIFE: Record<AssetType, number> = {
  Vehicle: 5,
  Trailer: 5,
  Equipment: 5,
  Tool: 7,
  "Land Improvement": 15,
  Building: 39,
  Other: 5,
};

const CURRENT_YEAR = new Date().getFullYear();

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function parseDate(d?: string | null) {
  if (!d) return "";
  return d.slice(0, 10);
}

function getPurchaseYear(purchaseDate: string): number {
  return parseInt(purchaseDate.slice(0, 4));
}

interface DepreciationRow {
  year: number;
  annualDeduction: number;
  accumulated: number;
  bookValue: number;
  businessUsePct?: number;
}

function calcDepreciationSchedule(
  asset: Asset,
  busUseRows?: { year: number; businessUsePct: number }[],
): DepreciationRow[] {
  const cost = asset.purchasePrice;
  const salvage = asset.salvageValue ?? 0;
  const life = asset.usefulLifeYears;
  const method = asset.depreciationMethod ?? "straight-line";
  const bonusPct = (asset.bonusDepreciationPct ?? 60) / 100;
  const startYear = getPurchaseYear(asset.purchaseDate);

  if (!life || life <= 0 || cost <= 0) return [];

  const getBusUsePct = (year: number): number => {
    const match = busUseRows?.find(r => r.year === year);
    return match !== undefined ? match.businessUsePct : 100;
  };

  const hasOverride = (year: number): boolean =>
    busUseRows !== undefined && busUseRows.some(r => r.year === year);

  const rows: DepreciationRow[] = [];

  if (method === "section-179") {
    const deduction = cost;
    let accumulated = 0;
    for (let i = 0; i < life; i++) {
      const year = startYear + i;
      const pct = getBusUsePct(year);
      const fullAnnual = i === 0 ? deduction : 0;
      const adjustedAnnual = fullAnnual * (pct / 100);
      accumulated += adjustedAnnual;
      rows.push({
        year,
        annualDeduction: adjustedAnnual,
        accumulated,
        bookValue: Math.max(0, cost - accumulated),
        businessUsePct: (hasOverride(year) || pct < 100) ? pct : undefined,
      });
    }
    return rows;
  }

  if (method === "bonus") {
    const depreciableBasis = cost - salvage;
    if (life <= 1) {
      const pct = getBusUsePct(startYear);
      const adjusted = depreciableBasis * (pct / 100);
      rows.push({
        year: startYear,
        annualDeduction: adjusted,
        accumulated: adjusted,
        bookValue: Math.max(salvage, cost - adjusted),
        businessUsePct: (hasOverride(startYear) || pct < 100) ? pct : undefined,
      });
      return rows;
    }
    const bonusDeduction = depreciableBasis * bonusPct;
    const remainder = depreciableBasis - bonusDeduction;
    const remainingYears = life - 1;
    const annualOnRemainder = remainingYears > 0 ? remainder / remainingYears : 0;
    let accumulated = 0;
    for (let i = 0; i < life; i++) {
      const year = startYear + i;
      const pct = getBusUsePct(year);
      const fullAnnual = i === 0 ? bonusDeduction : annualOnRemainder;
      const adjustedAnnual = fullAnnual * (pct / 100);
      accumulated += adjustedAnnual;
      rows.push({
        year,
        annualDeduction: adjustedAnnual,
        accumulated,
        bookValue: Math.max(salvage, cost - accumulated),
        businessUsePct: (hasOverride(year) || pct < 100) ? pct : undefined,
      });
    }
    return rows;
  }

  const fullAnnual = (cost - salvage) / life;
  let accumulated = 0;
  for (let i = 0; i < life; i++) {
    const year = startYear + i;
    const pct = getBusUsePct(year);
    const adjustedAnnual = fullAnnual * (pct / 100);
    accumulated += adjustedAnnual;
    rows.push({
      year,
      annualDeduction: adjustedAnnual,
      accumulated,
      bookValue: Math.max(salvage, cost - accumulated),
      businessUsePct: (hasOverride(year) || pct < 100) ? pct : undefined,
    });
  }
  return rows;
}

function getAccumulatedDepreciation(asset: Asset, asOfYear: number, busUseRows?: { year: number; businessUsePct: number }[]): number {
  const schedule = calcDepreciationSchedule(asset, busUseRows);
  return schedule.filter(r => r.year <= asOfYear).reduce((s, r) => s + r.annualDeduction, 0);
}

function getBookValue(asset: Asset, asOfYear: number, busUseRows?: { year: number; businessUsePct: number }[]): number {
  const schedule = calcDepreciationSchedule(asset, busUseRows);
  const row = [...schedule].reverse().find(r => r.year <= asOfYear);
  if (!row) return asset.purchasePrice;
  return row.bookValue;
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
  usefulLifeYears: string;
  salvageValue: string;
  depreciationMethod: string;
  bonusDepreciationPct: string;
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
  usefulLifeYears: "5",
  salvageValue: "0",
  depreciationMethod: "straight-line",
  bonusDepreciationPct: "60",
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
    usefulLifeYears: a.usefulLifeYears != null ? String(a.usefulLifeYears) : "5",
    salvageValue: a.salvageValue != null ? String(a.salvageValue) : "0",
    depreciationMethod: a.depreciationMethod ?? "straight-line",
    bonusDepreciationPct: a.bonusDepreciationPct != null ? String(a.bonusDepreciationPct) : "60",
  };
}

function fetchAssets(): Promise<AssetWithBusUse[]> {
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
  const [isSaving, setIsSaving] = useState(false);
  const [busUseYear, setBusUseYear] = useState<string>("");
  const [busUsePct, setBusUsePct] = useState<string>("100");
  const [busUseAdding, setBusUseAdding] = useState(false);
  const [formBusUseRows, setFormBusUseRows] = useState<{year: string; pct: string}[]>([]);
  const [formBusUseAddYear, setFormBusUseAddYear] = useState<string>("");
  const [formBusUseAddPct, setFormBusUseAddPct] = useState<string>("100");
  const [formBusUseShowing, setFormBusUseShowing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formFileInputRef = useRef<HTMLInputElement>(null);
  const uploadAssetRef = useRef<number | null>(null);

  const { data: assets = [], isLoading } = useQuery<AssetWithBusUse[]>({
    queryKey: ["assets"],
    queryFn: fetchAssets,
  });

  const { data: busUseRows = [] } = useQuery<BusUseRow[]>({
    queryKey: ["asset-business-use", expandedId],
    queryFn: () => expandedId
      ? fetch(api(`/api/assets/${expandedId}/business-use`), { credentials: "include" }).then(r => r.json())
      : Promise.resolve([]),
    enabled: expandedId !== null,
  });

  const busUseUpsertMutation = useMutation({
    mutationFn: ({ assetId, year, pct }: { assetId: number; year: number; pct: number }) =>
      fetch(api(`/api/assets/${assetId}/business-use`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, businessUsePct: pct }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-business-use", expandedId] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setBusUseAdding(false);
      setBusUseYear("");
      setBusUsePct("100");
      toast({ title: "Business use % saved" });
    },
    onError: () => toast({ title: "Failed to save business use %", variant: "destructive" }),
  });

  const busUseDeleteMutation = useMutation({
    mutationFn: ({ assetId, year }: { assetId: number; year: number }) =>
      fetch(api(`/api/assets/${assetId}/business-use/${year}`), {
        method: "DELETE",
        credentials: "include",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-business-use", expandedId] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast({ title: "Business use % removed" });
    },
    onError: () => toast({ title: "Failed to remove business use %", variant: "destructive" }),
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
    setFormBusUseRows([]);
    setFormBusUseShowing(false);
    setFormBusUseAddYear(CURRENT_YEAR.toString());
    setFormBusUseAddPct("100");
    setShowForm(true);
  }

  function openEdit(a: AssetWithBusUse) {
    setEditAsset(a);
    setForm(assetToForm(a));
    setFormFile(null);
    setFormBusUseRows((a.businessUseRows ?? []).map(r => ({ year: String(r.year), pct: String(r.businessUsePct) })));
    setFormBusUseShowing((a.businessUseRows ?? []).length > 0);
    setFormBusUseAddYear(CURRENT_YEAR.toString());
    setFormBusUseAddPct("100");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditAsset(null);
    setForm(emptyForm());
    setFormFile(null);
    setFormBusUseRows([]);
    setFormBusUseShowing(false);
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
      usefulLifeYears: form.usefulLifeYears ? parseInt(form.usefulLifeYears) : null,
      salvageValue: form.salvageValue !== "" ? parseFloat(form.salvageValue) : 0,
      depreciationMethod: form.depreciationMethod || "straight-line",
      bonusDepreciationPct: form.bonusDepreciationPct ? parseInt(form.bonusDepreciationPct) : 60,
    };
    if (!payload.name || !payload.purchaseDate || isNaN(payload.purchasePrice)) {
      toast({ title: "Name, purchase date, and purchase price are required", variant: "destructive" });
      setIsSaving(false);
      return;
    }
    const fileToUpload = formFile;
    const origYears = new Set((editAsset as AssetWithBusUse | null)?.businessUseRows?.map(r => r.year) ?? []);
    const newYears = new Set(formBusUseRows.map(r => parseInt(r.year)).filter(y => !isNaN(y)));
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
        // Sync bus-use rows
        let busUseFailed = false;
        for (const row of formBusUseRows) {
          const yr = parseInt(row.year); const pct = parseInt(row.pct);
          if (!isNaN(yr) && !isNaN(pct)) {
            const r2 = await fetch(api(`/api/assets/${updated.id}/business-use`), { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: yr, businessUsePct: pct }) });
            if (!r2.ok) busUseFailed = true;
          }
        }
        for (const yr of origYears) {
          if (!newYears.has(yr)) {
            const r2 = await fetch(api(`/api/assets/${updated.id}/business-use/${yr}`), { method: "DELETE", credentials: "include" });
            if (!r2.ok) busUseFailed = true;
          }
        }
        queryClient.invalidateQueries({ queryKey: ["assets"] });
        queryClient.invalidateQueries({ queryKey: ["asset-business-use", editAsset.id] });
        closeForm();
        if (busUseFailed) {
          toast({ title: "Asset updated, but some business-use % rows failed to save", variant: "destructive" });
        } else {
          toast({ title: "Asset updated" });
        }
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
        // Save bus-use rows for new asset
        let busUseFailed = false;
        for (const row of formBusUseRows) {
          const yr = parseInt(row.year); const pct = parseInt(row.pct);
          if (!isNaN(yr) && !isNaN(pct)) {
            const r2 = await fetch(api(`/api/assets/${created.id}/business-use`), { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: yr, businessUsePct: pct }) });
            if (!r2.ok) busUseFailed = true;
          }
        }
        queryClient.invalidateQueries({ queryKey: ["assets"] });
        closeForm();
        if (busUseFailed) {
          toast({ title: "Asset added, but some business-use % rows failed to save", variant: "destructive" });
        } else {
          toast({ title: "Asset added" });
        }
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleExportCsv() {
    const headers = [
      "Asset Name", "Type", "Status", "Purchase Date", "Purchase Price",
      "Depreciation Method", "Useful Life (yrs)", "Salvage Value",
      "Year", "Business Use %", "Annual Deduction", "Accumulated Depreciation", "Book Value",
    ];
    const rows: string[][] = [];
    for (const asset of assets) {
      const schedule = calcDepreciationSchedule(asset, asset.businessUseRows);
      if (schedule.length === 0) {
        rows.push([
          asset.name,
          asset.assetType,
          asset.status,
          asset.purchaseDate,
          asset.purchasePrice.toFixed(2),
          asset.depreciationMethod ?? "straight-line",
          String(asset.usefulLifeYears ?? ""),
          String(asset.salvageValue ?? "0"),
          "", "", "", "", "",
        ]);
      } else {
        for (const row of schedule) {
          rows.push([
            asset.name,
            asset.assetType,
            asset.status,
            asset.purchaseDate,
            asset.purchasePrice.toFixed(2),
            asset.depreciationMethod ?? "straight-line",
            String(asset.usefulLifeYears ?? ""),
            String(asset.salvageValue ?? "0"),
            String(row.year),
            `${row.businessUsePct ?? 100}%`,
            row.annualDeduction.toFixed(2),
            row.accumulated.toFixed(2),
            row.bookValue.toFixed(2),
          ]);
        }
      }
    }
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(r => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assets-depreciation-schedule-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
  const activeAssets = assets.filter(a => a.status === "active");
  const soldCount = assets.filter(a => a.status === "sold").length;
  const retiredCount = assets.filter(a => a.status === "retired").length;

  const totalCostBasis = assets.reduce((s, a) => s + a.purchasePrice, 0);
  const currentYearNum = CURRENT_YEAR;
  const totalAccumulated = activeAssets.reduce((s, a) => s + getAccumulatedDepreciation(a, currentYearNum), 0);
  const totalBookValue = activeAssets.reduce((s, a) => {
    const bv = getBookValue(a, currentYearNum);
    return s + bv;
  }, 0);

  const s179Assets = assets.filter(a =>
    a.section179Eligible && a.purchaseDate?.startsWith(selectedYear)
  );
  const s179Total = s179Assets.reduce((s, a) => s + a.purchasePrice, 0);

  const yearOptions = Array.from({ length: 6 }, (_, i) => (CURRENT_YEAR - i).toString());

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
          <p className="text-sm text-muted-foreground mt-0.5">Track equipment, vehicles, and tools — with depreciation schedules for tax planning</p>
        </div>
        <div className="flex items-center gap-2">
          {assets.length > 0 && (
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              title="Export full depreciation schedule as CSV"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Asset
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
            <DollarSign className="w-3.5 h-3.5" /> Cost Basis
          </div>
          <div className="text-2xl font-bold text-foreground">{fmt(totalCostBasis)}</div>
          <div className="text-xs text-muted-foreground">{assets.length} total asset{assets.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
            <TrendingDown className="w-3.5 h-3.5 text-orange-500" /> Accumulated Depr.
          </div>
          <div className="text-2xl font-bold text-orange-600">{fmt(totalAccumulated)}</div>
          <div className="text-xs text-muted-foreground">active assets thru {currentYearNum}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
            <BarChart2 className="w-3.5 h-3.5 text-blue-500" /> Book Value
          </div>
          <div className="text-2xl font-bold text-blue-700">{fmt(totalBookValue)}</div>
          <div className="text-xs text-muted-foreground">
            <span className="text-green-600 font-medium">{activeAssets.length}</span> active ·{" "}
            <span className="text-blue-600">{soldCount}</span> sold ·{" "}
            <span className="text-gray-500">{retiredCount}</span> retired
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
              <BadgeCheck className="w-3.5 h-3.5 text-amber-600" /> Sec. 179
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
          <div className="text-xs text-muted-foreground">{s179Assets.length} eligible in {selectedYear}</div>
        </div>
      </div>

      {/* Status filter */}
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
            const schedule = calcDepreciationSchedule(asset, asset.businessUseRows);
            const hasSchedule = schedule.length > 0;
            const accumThisYear = getAccumulatedDepreciation(asset, currentYearNum, asset.businessUseRows);
            const bookValueNow = getBookValue(asset, currentYearNum, asset.businessUseRows);
            const currentYearBusUse = asset.businessUseRows?.find(r => r.year === currentYearNum);
            const isMixedUse = currentYearBusUse !== undefined && currentYearBusUse.businessUsePct < 100;

            const saleGainLoss = (asset.status === "sold" || asset.status === "retired") && asset.saleDate && asset.salePrice != null
              ? asset.salePrice - getBookValue(asset, getPurchaseYear(asset.saleDate), asset.businessUseRows)
              : null;

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
                      {isMixedUse && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 flex items-center gap-1" title={`${currentYearBusUse?.businessUsePct}% business use in ${currentYearNum}`}>
                          <Percent className="w-3 h-3" /> Mixed-use
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span>{asset.assetType}</span>
                      <span>·</span>
                      <span>{fmt(asset.purchasePrice)}</span>
                      {hasSchedule && asset.status === "active" && (
                        <>
                          <span>·</span>
                          <span className="text-blue-600 font-medium">Book: {fmt(bookValueNow)}</span>
                        </>
                      )}
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
                  <div className="px-4 pb-4 pt-0 border-t border-border space-y-4">
                    {/* Basic details */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                      {asset.serialNumber && (
                        <div>
                          <div className="text-xs text-muted-foreground">Serial #</div>
                          <div className="text-sm font-medium">{asset.serialNumber}</div>
                        </div>
                      )}
                      {asset.usefulLifeYears && (
                        <div>
                          <div className="text-xs text-muted-foreground">Useful Life</div>
                          <div className="text-sm font-medium">{asset.usefulLifeYears} years</div>
                        </div>
                      )}
                      {asset.depreciationMethod && (
                        <div>
                          <div className="text-xs text-muted-foreground">Method</div>
                          <div className="text-sm font-medium">
                            {DEPRECIATION_METHODS.find(m => m.value === asset.depreciationMethod)?.label ?? asset.depreciationMethod}
                          </div>
                        </div>
                      )}
                      {(asset.salvageValue ?? 0) > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground">Salvage Value</div>
                          <div className="text-sm font-medium">{fmt(asset.salvageValue ?? 0)}</div>
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

                    {/* Disposal gain/loss */}
                    {saleGainLoss !== null && (
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold",
                        saleGainLoss >= 0
                          ? "bg-green-50 border-green-200 text-green-800"
                          : "bg-red-50 border-red-200 text-red-800"
                      )}>
                        <TrendingDown className="w-4 h-4 flex-shrink-0" />
                        <span>
                          {saleGainLoss >= 0 ? "Gain on disposal:" : "Loss on disposal:"}
                          {" "}
                          <span className="font-bold">{fmt(Math.abs(saleGainLoss))}</span>
                          <span className="text-xs font-normal ml-1">(sale price − book value at disposal)</span>
                        </span>
                      </div>
                    )}

                    {asset.notes && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Notes</div>
                        <div className="text-sm text-foreground">{asset.notes}</div>
                      </div>
                    )}

                    {/* Depreciation schedule */}
                    {hasSchedule && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingDown className="w-3.5 h-3.5 text-orange-500" />
                          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Depreciation Schedule</span>
                          {asset.status === "active" && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              Accumulated thru {currentYearNum}: <span className="font-semibold text-orange-600">{fmt(accumThisYear)}</span>
                            </span>
                          )}
                        </div>
                        {isMixedUse && currentYearBusUse && (
                          <div className="flex items-center gap-1.5 mb-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">
                            <Percent className="w-3 h-3 flex-shrink-0" />
                            <span>Business use: <span className="font-semibold">{currentYearBusUse.businessUsePct}%</span> ({currentYearNum}) — deductions are scaled accordingly</span>
                          </div>
                        )}
                        <div className="overflow-x-auto rounded-xl border border-border">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50 border-b border-border">
                                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Year</th>
                                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Annual Deduction</th>
                                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Accumulated</th>
                                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Book Value</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {schedule.map((row, i) => {
                                const isCurrent = row.year === currentYearNum;
                                const isPast = row.year < currentYearNum;
                                return (
                                  <tr
                                    key={i}
                                    className={cn(
                                      isCurrent ? "bg-primary/5 font-semibold" : isPast ? "opacity-60" : ""
                                    )}
                                  >
                                    <td className="px-3 py-2 text-left">
                                      {row.year}
                                      {isCurrent && <span className="ml-1 text-[10px] text-primary font-bold">← now</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right text-orange-600">
                                      {row.annualDeduction > 0 ? fmt(row.annualDeduction) : "—"}
                                      {row.businessUsePct !== undefined && (
                                        <span className="ml-1 text-[10px] text-blue-600 font-normal whitespace-nowrap">({row.businessUsePct}% business use)</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.accumulated)}</td>
                                    <td className="px-3 py-2 text-right text-blue-700">{fmt(row.bookValue)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {!hasSchedule && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-xs text-muted-foreground">
                        <Info className="w-3.5 h-3.5 flex-shrink-0" />
                        Edit this asset and add a useful life to see the depreciation schedule.
                      </div>
                    )}

                    {/* Business Use by Year */}
                    {isExpanded && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Percent className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Business Use % by Year</span>
                          <span className="ml-1 text-xs text-muted-foreground">(for mixed-use assets like a personal/business vehicle)</span>
                          {!busUseAdding && (
                            <button
                              onClick={() => { setBusUseAdding(true); setBusUseYear(CURRENT_YEAR.toString()); setBusUsePct("100"); }}
                              className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Plus className="w-3 h-3" /> Add Year
                            </button>
                          )}
                        </div>
                        {busUseRows.length === 0 && !busUseAdding && (
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-xs text-muted-foreground">
                            <Info className="w-3.5 h-3.5 flex-shrink-0" />
                            No overrides — depreciation uses 100% business use for all years. Add a year entry if this asset is used partly for personal use.
                          </div>
                        )}
                        {busUseRows.length > 0 && (
                          <div className="overflow-x-auto rounded-xl border border-border mb-2">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/50 border-b border-border">
                                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Year</th>
                                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Business Use %</th>
                                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Personal Use %</th>
                                  <th className="px-3 py-2"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {busUseRows.map(row => (
                                  <tr key={row.year}>
                                    <td className="px-3 py-2">{row.year}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-blue-700">{row.businessUsePct}%</td>
                                    <td className="px-3 py-2 text-right text-muted-foreground">{100 - row.businessUsePct}%</td>
                                    <td className="px-3 py-2 text-right">
                                      <button
                                        onClick={() => busUseDeleteMutation.mutate({ assetId: asset.id, year: row.year })}
                                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                        title="Remove override"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {busUseAdding && (
                          <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/30 bg-primary/5">
                            <div className="flex flex-col gap-0.5">
                              <label className="text-xs text-muted-foreground">Year</label>
                              <input
                                type="number"
                                min="2000"
                                max="2099"
                                value={busUseYear}
                                onChange={e => setBusUseYear(e.target.value)}
                                className="w-20 border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-xs text-muted-foreground">Business Use %</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="1"
                                  max="100"
                                  value={busUsePct}
                                  onChange={e => setBusUsePct(e.target.value)}
                                  className="w-20 border border-border rounded-lg px-2 pr-6 py-1.5 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                const yr = parseInt(busUseYear);
                                const pct = Math.max(1, Math.min(100, parseInt(busUsePct)));
                                if (!yr || isNaN(pct)) return;
                                busUseUpsertMutation.mutate({ assetId: asset.id, year: yr, pct });
                              }}
                              disabled={busUseUpsertMutation.isPending}
                              className="mt-4 flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                              <Check className="w-3 h-3" /> Save
                            </button>
                            <button
                              onClick={() => setBusUseAdding(false)}
                              className="mt-4 flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
                            >
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        )}
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

      {/* Section 179 summary panel */}
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

      {/* Add/Edit form modal */}
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
                {/* Name */}
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

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Type</label>
                  <select
                    value={form.assetType}
                    onChange={e => {
                      const t = e.target.value as AssetType;
                      setForm(f => ({
                        ...f,
                        assetType: t,
                        usefulLifeYears: TYPE_USEFUL_LIFE[t] != null ? String(TYPE_USEFUL_LIFE[t]) : f.usefulLifeYears,
                      }));
                    }}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Status */}
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

                {/* Purchase date */}
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

                {/* Purchase price */}
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

                {/* Depreciation section heading */}
                <div className="sm:col-span-2 pt-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1 border-b border-border">
                    <TrendingDown className="w-3.5 h-3.5 text-orange-500" />
                    Depreciation Settings
                  </div>
                </div>

                {/* Depreciation method */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-2">Depreciation Method</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {DEPRECIATION_METHODS.map(m => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, depreciationMethod: m.value }))}
                        className={cn(
                          "text-left px-3 py-2.5 rounded-xl border transition-all",
                          form.depreciationMethod === m.value
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border bg-background hover:border-primary/40"
                        )}
                      >
                        <div className="text-sm font-semibold text-foreground">{m.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{m.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Useful life */}
                {form.depreciationMethod !== "section-179" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Useful Life (years)</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={form.usefulLifeYears}
                      onChange={e => setForm(f => ({ ...f, usefulLifeYears: e.target.value }))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="e.g. 5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Preset by type — edit if needed</p>
                  </div>
                )}

                {/* Salvage value */}
                {form.depreciationMethod !== "section-179" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Salvage Value</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.salvageValue}
                        onChange={e => setForm(f => ({ ...f, salvageValue: e.target.value }))}
                        className="w-full border border-border rounded-lg pl-6 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Estimated value at end of useful life</p>
                  </div>
                )}

                {/* Bonus % */}
                {form.depreciationMethod === "bonus" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Bonus % (Year 1)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={form.bonusDepreciationPct}
                        onChange={e => setForm(f => ({ ...f, bonusDepreciationPct: e.target.value }))}
                        className="w-full border border-border rounded-lg px-3 pr-8 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="60"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Default 60% for 2024; check IRS for current year rate</p>
                  </div>
                )}

                {/* Sale fields */}
                {form.status === "sold" && (
                  <>
                    <div className="sm:col-span-2 pt-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1 border-b border-border">Disposal Details</div>
                    </div>
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

                {/* Vendor / Serial */}
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

                {/* Notes */}
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

                {/* Receipt */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">Receipt / Photo</label>
                  <input
                    ref={formFileInputRef}
                    type="file"
                    accept="image/*,.pdf,.heic,.heif"
                    onChange={e => setFormFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                  />
                  {formFile && <p className="text-xs text-muted-foreground mt-1">Selected: {formFile.name}</p>}
                  {editAsset?.receiptUrl && !formFile && (
                    <p className="text-xs text-muted-foreground mt-1">Current receipt on file — select a file to replace it</p>
                  )}
                </div>

                {/* Section 179 toggle */}
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
                      <div className="text-xs text-muted-foreground">Include full purchase price in the Section 179 deduction total</div>
                    </div>
                  </label>
                </div>

                {/* Business Use by Year — in-form editor */}
                <div className="sm:col-span-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setFormBusUseShowing(v => !v)}
                    className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1 border-b border-border w-full text-left hover:text-foreground transition-colors"
                  >
                    <Percent className="w-3.5 h-3.5 text-blue-500" />
                    Business Use % by Year
                    {formBusUseRows.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold normal-case">{formBusUseRows.length} override{formBusUseRows.length !== 1 ? "s" : ""}</span>}
                    {formBusUseShowing ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                  {formBusUseShowing && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-muted-foreground">For mixed-use assets (e.g. camper, personal vehicle) — sets the business-use percentage that applies when calculating depreciation deductions for each year.</p>
                      {formBusUseRows.length > 0 && (
                        <div className="overflow-x-auto rounded-xl border border-border">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50 border-b border-border">
                                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Year</th>
                                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Business Use %</th>
                                <th className="px-3 py-2"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {formBusUseRows.map((row, idx) => (
                                <tr key={idx}>
                                  <td className="px-3 py-2">{row.year}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-blue-700">{row.pct}%</td>
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => setFormBusUseRows(rows => rows.filter((_, i) => i !== idx))}
                                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="flex items-end gap-2">
                        <div className="flex flex-col gap-0.5">
                          <label className="text-xs text-muted-foreground">Year</label>
                          <input
                            type="number"
                            min="2000"
                            max="2099"
                            value={formBusUseAddYear}
                            onChange={e => setFormBusUseAddYear(e.target.value)}
                            className="w-20 border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-xs text-muted-foreground">Business Use %</label>
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={formBusUseAddPct}
                              onChange={e => setFormBusUseAddPct(e.target.value)}
                              className="w-20 border border-border rounded-lg px-2 pr-6 py-1.5 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const yr = parseInt(formBusUseAddYear);
                            const pct = parseInt(formBusUseAddPct);
                            if (isNaN(yr) || isNaN(pct) || pct < 1 || pct > 100) return;
                            setFormBusUseRows(rows => {
                              const existing = rows.findIndex(r => parseInt(r.year) === yr);
                              if (existing >= 0) {
                                return rows.map((r, i) => i === existing ? { year: String(yr), pct: String(pct) } : r);
                              }
                              return [...rows, { year: String(yr), pct: String(pct) }].sort((a, b) => parseInt(a.year) - parseInt(b.year));
                            });
                            setFormBusUseAddYear(String(yr + 1));
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Add
                        </button>
                      </div>
                    </div>
                  )}
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
