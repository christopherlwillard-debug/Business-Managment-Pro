import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  calculateAerialQuoteService,
  createAerialQuoteEstimate,
  listAerialQuotePricingProfiles,
  listAerialQuoteProperties,
  listEstimates,
  listPropertyMeasurementRevisions,
  type AerialQuoteCalculationInput,
  type AerialQuoteEstimateInput,
  type Estimate,
  type Property,
  type PropertyMeasurementRevision,
  type ServicePricingProfile,
} from "@workspace/api-client-react";
import { Building2, ChevronDown, ChevronRight, FilePlus2, Ruler } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function propertyAddress(property: Property): string {
  return [property.street, property.city, property.state, property.zip].filter(Boolean).join(", ");
}

function revisionDate(revision: PropertyMeasurementRevision): string {
  const date = new Date(revision.createdAt);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ClientPropertiesTab({ businessId, clientId }: { businessId: number; clientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<number | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [estimateTitle, setEstimateTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [calculation, setCalculation] = useState<Awaited<ReturnType<typeof calculateAerialQuoteService>> | null>(null);
  const [actionError, setActionError] = useState("");

  const propertiesQuery = useQuery({
    queryKey: ["client-aerial-quote-properties", businessId, clientId],
    queryFn: () => listAerialQuoteProperties({ businessId, clientId }),
    enabled: businessId > 0 && clientId > 0,
  });
  const profilesQuery = useQuery({
    queryKey: ["client-aerial-quote-profiles", businessId],
    queryFn: () => listAerialQuotePricingProfiles({ businessId }),
    enabled: businessId > 0,
  });
  const revisionsQuery = useQuery({
    queryKey: ["client-property-measurement-revisions", businessId, selectedPropertyId],
    queryFn: () => listPropertyMeasurementRevisions(selectedPropertyId!, { businessId }),
    enabled: businessId > 0 && selectedPropertyId != null,
  });

  const properties = propertiesQuery.data ?? [];
  const profiles = profilesQuery.data ?? [];
  const selectedProperty = properties.find(property => property.id === selectedPropertyId);
  const selectedRevision = revisionsQuery.data?.find(revision => revision.id === selectedRevisionId);
  const selectedProfile = profiles.find(profile => profile.id === selectedProfileId);

  useEffect(() => {
    if (selectedPropertyId != null && !properties.some(property => property.id === selectedPropertyId)) {
      setSelectedPropertyId(null);
      setSelectedRevisionId(null);
      setCalculation(null);
    }
  }, [properties, selectedPropertyId]);

  useEffect(() => {
    const newest = revisionsQuery.data?.[0];
    setSelectedRevisionId(newest?.id ?? null);
    setCalculation(null);
  }, [selectedPropertyId, revisionsQuery.data]);

  useEffect(() => {
    if (!selectedProperty || !selectedProfile) return;
    setEstimateTitle(`${selectedProfile.displayName} — ${selectedProperty.label}`);
    setCalculation(null);
  }, [selectedPropertyId, selectedProfileId]);

  const calculateMutation = useMutation({
    mutationFn: (input: AerialQuoteCalculationInput) => calculateAerialQuoteService(input),
    onSuccess: result => {
      setCalculation(result);
      setActionError("");
    },
    onError: error => setActionError(errorMessage(error, "Could not calculate this estimate.")),
  });

  const createEstimateMutation = useMutation({
    mutationFn: (input: AerialQuoteEstimateInput) => createAerialQuoteEstimate(input),
    onSuccess: estimate => {
      setCalculation(null);
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["client-aerial-quote-estimates", businessId, clientId] });
      void queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Draft estimate created",
        description: `Estimate #${estimate.id} is available in Estimates.`,
      });
    },
    onError: error => setActionError(errorMessage(error, "Could not create the estimate.")),
  });

  const selectedCalculationInput = useMemo(() => {
    if (!selectedProperty || !selectedRevision || !selectedProfile) return null;
    return {
      businessId,
      propertyId: selectedProperty.id,
      measurementRevisionId: selectedRevision.id,
      serviceKey: selectedProfile.serviceKey,
      profileVersion: selectedProfile.version,
    };
  }, [businessId, selectedProperty, selectedRevision, selectedProfile]);

  function selectProperty(propertyId: number) {
    setSelectedPropertyId(current => current === propertyId ? null : propertyId);
    setSelectedRevisionId(null);
    setSelectedProfileId(null);
    setEstimateTitle("");
    setCalculation(null);
    setActionError("");
  }

  function calculateEstimate() {
    if (!selectedCalculationInput) return;
    setActionError("");
    calculateMutation.mutate(selectedCalculationInput);
  }

  function createEstimate() {
    if (!selectedCalculationInput || !calculation || !estimateTitle.trim()) return;
    setActionError("");
    createEstimateMutation.mutate({
      ...selectedCalculationInput,
      clientId,
      title: estimateTitle.trim(),
      notes: notes.trim() || null,
    });
  }

  if (propertiesQuery.isLoading) {
    return <div className="p-5 space-y-3" aria-label="Loading client properties">
      {[1, 2].map(item => <div key={item} className="h-16 rounded-xl bg-muted animate-pulse" />)}
    </div>;
  }

  if (propertiesQuery.isError) {
    return <div className="p-5">
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {errorMessage(propertiesQuery.error, "Client properties could not be loaded.")}
      </div>
      <button type="button" className="mt-3 rounded-lg border px-3 py-2 text-sm" onClick={() => void propertiesQuery.refetch()}>
        Try again
      </button>
    </div>;
  }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Properties &amp; Measurements</h3>
          <p className="mt-1 text-xs text-muted-foreground">Saved measurements can be reused for separate service estimates.</p>
        </div>
        <span className="text-xs text-muted-foreground">{properties.length} {properties.length === 1 ? "property" : "properties"}</span>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Building2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium">No properties linked to this client</p>
          <p className="mt-1 text-xs text-muted-foreground">Add and manage properties in Aerial Quote, then return here to view their measurements.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map(property => {
            const isSelected = property.id === selectedPropertyId;
            return (
              <section key={property.id} className="overflow-hidden rounded-xl border bg-card">
                <button
                  type="button"
                  disabled={calculateMutation.isPending || createEstimateMutation.isPending}
                  aria-expanded={isSelected}
                  onClick={() => selectProperty(property.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/40 disabled:cursor-wait"
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{property.label}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{propertyAddress(property) || "No address saved"}</span>
                    </span>
                  </span>
                  {isSelected ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                </button>

                {isSelected && (
                  <div className="border-t p-4 space-y-4">
                    {revisionsQuery.isLoading ? (
                      <div className="h-12 rounded-lg bg-muted animate-pulse" />
                    ) : revisionsQuery.isError ? (
                      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                        {errorMessage(revisionsQuery.error, "Measurements could not be loaded for this property.")}
                        <button type="button" className="ml-2 underline" onClick={() => void revisionsQuery.refetch()}>Retry</button>
                      </div>
                    ) : (revisionsQuery.data?.length ?? 0) === 0 ? (
                      <div className="rounded-lg border border-dashed p-5 text-center">
                        <Ruler className="mx-auto h-6 w-6 text-muted-foreground/50" />
                        <p className="mt-2 text-sm font-medium">No measurement revisions yet</p>
                        <p className="mt-1 text-xs text-muted-foreground">Measurements can be entered manually or on site in Aerial Quote. Map-based measurement remains unavailable until licensing is verified.</p>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved revisions</h4>
                          <span className="text-xs text-muted-foreground">{revisionsQuery.data?.length ?? 0} total</span>
                        </div>
                        <div className="space-y-2">
                          {(revisionsQuery.data ?? []).map(revision => {
                            const selected = revision.id === selectedRevisionId;
                            return (
                              <button
                                key={revision.id}
                                type="button"
                                disabled={calculateMutation.isPending || createEstimateMutation.isPending}
                                onClick={() => { setSelectedRevisionId(revision.id); setCalculation(null); setActionError(""); }}
                                className={cn(
                                  "w-full rounded-lg border p-3 text-left transition-colors",
                                  selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                                  "disabled:cursor-wait disabled:opacity-70",
                                )}
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium">Revision {revision.revision}</span>
                                  <span className="text-xs text-muted-foreground">{revision.source === "on_site" ? "On site" : "Manual"} · {revisionDate(revision)}</span>
                                </span>
                                <span className="mt-2 grid gap-1 sm:grid-cols-2">
                                  {revision.entries.map((entry, index) => (
                                    <span key={`${revision.id}-${index}`} className="text-xs text-muted-foreground">
                                      {entry.label}: {entry.quantity.toLocaleString()} {entry.unit.replaceAll("_", " ")}
                                    </span>
                                  ))}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(revisionsQuery.data?.length ?? 0) > 0 && (
                      <div className="rounded-xl bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <FilePlus2 className="h-4 w-4 text-primary" />
                          <h4 className="text-sm font-semibold">Create a separate estimate</h4>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-medium">
                            Service pricing profile
                            <select
                              value={selectedProfileId ?? ""}
                              disabled={calculateMutation.isPending || createEstimateMutation.isPending}
                              onChange={event => {
                                setSelectedProfileId(event.target.value ? Number(event.target.value) : null);
                                setCalculation(null);
                                setActionError("");
                              }}
                              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
                            >
                              <option value="">Choose a profile</option>
                              {profiles.map(profile => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.displayName} · {profile.serviceKey.replaceAll("_", " ")} · v{profile.version}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs font-medium">
                            Estimate title
                            <input
                              value={estimateTitle}
                              onChange={event => setEstimateTitle(event.target.value)}
                              maxLength={180}
                              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                              placeholder="Service estimate"
                            />
                          </label>
                        </div>
                        <label className="block text-xs font-medium">
                          Internal estimate notes <span className="font-normal text-muted-foreground">(optional)</span>
                          <textarea
                            value={notes}
                            onChange={event => setNotes(event.target.value)}
                            rows={2}
                            className="mt-1 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm"
                            placeholder="Notes for your team"
                          />
                        </label>

                        {profilesQuery.isError && (
                          <p role="alert" className="text-sm text-destructive">
                            {errorMessage(profilesQuery.error, "Pricing profiles could not be loaded.")}
                          </p>
                        )}
                        {profiles.length === 0 && !profilesQuery.isLoading && !profilesQuery.isError && (
                          <p className="text-sm text-muted-foreground">Create a service pricing profile in Aerial Quote before estimating from this property.</p>
                        )}
                        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}

                        {calculation && (
                          <div className="rounded-lg border bg-background p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">Calculated estimate</span>
                              <span className="text-base font-bold">{formatCurrency(calculation.subtotal)}</span>
                            </div>
                            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                              {calculation.lineItems.map((line, index) => (
                                <li key={`${line.description}-${index}`} className="flex justify-between gap-3">
                                  <span>{line.description} · {line.quantity.toLocaleString()} {line.unit ?? ""}</span>
                                  <span>{formatCurrency(line.total)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={!selectedCalculationInput || calculateMutation.isPending || createEstimateMutation.isPending}
                            onClick={calculateEstimate}
                            className="min-h-10 rounded-md border px-4 text-sm font-semibold disabled:opacity-50"
                          >
                            {calculateMutation.isPending ? "Calculating…" : "Calculate"}
                          </button>
                          {calculation && (
                            <button
                              type="button"
                              disabled={!estimateTitle.trim() || createEstimateMutation.isPending}
                              onClick={createEstimate}
                              className="min-h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                            >
                              {createEstimateMutation.isPending ? "Creating…" : "Create draft estimate"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ClientQuotesTab({ businessId, clientId }: { businessId: number; clientId: number }) {
  const estimatesQuery = useQuery({
    queryKey: ["client-aerial-quote-estimates", businessId, clientId],
    queryFn: () => listEstimates({ businessId }),
    enabled: businessId > 0 && clientId > 0,
  });
  const propertiesQuery = useQuery({
    queryKey: ["client-aerial-quote-properties", businessId, clientId],
    queryFn: () => listAerialQuoteProperties({ businessId, clientId }),
    enabled: businessId > 0 && clientId > 0,
  });

  const estimates = (estimatesQuery.data ?? []).filter(estimate => estimate.clientId === clientId);
  const propertiesById = useMemo(
    () => new Map((propertiesQuery.data ?? []).map(property => [property.id, property])),
    [propertiesQuery.data],
  );

  if (estimatesQuery.isLoading || propertiesQuery.isLoading) {
    return <div className="p-5 space-y-3" aria-label="Loading client estimates">
      {[1, 2, 3].map(item => <div key={item} className="h-14 rounded-xl bg-muted animate-pulse" />)}
    </div>;
  }
  if (estimatesQuery.isError || propertiesQuery.isError) {
    return <div className="p-5">
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {errorMessage(estimatesQuery.error ?? propertiesQuery.error, "Client estimates could not be loaded.")}
      </div>
    </div>;
  }
  if (!estimates.length) {
    return <div className="p-8 text-center">
      <FilePlus2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
      <p className="mt-2 text-sm font-medium">No estimates for this client</p>
      <p className="mt-1 text-xs text-muted-foreground">Create an estimate from a saved property measurement in Properties.</p>
    </div>;
  }

  return (
    <div className="p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Client estimates &amp; quotes</h3>
          <p className="mt-1 text-xs text-muted-foreground">Each estimate keeps its own quote revisions and approval history.</p>
        </div>
        <span className="text-xs text-muted-foreground">{estimates.length} total</span>
      </div>
      {estimates.map((estimate: Estimate) => {
        const property = estimate.propertyId ? propertiesById.get(estimate.propertyId) : undefined;
        return (
          <article key={estimate.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-semibold">{estimate.title}</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {property?.label ?? (estimate.propertyId ? `Property #${estimate.propertyId}` : "No property linked")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{formatCurrency(estimate.total)}</p>
                <span className="text-xs capitalize text-muted-foreground">{estimate.status.replaceAll("_", " ")}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Estimate #{estimate.id} · {new Date(estimate.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </article>
        );
      })}
    </div>
  );
}
