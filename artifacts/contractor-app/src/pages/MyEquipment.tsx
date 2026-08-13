import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Warehouse, Plus, Pencil, Trash2, X, Loader2, Package, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";
import { cn } from "@/lib/utils";
import type {
  EquipmentInventoryItem,
  EquipmentCategory,
  EquipmentCondition,
  EquipmentStatus,
} from "./equipment/types";
import {
  CATEGORY_META,
  CONDITION_META,
  STATUS_META,
  EQUIPMENT_CATEGORIES,
} from "./equipment/types";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatCurrency(val: string | null): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// ── Form state ─────────────────────────────────────────────────────────────────
interface FormState {
  name:           string;
  category:       EquipmentCategory;
  subcategory:    string;
  year:           string;
  make:           string;
  model:          string;
  serialNumber:   string;
  condition:      EquipmentCondition;
  status:         EquipmentStatus;
  estimatedValue: string;
  purchasePrice:  string;
  purchaseDate:   string;
  businessId:     string;
  notes:          string;
}

const EMPTY_FORM: FormState = {
  name: "", category: "other", subcategory: "", year: "", make: "", model: "",
  serialNumber: "", condition: "good", status: "in_service",
  estimatedValue: "", purchasePrice: "", purchaseDate: "", businessId: "", notes: "",
};

function itemToForm(item: EquipmentInventoryItem): FormState {
  return {
    name:           item.name,
    category:       item.category as EquipmentCategory,
    subcategory:    item.subcategory ?? "",
    year:           item.year ? String(item.year) : "",
    make:           item.make ?? "",
    model:          item.model ?? "",
    serialNumber:   item.serialNumber ?? "",
    condition:      item.condition as EquipmentCondition,
    status:         item.status as EquipmentStatus,
    estimatedValue: item.estimatedValue ?? "",
    purchasePrice:  item.purchasePrice ?? "",
    purchaseDate:   item.purchaseDate ?? "",
    businessId:     item.businessId ? String(item.businessId) : "",
    notes:          item.notes ?? "",
  };
}

