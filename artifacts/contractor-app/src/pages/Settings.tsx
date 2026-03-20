import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building2, Settings2, Receipt, Check, AlertCircle } from "lucide-react";

const FEATURE_OPTIONS = [
  { key: "jobs", label: "Jobs" },
  { key: "invoices", label: "Invoices" },
  { key: "expenses", label: "Expenses" },
  { key: "mileage", label: "Mileage Tracking" },
  { key: "estimates", label: "Estimates & Bidding" },
  { key: "subcontractors", label: "Subcontractors" },
  { key: "daily_logs", label: "Daily Logs" },
  { key: "compliance", label: "Compliance Agent" },
  { key: "clients", label: "Clients" },
];

function field(label: string, node: React.ReactNode, hint?: string) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {node}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();

  const [form, setForm] = useState({
    companyName: "",
    companyEmail: "",
    companyPhone: "",
    companyAddress: "",
    companyCity: "",
    companyState: "KY",
    companyZip: "",
    defaultTaxRate: "",
    invoicePrefix: "INV-2026-",
    defaultPaymentTerms: "Net 30",
    lateFeePercent: "",
    mileageRate: "0.725",
    thresholdAmount1099: "600",
  });
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (settings && !seeded) {
      const s = settings as any;
      setForm({
        companyName: s.companyName ?? "",
        companyEmail: s.companyEmail ?? "",
        companyPhone: s.companyPhone ?? "",
        companyAddress: s.companyAddress ?? "",
        companyCity: s.companyCity ?? "",
        companyState: s.companyState ?? "KY",
        companyZip: s.companyZip ?? "",
        defaultTaxRate: s.defaultTaxRate != null ? String(s.defaultTaxRate) : "",
        invoicePrefix: s.invoicePrefix ?? "INV-2026-",
        defaultPaymentTerms: s.defaultPaymentTerms ?? "Net 30",
        lateFeePercent: s.lateFeePercent != null ? String(s.lateFeePercent) : "",
        mileageRate: s.mileageRate != null ? String(s.mileageRate) : "0.725",
        thresholdAmount1099: s.thresholdAmount1099 != null ? String(s.thresholdAmount1099) : "600",
      });
      const feat: Record<string, boolean> = {};
      FEATURE_OPTIONS.forEach((f) => {
        feat[f.key] = Array.isArray(s.enabledFeatures)
          ? s.enabledFeatures.includes(f.key)
          : true;
      });
      setFeatures(feat);
      setSeeded(true);
    }
  }, [settings, seeded]);

  function setF(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function toggleFeature(key: string) {
    setFeatures((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    try {
      await updateMutation.mutateAsync({
        data: {
          companyName: form.companyName || undefined,
          companyEmail: form.companyEmail || undefined,
          companyPhone: form.companyPhone || undefined,
          companyAddress: form.companyAddress || undefined,
          companyCity: form.companyCity || undefined,
          companyState: form.companyState || undefined,
          companyZip: form.companyZip || undefined,
          defaultTaxRate: form.defaultTaxRate ? parseFloat(form.defaultTaxRate) : undefined,
          invoicePrefix: form.invoicePrefix || undefined,
          defaultPaymentTerms: form.defaultPaymentTerms || undefined,
          lateFeePercent: form.lateFeePercent ? parseFloat(form.lateFeePercent) : undefined,
          mileageRate: form.mileageRate ? parseFloat(form.mileageRate) : 0.725,
          thresholdAmount1099: form.thresholdAmount1099 ? parseFloat(form.thresholdAmount1099) : 600,
          enabledFeatures: FEATURE_OPTIONS.filter((f) => features[f.key]).map((f) => f.key),
        } as any,
      });
      queryClient.invalidateQueries();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Failed to save settings. Please try again.");
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 pb-12">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const inp = "w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary focus:ring-1 focus:ring-ring outline-none text-sm transition-colors";

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">App Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your business profile, rates, and enabled modules.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        <Card className="border-border/50 shadow-md bg-card">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="font-display flex items-center">
              <Building2 className="w-5 h-5 mr-2 text-primary" /> Business Profile
            </CardTitle>
            <CardDescription>Details appear on invoices, estimates, and reports.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field("Company Name",
              <input className={inp} value={form.companyName} onChange={(e) => setF("companyName", e.target.value)} placeholder="Your LLC Name" />
            )}
            {field("Email",
              <input className={inp} type="email" value={form.companyEmail} onChange={(e) => setF("companyEmail", e.target.value)} placeholder="contact@yourbusiness.com" />
            )}
            {field("Phone",
              <input className={inp} value={form.companyPhone} onChange={(e) => setF("companyPhone", e.target.value)} placeholder="(270) 555-0000" />
            )}
            {field("Street Address",
              <input className={inp} value={form.companyAddress} onChange={(e) => setF("companyAddress", e.target.value)} placeholder="123 Main St" />
            )}
            {field("City",
              <input className={inp} value={form.companyCity} onChange={(e) => setF("companyCity", e.target.value)} placeholder="Owensboro" />
            )}
            <div className="grid grid-cols-2 gap-3">
              {field("State",
                <input className={inp} value={form.companyState} onChange={(e) => setF("companyState", e.target.value)} placeholder="KY" />
              )}
              {field("ZIP",
                <input className={inp} value={form.companyZip} onChange={(e) => setF("companyZip", e.target.value)} placeholder="42301" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-md bg-card">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="font-display flex items-center">
              <Receipt className="w-5 h-5 mr-2 text-primary" /> Financial Defaults & Rates
            </CardTitle>
            <CardDescription>These defaults apply to new invoices and mileage logs.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {field("Default Tax Rate (%)",
              <input className={inp} type="number" step="0.01" min="0" max="100" value={form.defaultTaxRate} onChange={(e) => setF("defaultTaxRate", e.target.value)} placeholder="e.g. 6" />,
              "Used on new invoices"
            )}
            {field("Invoice Prefix",
              <input className={inp} value={form.invoicePrefix} onChange={(e) => setF("invoicePrefix", e.target.value)} />,
              "e.g. INV-2026-"
            )}
            {field("Payment Terms",
              <select className={inp} value={form.defaultPaymentTerms} onChange={(e) => setF("defaultPaymentTerms", e.target.value)}>
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 60</option>
                <option>Due on Receipt</option>
              </select>
            )}
            {field("Late Fee (%)",
              <input className={inp} type="number" step="0.1" min="0" value={form.lateFeePercent} onChange={(e) => setF("lateFeePercent", e.target.value)} placeholder="e.g. 1.5" />
            )}
            {field("IRS Mileage Rate ($/mile)",
              <input className={inp} type="number" step="0.001" min="0" value={form.mileageRate} onChange={(e) => setF("mileageRate", e.target.value)} />,
              "2026 IRS standard: $0.725/mile"
            )}
            {field("1099 Threshold ($)",
              <input className={inp} type="number" value={form.thresholdAmount1099} onChange={(e) => setF("thresholdAmount1099", e.target.value)} />,
              "IRS default: $600"
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-md bg-card">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="font-display flex items-center">
              <Settings2 className="w-5 h-5 mr-2 text-primary" /> Feature Modules
            </CardTitle>
            <CardDescription>Enable or disable modules — disabled ones are hidden from the sidebar.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURE_OPTIONS.map((feature) => (
              <button
                key={feature.key}
                type="button"
                onClick={() => toggleFeature(feature.key)}
                className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all text-left ${
                  features[feature.key]
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:border-muted-foreground/40"
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  features[feature.key] ? "border-primary bg-primary" : "border-muted-foreground/40"
                }`}>
                  {features[feature.key] && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
                </div>
                <span className={`ml-3 font-medium text-sm transition-colors ${features[feature.key] ? "text-foreground" : "text-muted-foreground"}`}>
                  {feature.label}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-4 pt-2 border-t border-border">
          {error && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertCircle className="w-4 h-4" /> {error}
            </span>
          )}
          {success && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <Check className="w-4 h-4" /> Settings saved!
            </span>
          )}
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="px-8 py-3 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
