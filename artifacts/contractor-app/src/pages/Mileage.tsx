import { useState } from "react";
import { useListMileageLogs, useGetMileageSummary, useCreateMileageLog } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Navigation, Plus, MapPin, Calculator } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Mileage() {
  const { data: logs, isLoading, refetch } = useListMileageLogs();
  const { data: summary } = useGetMileageSummary();
  const createMutation = useCreateMileageLog();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createMutation.mutateAsync({
        data: {
          date: formData.get("date") as string,
          miles: parseFloat(formData.get("miles") as string),
          classification: formData.get("classification") as any,
          startLocation: formData.get("start") as string,
          endLocation: formData.get("end") as string,
          purpose: formData.get("purpose") as string,
        }
      });
      setIsDialogOpen(false);
      refetch();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Mileage Tracking</h1>
          <p className="text-muted-foreground mt-1">IRS compliant deduction calculator.</p>
        </div>
        <button 
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
        >
          <Plus className="w-5 h-5 mr-2" /> Log Trip
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-primary text-primary-foreground border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-primary-foreground/70 text-sm font-medium">Est. Tax Deduction (YTD)</p>
                <p className="text-4xl font-display font-bold mt-2">{formatCurrency(summary?.totalDeduction || 0)}</p>
              </div>
              <Calculator className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-xs text-primary-foreground/50 mt-4 text-right">Based on {summary?.ratePerMile || 0.67}¢/mile IRS rate</p>
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6">
            <p className="text-muted-foreground text-sm font-medium">Business Miles</p>
            <p className="text-3xl font-display font-bold text-foreground mt-2">{summary?.businessMiles || 0} mi</p>
            <p className="text-xs text-muted-foreground mt-4 text-right">{summary?.tripCount || 0} total trips logged</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6">
            <p className="text-muted-foreground text-sm font-medium">Personal Miles</p>
            <p className="text-3xl font-display font-bold text-foreground mt-2">{summary?.personalMiles || 0} mi</p>
            <p className="text-xs text-muted-foreground mt-4 text-right">Not deductible</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-md bg-card">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Route</th>
                <th className="px-6 py-4">Purpose</th>
                <th className="px-6 py-4 text-right">Miles</th>
                <th className="px-6 py-4 text-right">Deduction</th>
                <th className="px-6 py-4 text-center">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading logs...</td></tr>
              ) : logs?.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground"><Navigation className="w-8 h-8 mx-auto mb-2 opacity-20"/> No mileage logged</td></tr>
              ) : (
                logs?.map(log => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(log.date)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-foreground font-medium">
                        {log.startLocation} <MapPin className="w-3 h-3 text-muted-foreground" /> {log.endLocation}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{log.purpose}</td>
                    <td className="px-6 py-4 text-right font-display font-bold text-foreground">{log.miles}</td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-medium">+{formatCurrency(log.deductionAmount)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold uppercase ${log.classification === 'business' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {log.classification}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">Log Trip</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date *</label>
                <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Total Miles *</label>
                <input name="miles" type="number" step="0.1" required className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" placeholder="e.g. 15.5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Location</label>
                <input name="start" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" placeholder="Office" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Location</label>
                <input name="end" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" placeholder="Job Site A" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Purpose / Notes</label>
              <input name="purpose" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" placeholder="Material run to Home Depot" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Classification *</label>
              <div className="flex gap-4">
                <label className="flex items-center p-3 border border-border rounded-xl cursor-pointer hover:bg-muted/50 flex-1">
                  <input type="radio" name="classification" value="business" defaultChecked className="w-4 h-4 text-primary" />
                  <span className="ml-2 text-sm font-medium">Business</span>
                </label>
                <label className="flex items-center p-3 border border-border rounded-xl cursor-pointer hover:bg-muted/50 flex-1">
                  <input type="radio" name="classification" value="personal" className="w-4 h-4 text-primary" />
                  <span className="ml-2 text-sm font-medium">Personal</span>
                </label>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setIsDialogOpen(false)} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md">
                {createMutation.isPending ? "Saving..." : "Save Trip"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