// ── Equipment card ─────────────────────────────────────────────────────────────
function EquipmentCard({
  item,
  onEdit,
  onDelete,
}: {
  item: EquipmentInventoryItem;
  onEdit: (item: EquipmentInventoryItem) => void;
  onDelete: (item: EquipmentInventoryItem) => void;
}) {
  const cat = CATEGORY_META[item.category as EquipmentCategory] ?? CATEGORY_META.other;
  const cond = CONDITION_META[item.condition as EquipmentCondition] ?? CONDITION_META.good;
  const stat = STATUS_META[item.status as EquipmentStatus] ?? STATUS_META.in_service;

  const yearMakeModel = [item.year, item.make, item.model].filter(Boolean).join(" ");

  return (
    <Card className="group relative hover:shadow-md transition-shadow border-border">
      <CardContent className="p-4 space-y-3">
        {/* Category emoji + name */}
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none mt-0.5 flex-shrink-0">{cat.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground leading-tight truncate">{item.name}</p>
            {yearMakeModel && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{yearMakeModel}</p>
            )}
          </div>
          {/* Action buttons — visible on hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(item)}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(item)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          <span className={cn("inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border", cond.color)}>
            {cond.label}
          </span>
          <span className={cn("inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border", stat.color)}>
            {stat.label}
          </span>
          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border bg-muted/60 text-muted-foreground border-border">
            {cat.label}
          </span>
        </div>

        {/* Value info */}
        {(item.estimatedValue || item.purchasePrice) && (
          <div className="flex gap-3 text-xs text-muted-foreground pt-0.5 border-t border-border/60">
            {item.purchasePrice && (
              <span>Paid: <span className="text-foreground font-medium">{formatCurrency(item.purchasePrice)}</span></span>
            )}
            {item.estimatedValue && (
              <span>Est. value: <span className="text-foreground font-medium">{formatCurrency(item.estimatedValue)}</span></span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Equipment form ─────────────────────────────────────────────────────────────
function EquipmentForm({
  form,
  onChange,
  businesses,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  businesses: Array<{ id: number; name: string }>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Name */}
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="eq-name">Equipment Name <span className="text-destructive">*</span></Label>
          <Input
            id="eq-name"
            placeholder="e.g. Skid Steer S570, Sealcoating Rig, 16ft Dump Trailer"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label>Category <span className="text-destructive">*</span></Label>
          <Select value={form.category} onValueChange={(v) => onChange({ category: v as EquipmentCategory })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EQUIPMENT_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORY_META[cat].emoji} {CATEGORY_META[cat].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Subcategory */}
        <div className="space-y-1.5">
          <Label htmlFor="eq-sub">Type / Subcategory</Label>
          <Input
            id="eq-sub"
            placeholder={CATEGORY_META[form.category]?.examples.split(",")[0]?.trim() ?? "e.g. Skid Steer"}
            value={form.subcategory}
            onChange={(e) => onChange({ subcategory: e.target.value })}
          />
        </div>

        {/* Year */}
        <div className="space-y-1.5">
          <Label htmlFor="eq-year">Year</Label>
          <Input
            id="eq-year"
            type="number"
            placeholder="e.g. 2018"
            min={1950}
            max={new Date().getFullYear() + 1}
            value={form.year}
            onChange={(e) => onChange({ year: e.target.value })}
          />
        </div>

        {/* Make */}
        <div className="space-y-1.5">
          <Label htmlFor="eq-make">Make / Brand</Label>
          <Input
            id="eq-make"
            placeholder="e.g. Bobcat, John Deere, SealMaster"
            value={form.make}
            onChange={(e) => onChange({ make: e.target.value })}
          />
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <Label htmlFor="eq-model">Model</Label>
          <Input
            id="eq-model"
            placeholder="e.g. S570, 310E"
            value={form.model}
            onChange={(e) => onChange({ model: e.target.value })}
          />
        </div>

        {/* Condition */}
        <div className="space-y-1.5">
          <Label>Condition</Label>
          <Select value={form.condition} onValueChange={(v) => onChange({ condition: v as EquipmentCondition })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excellent">✅ Excellent</SelectItem>
              <SelectItem value="good">🟢 Good</SelectItem>
              <SelectItem value="fair">🟡 Fair</SelectItem>
              <SelectItem value="poor">🔴 Poor</SelectItem>
              <SelectItem value="for_parts">⚫ Parts Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => onChange({ status: v as EquipmentStatus })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in_service">In Service</SelectItem>
              <SelectItem value="stored">Stored</SelectItem>
              <SelectItem value="for_sale">For Sale</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Purchase price */}
        <div className="space-y-1.5">
          <Label htmlFor="eq-purchase">Purchase Price</Label>
          <Input
            id="eq-purchase"
            type="number"
            placeholder="$0"
            min={0}
            value={form.purchasePrice}
            onChange={(e) => onChange({ purchasePrice: e.target.value })}
          />
        </div>

        {/* Estimated value */}
        <div className="space-y-1.5">
          <Label htmlFor="eq-value">Estimated Current Value</Label>
          <Input
            id="eq-value"
            type="number"
            placeholder="$0"
            min={0}
            value={form.estimatedValue}
            onChange={(e) => onChange({ estimatedValue: e.target.value })}
          />
        </div>

        {/* Purchase date */}
        <div className="space-y-1.5">
          <Label htmlFor="eq-date">Purchase Date</Label>
          <Input
            id="eq-date"
            type="date"
            value={form.purchaseDate}
            onChange={(e) => onChange({ purchaseDate: e.target.value })}
          />
        </div>

        {/* Serial number */}
        <div className="space-y-1.5">
          <Label htmlFor="eq-serial">Serial / VIN</Label>
          <Input
            id="eq-serial"
            placeholder="Optional"
            value={form.serialNumber}
            onChange={(e) => onChange({ serialNumber: e.target.value })}
          />
        </div>

        {/* Business */}
        {businesses.length > 1 && (
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Associated Business</Label>
            <Select
              value={form.businessId || "_none"}
              onValueChange={(v) => onChange({ businessId: v === "_none" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Not assigned (shared)</SelectItem>
                {businesses.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Notes */}
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="eq-notes">Notes</Label>
          <Textarea
            id="eq-notes"
            placeholder="Any additional details — maintenance history, known issues, storage location, etc."
            rows={3}
            value={form.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function MyEquipment() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { businesses } = useBusiness();

  const [categoryFilter, setCategoryFilter] = useState<EquipmentCategory | "all">("all");
  const [statusFilter,   setStatusFilter]   = useState<EquipmentStatus | "all">("all");
  const [dialogOpen,     setDialogOpen]     = useState(false);
  const [editingItem,    setEditingItem]    = useState<EquipmentInventoryItem | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<EquipmentInventoryItem | null>(null);
  const [form,           setForm]           = useState<FormState>(EMPTY_FORM);

  // ── Data ──
  const { data: items = [], isLoading } = useQuery<EquipmentInventoryItem[]>({
    queryKey: ["equipment-inventory"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/equipment/inventory`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load equipment");
      return res.json() as Promise<EquipmentInventoryItem[]>;
    },
  });

  // ── Stats ──
  const stats = {
    total:      items.length,
    in_service: items.filter(i => i.status === "in_service").length,
    stored:     items.filter(i => i.status === "stored").length,
    for_sale:   items.filter(i => i.status === "for_sale").length,
  };

  // ── Category counts ──
  const categoryCounts = Object.fromEntries(
    EQUIPMENT_CATEGORIES.map((cat: EquipmentCategory) => [cat, items.filter(i => i.category === cat).length])
  ) as Record<EquipmentCategory, number>;

  // ── Filtered items ──
  const filtered = items.filter(item => {
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (statusFilter   !== "all" && item.status   !== statusFilter)   return false;
    return true;
  });

  // ── Mutations ──
  const saveItem = useMutation({
    mutationFn: async (payload: FormState & { id?: number }) => {
      const { id, ...body } = payload;
      const url  = id ? `${base}/api/equipment/inventory/${id}` : `${base}/api/equipment/inventory`;
      const method = id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...body,
          year:      body.year      ? Number(body.year)           : null,
          businessId: body.businessId ? Number(body.businessId)  : null,
          estimatedValue: body.estimatedValue || null,
          purchasePrice:  body.purchasePrice  || null,
          purchaseDate:   body.purchaseDate   || null,
          subcategory:    body.subcategory    || null,
          make:           body.make           || null,
          model:          body.model          || null,
          serialNumber:   body.serialNumber   || null,
          notes:          body.notes          || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err.error ?? "Failed to save"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-inventory"] });
      toast({ title: editingItem ? "Equipment updated" : "Equipment added" });
      setDialogOpen(false);
      setEditingItem(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${base}/api/equipment/inventory/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-inventory"] });
      toast({ title: "Equipment removed" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  // ── Handlers ──
  function openAdd() {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(item: EquipmentInventoryItem) {
    setEditingItem(item);
    setForm(itemToForm(item));
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    saveItem.mutate({ ...form, id: editingItem?.id });
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Warehouse className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">My Equipment</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Everything you own — your equipment profile helps identify what you already have vs. what you still need.
          </p>
        </div>
        <Button onClick={openAdd} size="sm" className="flex-shrink-0">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Equipment
        </Button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Items",  value: stats.total,      color: "text-foreground" },
          { label: "In Service",   value: stats.in_service, color: "text-green-600" },
          { label: "Stored",       value: stats.stored,     color: "text-slate-500" },
          { label: "For Sale",     value: stats.for_sale,   color: "text-violet-600" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-3 text-center">
              <p className={cn("text-2xl font-bold", color)}>{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2">
        {/* Category tabs */}
        <div
          className="flex gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap pb-0.5"
          style={{ scrollbarWidth: "none" } as React.CSSProperties}
        >
          <button
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border whitespace-nowrap",
              categoryFilter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            All ({items.length})
          </button>
          {EQUIPMENT_CATEGORIES.filter((cat: EquipmentCategory) => categoryCounts[cat] > 0).map((cat: EquipmentCategory) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border whitespace-nowrap",
                categoryFilter === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
            >
              {CATEGORY_META[cat].emoji} {CATEGORY_META[cat].label} ({categoryCounts[cat]})
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "in_service", "stored", "for_sale", "retired"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors border whitespace-nowrap",
                statusFilter === s
                  ? "bg-secondary text-secondary-foreground border-secondary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50"
              )}
            >
              {s === "all" ? "Any Status" : STATUS_META[s as EquipmentStatus].label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Package className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          {items.length === 0 ? (
            <>
              <p className="font-semibold text-foreground">No equipment logged yet</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Add everything you own — skid steers, trailers, sealcoating rigs, dump trucks, tools. 
                Your equipment profile helps identify gaps when bidding new work.
              </p>
              <Button onClick={openAdd} className="mt-2">
                <Plus className="w-4 h-4 mr-1.5" />
                Add Your First Item
              </Button>
            </>
          ) : (
            <>
              <p className="font-medium text-muted-foreground">No equipment matches these filters</p>
              <Button variant="ghost" size="sm" onClick={() => { setCategoryFilter("all"); setStatusFilter("all"); }}>
                Clear filters
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item: EquipmentInventoryItem) => (
            <EquipmentCard
              key={item.id}
              item={item}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* ── Add / Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingItem(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
          </DialogHeader>
          <EquipmentForm
            form={form}
            onChange={(patch) => setForm(prev => ({ ...prev, ...patch }))}
            businesses={businesses}
          />
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveItem.isPending}>
              {saveItem.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                editingItem ? "Save Changes" : "Add Equipment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove equipment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.name}</strong> from your equipment profile. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteItem.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteItem.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
