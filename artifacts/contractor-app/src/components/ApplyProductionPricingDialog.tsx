import { useMemo, useState } from "react";
import { X, Loader2, Receipt, AlertTriangle, Info } from "lucide-react";
import {
  useProductionBillingTypes,
  useApplyProductionPricing,
  useProductionPriceOverrides,
  type ProductionServiceType,
  type ProductionPriceOverride,
  type ApplyProductionPricingResult,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

export interface ApplyProductionPricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: number;
  /** Service-type ids checked on the job card (job.mhProductionServices). */
  checkedServiceIds: number[];
  /** The job's home/construction type (job.mfhConstructionType), used for home-type pricing. */
  homeType?: string | null;
  clientName?: string | null;
  /** Client id — used to load per-client price overrides. */
  clientId?: number | null;
  /** Master Production Billing Catalog (used only to label items and detect quantity-based ones). */
  catalog: ProductionServiceType[];
  /** Called with the persisted draft invoice once pricing is applied. */
  onApplied: (
    invoice: unknown,
    meta: { lockedExisting?: ApplyProductionPricingResult["lockedExisting"]; updated?: boolean; created?: boolean },
  ) => void;
  /** Called when the office chooses to keep the existing draft instead of overwriting. */
  onKeepExisting: () => void;
}

/** Map a construction-type string to the per-type price field key on a service/override row. */
function homeTypeToPriceField(homeType?: string | null): "priceVog" | "priceHybrid" | "priceDrywall" | null {
  if (!homeType) return null;
  const t = homeType.toLowerCase();
  if (t.includes("vog")) return "priceVog";
  if (t.includes("hybrid")) return "priceHybrid";
  if (t.includes("drywall")) return "priceDrywall";
  return null;
}

/** Resolve the display price for a catalog item given the job's home type and optional client overrides. */
function resolvePrice(
  item: ProductionServiceType,
  homeType: string | null | undefined,
  overrideMap: Map<number, ProductionPriceOverride>,
): number | null {
  const override = overrideMap.get(item.id);
  const field = homeTypeToPriceField(homeType);

  // Per-type price: check override first, then master per-type, then fall back to base price
  if (field) {
    const overridePerType = override?.[field];
    if (overridePerType != null && overridePerType !== "") return parseFloat(overridePerType);
    const masterPerType = item[field];
    if (masterPerType != null && masterPerType !== "") return parseFloat(masterPerType);
  }

  // Flat / base price
  const overrideBase = override?.price;
  if (overrideBase != null && overrideBase !== "") return parseFloat(overrideBase);
  if (item.price != null && item.price !== "") return parseFloat(item.price);

  return null;
}

