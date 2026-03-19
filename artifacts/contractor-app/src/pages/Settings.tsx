import { useState } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Settings2, Receipt, Check } from "lucide-react";

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

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const enabledFeatures = FEATURE_OPTIONS
      .filter(f => formData.get(`feature_${f.key}`) === 'on')
      .map(f => f.key);

    try {
      await updateMutation.mutateAsync({
        data: {
          companyName: formData.get("companyName") as string,
          companyEmail: formData.get("companyEmail") as string,
          companyPhone: formData.get("companyPhone") as string,
          companyAddress: formData.get("companyAddress") as string,
          companyCity: formData.get("companyCity") as string,
          companyState: formData.get("companyState") as string,
          companyZip: formData.get("companyZip") as string,
          defaultTaxRate: parseFloat(formData.get("defaultTaxRate") as string) || null,
          invoicePrefix: formData.get("invoicePrefix") as string,
          defaultPaymentTerms: formData.get("defaultPaymentTerms") as string,
          lateFeePercent: parseFloat(formData.get("lateFeePercent") as string) || null,
          mileageRate: parseFloat(formData.get("mileageRate") as string) || 0.725,
          thresholdAmount1099: parseFloat(formData.get("thresholdAmount1099") as string) || 600,
          enabledFeatures
        }
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) return <div className="animate-pulse p-8 text-muted-foreground">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">App Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your business profile, rates, and enabled modules.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Business Profile */}
        <Card className="border-border/50 shadow-md bg-card">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="font-display flex items-center"><Building2 className="w-5 h-5 mr-2 text-primary" /> Business Profile</CardTitle>
            <CardDescription>Details appear on invoices, estimates, and reports.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Company Name</label>
              <input name="companyName" defaultValue={settings?.companyName || ''} placeholder="Your LLC Name" className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <input name="companyEmail" type="email" defaultValue={settings?.companyEmail || ''} placeholder="contact@yourbusiness.com" className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Phone</label>
              <input name="companyPhone" defaultValue={settings?.companyPhone || ''} placeholder="(270) 555-0000" className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Street Address</label>
              <input name="companyAddress" defaultValue={settings?.companyAddress || ''} placeholder="123 Main St" className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">City</label>
              <input name="companyCity" defaultValue={settings?.companyCity || ''} placeholder="Owensboro" className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">State</label>
                <input name="companyState" defaultValue={settings?.companyState || 'KY'} placeholder="KY" className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">ZIP</label>
                <input name="companyZip" defaultValue={settings?.companyZip || ''} placeholder="42301" className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial & Rates */}
        <Card className="border-border/50 shadow-md bg-card">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="font-display flex items-center"><Receipt className="w-5 h-5 mr-2 text-primary" /> Financial Defaults & Rates</CardTitle>
            <CardDescription>These defaults apply to new invoices and mileage logs.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Default Tax Rate (%)</label>
              <input name="defaultTaxRate" type="number" step="0.01" min="0" max="100" defaultValue={settings?.defaultTaxRate ?? ''} placeholder="e.g. 6 for KY sales tax" className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Invoice Prefix</label>
              <input name="invoicePrefix" defaultValue={settings?.invoicePrefix || 'INV-2026-'} className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Payment Terms</label>
              <select name="defaultPaymentTerms" defaultValue={settings?.defaultPaymentTerms || 'Net 30'} className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm">
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 60</option>
                <option>Due on Receipt</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Late Fee (%)</label>
              <input name="lateFeePercent" type="number" step="0.1" min="0" defaultValue={settings?.lateFeePercent ?? ''} placeholder="e.g. 1.5" className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">IRS Mileage Rate ($/mile)</label>
              <input name="mileageRate" type="number" step="0.001" min="0" defaultValue={settings?.mileageRate ?? 0.725} placeholder="0.725 (2026 IRS rate)" className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
              <p className="text-xs text-muted-foreground">2026 IRS standard: $0.725/mile</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">1099 Threshold ($)</label>
              <input name="thresholdAmount1099" type="number" defaultValue={settings?.thresholdAmount1099 ?? 600} className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:border-primary outline-none text-sm" />
              <p className="text-xs text-muted-foreground">IRS default: $600</p>
            </div>
          </CardContent>
        </Card>

        {/* Feature Toggles */}
        <Card className="border-border/50 shadow-md bg-card">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="font-display flex items-center"><Settings2 className="w-5 h-5 mr-2 text-primary" /> Feature Modules</CardTitle>
            <CardDescription>Enable or disable modules. Disabled modules are hidden from the sidebar navigation.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURE_OPTIONS.map(feature => {
              const isEnabled = settings?.enabledFeatures?.includes(feature.key) ?? true;
              return (
                <label key={feature.key} className="flex items-center p-4 border border-border rounded-xl hover:bg-muted/50 cursor-pointer transition-colors group">
                  <div className="relative flex items-center justify-center flex-shrink-0">
                    <input 
                      type="checkbox" 
                      name={`feature_${feature.key}`} 
                      defaultChecked={isEnabled}
                      className="peer appearance-none w-5 h-5 border-2 border-muted-foreground rounded checked:bg-primary checked:border-primary transition-all cursor-pointer"
                    />
                    <Check className="absolute w-3 h-3 text-primary-foreground pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                  </div>
                  <span className="ml-3 font-medium text-foreground group-hover:text-primary transition-colors text-sm">{feature.label}</span>
                </label>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-4 pt-4 border-t border-border">
          {success && (
            <span className="text-sm font-medium text-emerald-600 flex items-center gap-1">
              <Check className="w-4 h-4" /> Settings saved successfully
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
