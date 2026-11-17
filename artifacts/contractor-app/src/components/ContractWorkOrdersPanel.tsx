import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateContractClientProgram,
  useCreateContractWorkOrder,
  useDecideContractWorkOrder,
  useGetContractWorkOrderOptions,
  useListContractClientPrograms,
  useListContractWorkOrders,
  getListContractClientProgramsQueryKey,
  getListContractWorkOrdersQueryKey,
  type ContractWorkOrder,
} from "@workspace/api-client-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";

export function ContractWorkOrdersPanel() {
  const { activeBusiness } = useBusiness();
  const businessId = activeBusiness?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [payerClientId, setPayerClientId] = useState("");
  const [programName, setProgramName] = useState("");
  const [programId, setProgramId] = useState("");
  const [externalOrderNumber, setExternalOrderNumber] = useState("");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [homeownerContactId, setHomeownerContactId] = useState("");
  const [agreedPrice, setAgreedPrice] = useState("");
  const [decisionBusy, setDecisionBusy] = useState<number | null>(null);

  const programsQuery = useListContractClientPrograms(
    { businessId: businessId ?? 0 },
  );
  const ordersQuery = useListContractWorkOrders(
    { businessId: businessId ?? 0 },
  );
  const optionsQuery = useGetContractWorkOrderOptions(
    { businessId: businessId ?? 0 },
  );
  const createProgram = useCreateContractClientProgram();
  const createOrder = useCreateContractWorkOrder();
  const decideOrder = useDecideContractWorkOrder();

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListContractClientProgramsQueryKey({ businessId: businessId ?? 0 }) }),
      queryClient.invalidateQueries({ queryKey: getListContractWorkOrdersQueryKey({ businessId: businessId ?? 0 }) }),
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] }),
    ]);
  }

  async function saveProgram(event: React.FormEvent) {
    event.preventDefault();
    if (businessId == null || !payerClientId || !programName.trim()) return;
    try {
      const created = await createProgram.mutateAsync({
        data: { businessId, payerClientId: Number(payerClientId), name: programName.trim() },
      });
      setProgramId(String(created.id));
      setProgramName("");
      toast({ title: "Contract program added" });
      await refresh();
    } catch (error) {
      toast({ title: "Could not add program", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  }

  async function saveOrder(event: React.FormEvent) {
    event.preventDefault();
    if (businessId == null || !programId || !externalOrderNumber.trim() || !title.trim()) return;
    try {
      await createOrder.mutateAsync({
        data: {
          businessId,
          programId: Number(programId),
          externalOrderNumber: externalOrderNumber.trim(),
          title: title.trim(),
          scope: scope.trim() || null,
          propertyId: propertyId ? Number(propertyId) : null,
          homeownerContactId: homeownerContactId ? Number(homeownerContactId) : null,
          agreedPrice: agreedPrice ? Number(agreedPrice) : null,
        },
      });
      setExternalOrderNumber("");
      setTitle("");
      setScope("");
      setPropertyId("");
      setHomeownerContactId("");
      setAgreedPrice("");
      toast({ title: "Work order recorded" });
      await refresh();
    } catch (error) {
      toast({ title: "Could not record work order", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  }

  async function decide(order: ContractWorkOrder, decision: "accept" | "decline" | "cancel") {
    const reason = decision === "cancel" ? window.prompt("Why is this accepted work order being cancelled?") : "";
    if (decision === "cancel" && !reason?.trim()) return;
    if (!businessId) return;
    setDecisionBusy(order.id);
    try {
      await decideOrder.mutateAsync({
        id: order.id,
        params: { businessId },
        data: { decision, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
      });
      toast({ title: decision === "accept" ? "Work order accepted and job created" : decision === "decline" ? "Work order declined" : "Cancellation recorded" });
      await refresh();
    } catch (error) {
      toast({ title: "Decision was not saved", description: error instanceof Error ? error.message : "Refresh and try again.", variant: "destructive" });
    } finally {
      setDecisionBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" data-testid="contract-work-orders-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Contract work orders</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review outside orders before they become regular BuildPro jobs.</p>
        </div>
        <button type="button" className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted/50" onClick={() => setExpanded(value => !value)}>
          {expanded ? "Hide work orders" : "Manage work orders"}
        </button>
      </div>
      {expanded && (
        <div className="mt-5 space-y-5">
          {!businessId && <p className="text-sm text-muted-foreground">Choose a business to manage its contract work.</p>}
          {businessId && (
            <>
              <form onSubmit={saveProgram} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_auto]">
                <select aria-label="Payer client" value={payerClientId} onChange={event => setPayerClientId(event.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="">Choose payer</option>
                  {(optionsQuery.data?.payerClients ?? []).map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
                <input aria-label="Program name" value={programName} onChange={event => setProgramName(event.target.value)} placeholder="Program name" maxLength={160} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm" />
                <button disabled={createProgram.isPending || !payerClientId || !programName.trim()} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add program</button>
              </form>

              <form onSubmit={saveOrder} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
                <select aria-label="Contract program" required value={programId} onChange={event => setProgramId(event.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="">Choose program</option>
                  {(programsQuery.data ?? []).filter(program => program.active).map(program => <option key={program.id} value={program.id}>{program.name} · payer: {program.payerName}</option>)}
                </select>
                <input aria-label="External work-order number" required value={externalOrderNumber} onChange={event => setExternalOrderNumber(event.target.value)} placeholder="External work-order number" maxLength={160} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm" />
                <input aria-label="Work-order title" required value={title} onChange={event => setTitle(event.target.value)} placeholder="Installation title" maxLength={240} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm" />
                <select aria-label="Property" value={propertyId} onChange={event => setPropertyId(event.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="">Property not linked yet</option>
                  {(optionsQuery.data?.properties ?? []).map(property => <option key={property.id} value={property.id}>{property.label}{property.address ? ` · ${property.address}` : ""}</option>)}
                </select>
                <select aria-label="Homeowner contact" value={homeownerContactId} onChange={event => setHomeownerContactId(event.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="">Homeowner contact not linked yet</option>
                  {(optionsQuery.data?.contacts ?? []).map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
                </select>
                <input aria-label="Agreed work-order price" type="number" min="0" step="0.01" value={agreedPrice} onChange={event => setAgreedPrice(event.target.value)} placeholder="Agreed price snapshot (optional)" className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm" />
                <textarea aria-label="Work scope" value={scope} onChange={event => setScope(event.target.value)} placeholder="Scope notes (optional)" className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2" />
                <button disabled={createOrder.isPending || !programId || !externalOrderNumber.trim() || !title.trim()} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2 sm:justify-self-end">Record work order</button>
              </form>

              {(ordersQuery.data ?? []).length === 0 && !ordersQuery.isLoading && <p className="text-sm text-muted-foreground">No contract work orders yet.</p>}
              <div className="space-y-3">
                {(ordersQuery.data ?? []).map(order => (
                  <article key={order.id} className="rounded-xl border border-border p-3" data-testid={`contract-work-order-${order.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-foreground">{order.title}</h3>
                        <p className="text-sm text-muted-foreground">Payer: {order.payerName} · External order: {order.externalOrderNumber}</p>
                        <p className="text-sm text-muted-foreground">Homeowner: {order.homeownerName ?? "Not linked"} · Property: {order.propertyLabel ?? "Not linked"}</p>
                        {order.propertyAddress && <p className="text-xs text-muted-foreground">{order.propertyAddress}</p>}
                        {order.jobId && <p className="mt-1 text-xs font-medium text-foreground">BuildPro job #{order.jobId}</p>}
                      </div>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{order.status.replaceAll("_", " ")}</span>
                    </div>
                    {order.scope && <p className="mt-2 whitespace-pre-wrap text-sm">{order.scope}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {order.status === "pending_review" && <>
                        <button disabled={decisionBusy === order.id} onClick={() => void decide(order, "accept")} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50">Accept and create job</button>
                        <button disabled={decisionBusy === order.id} onClick={() => void decide(order, "decline")} className="min-h-10 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50">Decline</button>
                      </>}
                      {order.status === "accepted" && <button disabled={decisionBusy === order.id} onClick={() => void decide(order, "cancel")} className="min-h-10 rounded-lg border border-destructive/40 px-3 text-sm font-semibold text-destructive disabled:opacity-50">Record cancellation</button>}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