export function ApplyProductionPricingDialog({
  open,
  onOpenChange,
  jobId,
  checkedServiceIds,
  homeType,
  clientName,
  clientId,
  catalog,
  onApplied,
  onKeepExisting,
}: ApplyProductionPricingDialogProps) {
  const { data: billingTypes = [] } = useProductionBillingTypes();
  const { data: overrides = [] } = useProductionPriceOverrides(clientId);
  const applyPricing = useApplyProductionPricing();

  /** keyed by serviceTypeId for O(1) lookup */
  const overrideMap = useMemo(
    () => new Map(overrides.map(o => [o.serviceTypeId, o])),
    [overrides],
  );

  const quantityBasedTypes = useMemo(
    () => new Set(billingTypes.filter(bt => bt.quantityBased).map(bt => bt.value)),
    [billingTypes],
  );

  // Checked catalog items, ordered by Display Order (sortOrder), matching the engine's output order.
  const checkedItems = useMemo(() => {
    const ids = new Set(checkedServiceIds);
    return catalog
      .filter(c => ids.has(c.id))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [catalog, checkedServiceIds]);

  const quantityItems = useMemo(
    () => checkedItems.filter(c => quantityBasedTypes.has(c.billingType)),
    [checkedItems, quantityBasedTypes],
  );

  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [conflict, setConflict] = useState<{ invoiceId: number; invoiceNumber?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function qtyFor(id: number): number {
    return quantities[id] ?? 1;
  }

  function setQty(id: number, value: number) {
    setQuantities(prev => ({ ...prev, [id]: value }));
  }

  async function runApply(overwrite: boolean) {
    setError(null);
    try {
      const payload: Record<number, number> = {};
      for (const item of quantityItems) payload[item.id] = Math.max(1, Math.round(qtyFor(item.id)));
      const result = await applyPricing.mutateAsync({ jobId, quantities: payload, overwrite });

      if (result.conflict === "draft") {
        setConflict({ invoiceId: result.invoiceId ?? 0, invoiceNumber: result.invoiceNumber });
        return;
      }
      if (result.invoice) {
        onApplied(result.invoice, {
          lockedExisting: result.lockedExisting ?? null,
          updated: result.updated,
          created: result.created,
        });
        close();
        return;
      }
      setError(result.error ?? "Could not apply pricing. Please try again.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not apply pricing. Please try again.";
      setError(msg);
    }
  }

  function close() {
    setConflict(null);
    setError(null);
    setQuantities({});
    onOpenChange(false);
  }

  if (!open) return null;

  const busy = applyPricing.isPending;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400 flex-shrink-0" />
        <div className="p-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900">Apply Production Pricing</h3>
              <p className="text-sm text-gray-500 truncate">
                {clientName ? `${clientName}` : "Production profile"}
                {homeType ? ` · ${homeType}` : ""}
              </p>
            </div>
            <button
              onClick={close}
              disabled={busy}
              className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-50">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 pb-2 overflow-y-auto flex-1">
          {checkedItems.length === 0 ? (
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-600">
              No production items are checked on this job. Check the billable items on the job card first, then apply
              pricing.
            </div>
          ) : conflict ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <p className="font-semibold">A draft invoice already exists{conflict.invoiceNumber ? ` (${conflict.invoiceNumber})` : ""}.</p>
                  <p className="mt-1 text-amber-800">
                    Overwrite it with the newly calculated pricing, or keep the existing draft as-is?
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3">
                A draft invoice will be built from the checked production items, priced from this client's Production
                profile. Set quantities for any per-unit items below, then review the invoice.
              </p>
              <ul className="space-y-2">
                {checkedItems.map(item => {
                  const isQty = quantityBasedTypes.has(item.billingType);
                  const resolvedPrice = resolvePrice(item, homeType, overrideMap);
                  const hasOverride = overrideMap.has(item.id);
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {item.invoiceDescription || item.name}
                        </p>
                        <p className="text-[11px] text-gray-500">{item.billingType}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {resolvedPrice != null && (
                          <span className={`text-sm font-semibold ${hasOverride ? "text-blue-600" : "text-amber-600"}`}>
                            {isQty
                              ? `${formatCurrency(resolvedPrice)} / unit`
                              : formatCurrency(resolvedPrice)}
                          </span>
                        )}
                        {isQty ? (
                          <div className="flex items-center gap-1.5">
                            <label className="text-[11px] text-gray-500">Qty</label>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={qtyFor(item.id)}
                              onChange={e => setQty(item.id, parseInt(e.target.value) || 1)}
                              className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                          </div>
                        ) : (
                          resolvedPrice == null && (
                            <span className="text-[11px] font-medium text-gray-400">Flat</span>
                          )
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="p-6 pt-4 flex-shrink-0 border-t border-gray-100 flex gap-2">
          {conflict ? (
            <>
              <button
                onClick={() => { onKeepExisting(); close(); }}
                disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-50 disabled:opacity-50">
                Keep existing
              </button>
              <button
                onClick={() => runApply(true)}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700 disabled:opacity-50">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Overwrite
              </button>
            </>
          ) : (
            <>
              <button
                onClick={close}
                disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={() => runApply(false)}
                disabled={busy || checkedItems.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700 disabled:opacity-50">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Build Invoice
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
