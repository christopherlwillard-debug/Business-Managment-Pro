import { useEffect, useMemo, useState } from "react";
import { useListProspects, useCreateProspect } from "@workspace/api-client-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import {
  calculateAerialQuoteService,
  createAerialQuoteEstimate,
  createAerialQuotePricingProfileVersion,
  createAerialQuoteProperty,
  createPropertyMeasurementRevision,
  listAerialQuotePricingProfiles,
  listAerialQuoteProperties,
  listEstimates,
  listClients,
  listPropertyBusinessAccess,
  grantPropertyBusinessAccess,
  revokePropertyBusinessAccess,
  listPropertyMeasurementRevisions,
  updateAerialQuoteProperty,
} from "@workspace/api-client-react";

const services = [
  ["lawn_mowing", "Lawn Mowing"],
  ["landscaping", "Landscaping"],
  ["parking_lot_cleaning", "Parking Lot Cleaning"],
  ["snow_removal", "Snow Removal"],
  ["asphalt_sealing", "Asphalt Sealing"],
  ["property_maintenance", "Property Maintenance"],
] as const;

type Entry = {
  label: string;
  category: string;
  kind: "area" | "length" | "count";
  quantity: number;
  unit: "sq_ft" | "acre" | "sq_yd" | "ft" | "yd" | "mile" | "item" | "hour";
  notes?: string | null;
};
type DraftComponent = {
  label: string;
  category: string;
  basis: "customer_rate" | "direct_cost";
  chargeType: "per_unit" | "fixed";
  amount: number;
  measurementCategory?: string;
  kind?: Entry["kind"];
  unit?: Entry["unit"];
};

const emptyEntry = (): Entry => ({
  label: "",
  category: "",
  kind: "area",
  quantity: 0,
  unit: "sq_ft",
});

export default function AerialQuoteManual() {
  const { activeBusiness, businesses } = useBusiness();
  const prospectsQuery = useListProspects();
  const createProspectMutation = useCreateProspect();
  const business = activeBusiness ?? businesses.find(item => item.slug === "general_contracting") ?? null;
  const businessId = business?.id;
  const { toast } = useToast();
  const [properties, setProperties] = useState<any[]>([]);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [accessGrants, setAccessGrants] = useState<any[]>([]);
  const [shareBusinessId, setShareBusinessId] = useState("");
  const [sharePermission, setSharePermission] = useState<"view" | "measure" | "estimate" | "manage">("estimate");
  const [propertyId, setPropertyId] = useState<number | null>(() => {
    const value = Number(new URLSearchParams(window.location.search).get("propertyId"));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  });
  const [prospectId, setProspectId] = useState<number | null>(() => {
    const value = Number(new URLSearchParams(window.location.search).get("prospectId"));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  });
  const [newProspect, setNewProspect] = useState(false);
  const [prospectContact, setProspectContact] = useState(() => ({
    name: new URLSearchParams(window.location.search).get("name") ?? "",
    phone: "",
    email: "",
  }));
  const [revisionId, setRevisionId] = useState<number | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profileComponents, setProfileComponents] = useState<DraftComponent[]>([]);
  const [calculation, setCalculation] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [propertyForm, setPropertyForm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      label: params.get("address") ?? "",
      street: params.get("address") ?? "",
      city: params.get("city") ?? "",
      state: params.get("state") ?? "",
      zip: params.get("zip") ?? "",
      clientId: "",
      notes: "",
    };
  });
  const [isEditingProperty, setIsEditingProperty] = useState(false);
  const [showPropertyForm, setShowPropertyForm] = useState(true);
  const [measurementSource, setMeasurementSource] = useState<"manual" | "on_site">("manual");
  const [entries, setEntries] = useState<Entry[]>([emptyEntry()]);
  const [measurementNotes, setMeasurementNotes] = useState("");
  const [measurementDirty, setMeasurementDirty] = useState(true);

  const [serviceKey, setServiceKey] = useState<(typeof services)[number][0]>("lawn_mowing");
  const [profileName, setProfileName] = useState("Lawn Mowing");
  const [componentLabel, setComponentLabel] = useState("");
  const [componentCategory, setComponentCategory] = useState("");
  const [componentBasis, setComponentBasis] = useState<"customer_rate" | "direct_cost">("customer_rate");
  const [chargeType, setChargeType] = useState<"per_unit" | "fixed">("per_unit");
  const [measurementKind, setMeasurementKind] = useState<"area" | "length" | "count">("area");
  const [measurementCategory, setMeasurementCategory] = useState("");
  const [unit, setUnit] = useState<Entry["unit"]>("sq_ft");
  const [rate, setRate] = useState("");
  const [minimumCharge, setMinimumCharge] = useState("");
  const [marginMode, setMarginMode] = useState<"none" | "markup" | "target_margin">("none");
  const [marginPercent, setMarginPercent] = useState("");
  const [quantityRounding, setQuantityRounding] = useState<"none" | "up" | "nearest" | "down">("none");
  const [roundingIncrement, setRoundingIncrement] = useState("1");
  const [estimateTitle, setEstimateTitle] = useState("");

  const selectedProperty = properties.find(item => item.id === propertyId);
  const propertyEstimates = estimates.filter(estimate =>
    (propertyId != null && estimate.propertyId === propertyId)
    || (prospectId != null && estimate.prospectId === prospectId),
  );
  const selectedProfile = profiles.find(item => item.id === profileId);
  const activeServiceProfiles = useMemo(
    () => profiles.filter(item => item.serviceKey === serviceKey),
    [profiles, serviceKey],
  );
  const prospectRows = prospectsQuery.data ?? [];

  function updateEntry(index: number, patch: Partial<Entry>) {
    setEntries(current => current.map((row, i) => i === index ? { ...row, ...patch } : row));
    setMeasurementDirty(true);
    setCalculation(null);
  }

  async function refreshBase() {
    if (!businessId) return;
    const [propertyRows, profileRows, clientRows, estimateRows] = await Promise.all([
      listAerialQuoteProperties({ businessId, ...(prospectId ? { prospectId } : {}) }),
      listAerialQuotePricingProfiles({ businessId }),
      listClients({ businessId }),
      listEstimates({ businessId }),
    ]);
    setProperties(propertyRows);
    setProfiles(profileRows);
    setClients(clientRows);
    setEstimates(estimateRows);
  }

  async function refreshRevisions(id: number) {
    const rows = await listPropertyMeasurementRevisions(id, { businessId: businessId! });
    setRevisions(rows);
  }

  async function refreshAccess(id: number) {
    if (!businessId) return;
    setAccessGrants(await listPropertyBusinessAccess(id, { businessId }));
  }

  useEffect(() => {
    void refreshBase().catch(err => setError(err instanceof Error ? err.message : "Could not load aerial quote data."));
  }, [businessId, prospectId]);

  useEffect(() => {
    if (!propertyId) {
      setRevisions([]);
      setAccessGrants([]);
      setRevisionId(null);
      return;
    }
    void refreshRevisions(propertyId).catch(err => setError(err instanceof Error ? err.message : "Could not load measurements."));
    void refreshAccess(propertyId).catch(() => setAccessGrants([]));
  }, [propertyId]);

  useEffect(() => {
    setProfileId(null);
    setProfileComponents([]);
    setCalculation(null);
  }, [serviceKey]);

  function notifyError(err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed.";
    setError(message);
    toast({ title: "Aerial Quote could not be saved", description: message, variant: "destructive" });
  }

  async function saveProperty() {
    if (!businessId || !propertyForm.label.trim()) return;
    if (newProspect && !prospectContact.name.trim() && !prospectContact.phone.trim() && !prospectContact.email.trim()) {
      setError("Add a prospect name, phone, or email before saving.");
      return;
    }
    setBusy(true); setError("");
    try {
      let linkedProspectId = prospectId;
      if (newProspect) {
        const createdProspect = await createProspectMutation.mutateAsync({
          address: [propertyForm.street, propertyForm.city, propertyForm.state, propertyForm.zip].filter(Boolean).join(", "),
          city: propertyForm.city || null,
          state: propertyForm.state || null,
          zip: propertyForm.zip || null,
          contactName: prospectContact.name.trim() || null,
          contactPhone: prospectContact.phone.trim() || null,
          contactEmail: prospectContact.email.trim() || null,
          status: "needs_measurements",
          businessLine: business?.slug ?? null,
        });
        linkedProspectId = createdProspect.id;
        setProspectId(createdProspect.id);
        setNewProspect(false);
      }
      const linkedProspect = prospectRows.find(item => item.id === linkedProspectId);
      const payload = {
        ...propertyForm,
        businessId,
        clientId: propertyForm.clientId ? Number(propertyForm.clientId) : linkedProspect?.clientId ?? null,
        prospectId: linkedProspectId,
      };
      if (isEditingProperty && propertyId) {
        await updateAerialQuoteProperty(propertyId, payload);
        await refreshBase();
        setIsEditingProperty(false);
        setShowPropertyForm(false);
        setPropertyForm({ label: "", street: "", city: "", state: "", zip: "", clientId: "", notes: "" });
        toast({ title: "Property updated" });
      } else {
        const created = await createAerialQuoteProperty(payload);
        await refreshBase();
        setPropertyId(created.id);
        setShowPropertyForm(false);
        setPropertyForm({ label: "", street: "", city: "", state: "", zip: "", clientId: "", notes: "" });
        toast({ title: "Property saved" });
      }
    } catch (err) { notifyError(err); } finally { setBusy(false); }
  }

  function beginEditProperty() {
    if (!selectedProperty) return;
    setPropertyForm({
      label: selectedProperty.label ?? "",
      street: selectedProperty.street ?? "",
      city: selectedProperty.city ?? "",
      state: selectedProperty.state ?? "",
      zip: selectedProperty.zip ?? "",
      clientId: selectedProperty.clientId == null ? "" : String(selectedProperty.clientId),
      notes: selectedProperty.notes ?? "",
    });
    setIsEditingProperty(true);
    setShowPropertyForm(true);
    setError("");
  }

  function cancelEditProperty() {
    setIsEditingProperty(false);
    setShowPropertyForm(false);
    setPropertyForm({ label: "", street: "", city: "", state: "", zip: "", clientId: "", notes: "" });
  }

  async function saveMeasurements() {
    if (!propertyId || !entries.length) return;
    if (entries.some(entry => !entry.label.trim() || !entry.category.trim() || !Number.isFinite(entry.quantity) || entry.quantity < 0)) {
      setError("Give each measurement a name, category, and valid non-negative quantity.");
      return;
    }
    setBusy(true); setError("");
    try {
      const created = await createPropertyMeasurementRevision(propertyId, {
        businessId: businessId!,
        source: measurementSource,
        entries,
        notes: measurementNotes || null,
      });
      await refreshRevisions(propertyId);
      setRevisionId(created.id);
      setCalculation(null);
      setMeasurementDirty(false);
      toast({ title: `Measurement revision ${created.revision} saved` });
    } catch (err) { notifyError(err); } finally { setBusy(false); }
  }

  async function shareProperty() {
    if (!propertyId || !businessId || !shareBusinessId) return;
    setBusy(true); setError("");
    try {
      await grantPropertyBusinessAccess(propertyId, {
        businessId,
        targetBusinessId: Number(shareBusinessId),
        permission: sharePermission,
      }, { businessId });
      await refreshAccess(propertyId);
      toast({ title: "Property access updated" });
    } catch (err) { notifyError(err); } finally { setBusy(false); }
  }

  async function revokePropertyShare(targetBusinessId: number) {
    if (!propertyId || !businessId) return;
    setBusy(true); setError("");
    try {
      await revokePropertyBusinessAccess(propertyId, targetBusinessId, { businessId });
      await refreshAccess(propertyId);
      toast({ title: "Property access revoked" });
    } catch (err) { notifyError(err); } finally { setBusy(false); }
  }

  async function saveProfile() {
    const hasCurrentComponent = Boolean(rate && componentLabel.trim() && componentCategory.trim());
    if (!businessId || (!hasCurrentComponent && profileComponents.length === 0)) {
      setError("Add at least one complete pricing component before saving the profile.");
      return;
    }
    const currentComponent: DraftComponent | null = hasCurrentComponent ? {
        label: componentLabel.trim(),
        category: componentCategory.trim(),
        basis: componentBasis,
        chargeType,
        amount: Number(rate),
        ...(chargeType === "per_unit" ? {
          measurementCategory: measurementCategory.trim(),
          kind: measurementKind,
          unit,
        } : {}),
      } : null;
    const components = [...profileComponents, ...(currentComponent ? [currentComponent] : [])];
    const rules = {
      components,
      marginMode,
      marginPercent: Number(marginPercent || 0),
      minimumCharge: Number(minimumCharge || 0),
      quantityRounding: { mode: quantityRounding, increment: Number(roundingIncrement || 1) },
    };
    setBusy(true); setError("");
    try {
      const created = await createAerialQuotePricingProfileVersion({
        businessId,
        serviceKey,
        displayName: profileName.trim(),
        rules,
      });
      await refreshBase();
      setProfileId(created.id);
      setRate("");
      setProfileComponents([]);
      setComponentLabel("");
      setComponentCategory("");
      setCalculation(null);
      toast({ title: `${created.displayName} profile v${created.version} saved` });
    } catch (err) { notifyError(err); } finally { setBusy(false); }
  }

  async function calculate() {
    if (!businessId || !propertyId || !revisionId || !selectedProfile || measurementDirty) return;
    setBusy(true); setError("");
    setCalculation(null);
    try {
      const result = await calculateAerialQuoteService({
        businessId,
        propertyId,
        measurementRevisionId: revisionId,
        serviceKey: selectedProfile.serviceKey,
        profileVersion: selectedProfile.version,
      });
      setCalculation(result);
      setEstimateTitle(`${selectedProfile.displayName} — ${selectedProperty?.label ?? "Property"}`);
    } catch (err) { notifyError(err); } finally { setBusy(false); }
  }

  async function createEstimate() {
    if (!businessId || !propertyId || !revisionId || !selectedProfile || !calculation || measurementDirty) return;
    setBusy(true); setError("");
    try {
      const estimate = await createAerialQuoteEstimate({
        businessId,
        propertyId,
        measurementRevisionId: revisionId,
        serviceKey: selectedProfile.serviceKey,
        profileVersion: selectedProfile.version,
        title: estimateTitle.trim(),
        clientId: selectedProperty?.clientId ?? null,
        prospectId: prospectId ?? undefined,
      });
      toast({ title: "Draft estimate created", description: `Estimate #${estimate.id} is available in Estimates.` });
      setCalculation(null);
      await refreshBase();
    } catch (err) { notifyError(err); } finally { setBusy(false); }
  }

  if (!businessId) return <main className="mx-auto max-w-5xl p-6"><h1 className="text-2xl font-semibold">Aerial Quote</h1><p className="mt-3 text-muted-foreground">Choose a business to manage properties and service profiles.</p></main>;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-primary">Manual-first estimating</p><h1 className="text-3xl font-bold tracking-tight">Aerial Quote</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Save property measurements and build service estimates. Measurements are manual or on-site; map-based measurement is unavailable until its access and licensing gates are cleared.</p></div>
        <span className="rounded-full border px-3 py-1 text-sm">{business.name}</span>
      </header>

      {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold">1. Property</h2>
          <label className="mt-4 block text-sm font-medium">Quote for prospect</label>
          <div className="mt-1 flex flex-wrap gap-2">
            <select className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3" value={prospectId ?? ""} onChange={e => {
              const nextId = e.target.value ? Number(e.target.value) : null;
              if (nextId !== prospectId && measurementDirty && !window.confirm("Discard unsaved measurement changes before switching prospects?")) return;
              setProspectId(nextId);
              setPropertyId(null);
              setRevisionId(null);
              setEntries([emptyEntry()]);
              setMeasurementDirty(false);
              setCalculation(null);
              setNewProspect(false);
              setShowPropertyForm(true);
            }}>
              <option value="">No prospect selected</option>
              {prospectRows.map(prospect => <option key={prospect.id} value={prospect.id}>{prospect.contactName || prospect.companyName || prospect.address}</option>)}
            </select>
            <button type="button" className="min-h-11 rounded-md border px-3 text-sm font-medium" onClick={() => {
              if (measurementDirty && !window.confirm("Discard unsaved measurement changes before starting a new prospect?")) return;
              setNewProspect(true);
              setProspectId(null);
              setPropertyId(null);
              setRevisionId(null);
              setEntries([emptyEntry()]);
              setMeasurementDirty(false);
              setCalculation(null);
              setShowPropertyForm(true);
              setPropertyForm({ label: "", street: "", city: "", state: "", zip: "", clientId: "", notes: "" });
            }}>New prospect</button>
          </div>
          {newProspect && (
            <div className="mt-3 grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
              <p className="text-sm font-medium sm:col-span-2">New lead contact details</p>
              <label className="text-sm">Contact name<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={prospectContact.name} onChange={e => setProspectContact({ ...prospectContact, name: e.target.value })} /></label>
              <label className="text-sm">Phone<input type="tel" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={prospectContact.phone} onChange={e => setProspectContact({ ...prospectContact, phone: e.target.value })} /></label>
              <label className="text-sm sm:col-span-2">Email<input type="email" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={prospectContact.email} onChange={e => setProspectContact({ ...prospectContact, email: e.target.value })} /></label>
            </div>
          )}
          <label className="mt-4 block text-sm font-medium">Saved property</label>
          <select className="mt-1 h-11 w-full rounded-md border bg-background px-3" value={propertyId ?? ""} onChange={e => {
            const nextId = e.target.value ? Number(e.target.value) : null;
            const nextProperty = properties.find(item => item.id === nextId);
            setPropertyId(nextId);
            setProspectId(nextProperty?.prospectId ?? null);
            setRevisionId(null);
            setMeasurementDirty(true);
            setCalculation(null);
            setShowPropertyForm(!nextId);
            if (isEditingProperty) cancelEditProperty();
          }}>
            <option value="">Choose a property</option>{properties.map(property => <option key={property.id} value={property.id}>{property.label} — {[property.city, property.state].filter(Boolean).join(", ")}</option>)}
          </select>
          {selectedProperty && !isEditingProperty && !showPropertyForm && (
            <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="font-semibold">{selectedProperty.label}</p>
              <p className="mt-1 text-muted-foreground">{[selectedProperty.street, selectedProperty.city, selectedProperty.state, selectedProperty.zip].filter(Boolean).join(", ") || "No address entered"}</p>
              {selectedProperty.prospectId && <p className="mt-1 text-muted-foreground">Prospect: {prospectRows.find(item => item.id === selectedProperty.prospectId)?.contactName ?? "Linked prospect"}</p>}
              <button type="button" className="mt-2 min-h-9 rounded-md border px-3 text-sm" onClick={() => { setShowPropertyForm(true); setPropertyForm({ label: selectedProperty.label ?? "", street: selectedProperty.street ?? "", city: selectedProperty.city ?? "", state: selectedProperty.state ?? "", zip: selectedProperty.zip ?? "", clientId: selectedProperty.clientId ? String(selectedProperty.clientId) : "", notes: selectedProperty.notes ?? "" }); setIsEditingProperty(true); }}>Edit selected property</button>
              <button type="button" className="ml-2 mt-2 min-h-9 rounded-md border px-3 text-sm" onClick={() => { setPropertyId(null); setRevisionId(null); setCalculation(null); setShowPropertyForm(true); setIsEditingProperty(false); setPropertyForm({ label: "", street: "", city: "", state: "", zip: "", clientId: "", notes: "" }); }}>Add another property</button>
            </div>
          )}
          {selectedProperty?.businessId === businessId && <details className="mt-3 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Property access and sharing</summary>
            <div className="mt-2">
            <div className="mt-2 flex flex-wrap gap-2">
              <select aria-label="Division to share with" className="h-10 rounded-md border bg-background px-3" value={shareBusinessId} onChange={e=>setShareBusinessId(e.target.value)}><option value="">Choose division</option>{businesses.filter(item=>item.isActive && item.id!==businessId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select aria-label="Access permission" className="h-10 rounded-md border bg-background px-3" value={sharePermission} onChange={e=>setSharePermission(e.target.value as typeof sharePermission)}><option value="view">View</option><option value="measure">Measure</option><option value="estimate">Estimate</option><option value="manage">Manage</option></select>
              <button type="button" disabled={busy||!shareBusinessId} onClick={()=>void shareProperty()} className="min-h-10 rounded-md border px-3 disabled:opacity-50">Share property</button>
            </div>
            {accessGrants.filter(grant=>grant.businessId!==businessId).map(grant=><div key={grant.id} className="mt-2 flex items-center justify-between gap-2 text-sm"><span>{grant.businessSlug} · {grant.permission}</span><button type="button" onClick={()=>void revokePropertyShare(grant.businessId)} className="text-destructive underline">Revoke</button></div>)}
            <p className="mt-2 text-xs text-muted-foreground">Sharing is limited to divisions under the same legal business.</p>
            </div>
          </details>}
          {showPropertyForm && <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Property name<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={propertyForm.label} onChange={e => setPropertyForm({...propertyForm,label:e.target.value})} /></label>
            <label className="text-sm font-medium sm:col-span-2">Street address<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={propertyForm.street} onChange={e => setPropertyForm({...propertyForm,street:e.target.value})} /></label>
            <label className="text-sm font-medium">City<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={propertyForm.city} onChange={e => setPropertyForm({...propertyForm,city:e.target.value})} /></label>
            <label className="text-sm font-medium">State<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={propertyForm.state} onChange={e => setPropertyForm({...propertyForm,state:e.target.value})} /></label>
            <label className="text-sm font-medium">ZIP<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={propertyForm.zip} onChange={e => setPropertyForm({...propertyForm,zip:e.target.value})} /></label>
            <label className="text-sm font-medium">Customer (optional)<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={propertyForm.clientId} onChange={e => setPropertyForm({...propertyForm,clientId:e.target.value})}><option value="">No customer linked</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
            <label className="text-sm font-medium sm:col-span-2">Property notes<textarea className="mt-1 min-h-20 w-full rounded-md border bg-background p-3" value={propertyForm.notes} onChange={e => setPropertyForm({...propertyForm,notes:e.target.value})}/></label>
          </div>}
          {showPropertyForm && <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !propertyForm.label.trim() || (newProspect && !prospectContact.name.trim() && !prospectContact.phone.trim() && !prospectContact.email.trim())} onClick={() => void saveProperty()} className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">
              {busy ? "Saving…" : isEditingProperty ? "Save property changes" : "Save property"}
            </button>
            {isEditingProperty && <button type="button" disabled={busy} onClick={cancelEditProperty} className="min-h-11 rounded-md border px-4 font-medium disabled:opacity-50">Cancel edit</button>}
          </div>}
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold">2. Manual measurements</h2>
          <p className="mt-1 text-sm text-muted-foreground">Saved revisions are permanent. Save edits as a new revision before calculating.</p>
          <label className="mt-4 block text-sm font-medium">Measurement source</label>
          <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={measurementSource} onChange={e => { setMeasurementSource(e.target.value as typeof measurementSource); setMeasurementDirty(true); setCalculation(null); }}><option value="manual">Manual</option><option value="on_site">On-site</option></select>
          {entries.map((entry,index)=><div key={index} className="mt-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
            <input aria-label="Measurement name" className="h-10 rounded-md border bg-background px-3" placeholder="Name, e.g. Front lawn" value={entry.label} onChange={e=>updateEntry(index,{label:e.target.value})}/>
            <input aria-label="Measurement category" className="h-10 rounded-md border bg-background px-3" placeholder="Category, e.g. mowable_area" value={entry.category} onChange={e=>updateEntry(index,{category:e.target.value})}/>
            <select aria-label="Measurement type" className="h-10 rounded-md border bg-background px-3" value={entry.kind} onChange={e=>updateEntry(index,{kind:e.target.value as Entry["kind"],unit:e.target.value==="area"?"sq_ft":e.target.value==="length"?"ft":"item"})}><option value="area">Area</option><option value="length">Length</option><option value="count">Count / time</option></select>
            <div className="flex gap-2"><input aria-label="Quantity" type="number" min="0" step="any" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3" value={entry.quantity} onChange={e=>updateEntry(index,{quantity:Number(e.target.value)})}/><select aria-label="Unit" className="h-10 rounded-md border bg-background px-2" value={entry.unit} onChange={e=>updateEntry(index,{unit:e.target.value as Entry["unit"]})}>{(["sq_ft","acre","sq_yd","ft","yd","mile","item","hour"] as const).map(value=><option key={value}>{value}</option>)}</select></div>
          </div>)}
          <button type="button" onClick={()=>{setEntries(current=>[...current,emptyEntry()]);setMeasurementDirty(true);setCalculation(null);}} className="mt-3 min-h-11 rounded-md border px-4 font-medium">Add measurement</button>
          <label className="mt-3 block text-sm font-medium">Notes<textarea className="mt-1 min-h-20 w-full rounded-md border bg-background p-3" value={measurementNotes} onChange={e=>{setMeasurementNotes(e.target.value);setMeasurementDirty(true);setCalculation(null);}}/></label>
          <label className="mt-3 block text-sm font-medium">Saved revision<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={revisionId ?? ""} onChange={e=>{const id=e.target.value?Number(e.target.value):null;setRevisionId(id);const revision=revisions.find(item=>item.id===id);if(revision){setEntries(revision.entries);setMeasurementSource(revision.source);setMeasurementNotes(revision.notes??"");setMeasurementDirty(false);}else{setMeasurementDirty(true);}setCalculation(null);}}><option value="">Choose a revision</option>{revisions.map(revision=><option key={revision.id} value={revision.id}>Revision {revision.revision} · {revision.source} · {new Date(revision.createdAt).toLocaleDateString()}</option>)}</select></label>
          {measurementDirty && <p role="status" className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Unsaved measurement changes. Save a new revision before calculating.</p>}
          <button type="button" disabled={busy || !propertyId || !measurementDirty} onClick={()=>void saveMeasurements()} className="mt-4 min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">Save new revision</button>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">3. Services & pricing</h2>
        <p className="mt-1 text-sm text-muted-foreground">Profiles are business-specific and versioned. Rates are not prefilled; an owner must enter approved values.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Service<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={serviceKey} onChange={e=>{const key=e.target.value as typeof serviceKey;setServiceKey(key);setProfileName(services.find(s=>s[0]===key)?.[1]??"Service");}}>{services.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
          <label className="text-sm font-medium">Saved profile<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={profileId??""} onChange={e=>{setProfileId(e.target.value?Number(e.target.value):null);setCalculation(null);}}><option value="">Choose profile version</option>{activeServiceProfiles.map(profile=><option key={profile.id} value={profile.id}>{profile.displayName} · v{profile.version}</option>)}</select></label>
        </div>
        <details className="mt-4 rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">Manage service pricing profiles</summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium">Profile name<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={profileName} onChange={e=>setProfileName(e.target.value)}/></label>
          <label className="text-sm font-medium">Component name<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={componentLabel} onChange={e=>setComponentLabel(e.target.value)} placeholder="e.g. Mowing"/></label>
          <label className="text-sm font-medium">Component category<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={componentCategory} onChange={e=>setComponentCategory(e.target.value)} placeholder="e.g. Service"/></label>
          <label className="text-sm font-medium">Rate basis<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={componentBasis} onChange={e=>setComponentBasis(e.target.value as typeof componentBasis)}><option value="customer_rate">Customer rate</option><option value="direct_cost">Direct cost</option></select></label>
          <label className="text-sm font-medium">Charge type<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={chargeType} onChange={e=>setChargeType(e.target.value as typeof chargeType)}><option value="per_unit">Per unit</option><option value="fixed">Fixed</option></select></label>
          <label className="text-sm font-medium">Rate<input type="number" min="0" step="0.01" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={rate} onChange={e=>setRate(e.target.value)} placeholder="Enter approved rate"/></label>
          {chargeType==="per_unit"&&<><label className="text-sm font-medium">Measurement category<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={measurementCategory} onChange={e=>setMeasurementCategory(e.target.value)} placeholder="Must match entry category"/></label><label className="text-sm font-medium">Measurement type<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={measurementKind} onChange={e=>setMeasurementKind(e.target.value as typeof measurementKind)}><option value="area">Area</option><option value="length">Length</option><option value="count">Count / time</option></select></label><label className="text-sm font-medium">Unit<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={unit} onChange={e=>setUnit(e.target.value as Entry["unit"])}>{(["sq_ft","acre","sq_yd","ft","yd","mile","item","hour"] as const).map(value=><option key={value}>{value}</option>)}</select></label></>}
          <label className="text-sm font-medium">Profit mode<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={marginMode} onChange={e=>setMarginMode(e.target.value as typeof marginMode)}><option value="none">None</option><option value="markup">Markup</option><option value="target_margin">Target margin</option></select></label>
          <label className="text-sm font-medium">Profit rate (%)<input type="number" min="0" max="99.99" step="0.01" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={marginPercent} onChange={e=>setMarginPercent(e.target.value)} placeholder="0"/></label>
          <label className="text-sm font-medium">Minimum service charge<input type="number" min="0" step="0.01" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={minimumCharge} onChange={e=>setMinimumCharge(e.target.value)} placeholder="0"/></label>
          <label className="text-sm font-medium">Quantity rounding<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={quantityRounding} onChange={e=>setQuantityRounding(e.target.value as typeof quantityRounding)}><option value="none">None</option><option value="up">Up</option><option value="nearest">Nearest</option><option value="down">Down</option></select></label>
          <label className="text-sm font-medium">Rounding increment<input type="number" min="0.000001" step="any" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={roundingIncrement} onChange={e=>setRoundingIncrement(e.target.value)}/></label>
        </div>
        {profileComponents.length > 0 && <div className="mt-4 rounded-lg border p-3"><p className="text-sm font-semibold">Profile components</p><ul className="mt-2 space-y-1 text-sm">{profileComponents.map((component,index)=><li key={index} className="flex flex-wrap justify-between gap-2"><span>{component.label} · {component.basis} · {component.chargeType}</span><span>{component.amount} {component.unit??"fixed"} <button type="button" className="ml-2 text-destructive underline" onClick={()=>setProfileComponents(profileComponents.filter((_,i)=>i!==index))}>Remove</button></span></li>)}</ul></div>}
        <button type="button" disabled={!componentLabel.trim()||!componentCategory.trim()||!rate} onClick={()=>{setProfileComponents([...profileComponents,{label:componentLabel.trim(),category:componentCategory.trim(),basis:componentBasis,chargeType,amount:Number(rate),...(chargeType==="per_unit"?{measurementCategory:measurementCategory.trim(),kind:measurementKind,unit}:{})}]);setComponentLabel("");setComponentCategory("");setRate("");}} className="mt-3 min-h-11 rounded-md border px-4 font-medium disabled:opacity-50">Add another component</button>
        <button type="button" disabled={busy||!businessId||(!profileComponents.length&&(!componentLabel.trim()||!componentCategory.trim()||!rate))} onClick={()=>void saveProfile()} className="mt-4 min-h-11 rounded-md border border-primary px-4 font-medium text-primary disabled:opacity-50">Save as new profile version</button>
        </details>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">4. Calculate and create estimate</h2>
        {propertyEstimates.length > 0 && <div className="mt-3 rounded-lg border p-3">
          <p className="text-sm font-semibold">Quotation history for this property</p>
          <div className="mt-2 divide-y">{propertyEstimates.map(estimate => <div key={estimate.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div><p className="font-medium">{estimate.title}</p><p className="text-xs text-muted-foreground">{estimate.status} · {new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(estimate.total)}</p></div>
            <a className="font-medium text-primary underline" href={`/estimates?open=${estimate.id}`}>Open in Quote Center</a>
          </div>)}</div>
        </div>}
        <label className="mt-3 block max-w-xl text-sm font-medium">Estimate title<input className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={estimateTitle} onChange={e=>setEstimateTitle(e.target.value)}/></label>
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy||!selectedProperty||!revisionId||!selectedProfile||measurementDirty} onClick={()=>void calculate()} className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">{busy?"Working…":"Calculate estimate"}</button>{calculation&&!measurementDirty&&<button type="button" disabled={busy||!estimateTitle.trim()} onClick={()=>void createEstimate()} className="min-h-11 rounded-md border px-4 font-medium disabled:opacity-50">Create draft estimate</button>}</div>
        {calculation&&!measurementDirty&&<div className="mt-5 overflow-hidden rounded-lg border"><div className="divide-y">{calculation.lineItems.map((line:any,index:number)=><div key={index} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><span>{line.description} <span className="text-muted-foreground">({line.quantity} {line.unit})</span></span><strong>{new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(line.total)}</strong></div>)}</div><div className="flex justify-between bg-muted/40 p-3 font-semibold"><span>Pre-tax total</span><span>{new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(calculation.subtotal)}</span></div></div>}
      </section>
    </main>
  );
}
