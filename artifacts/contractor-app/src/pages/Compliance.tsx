import { useGetComplianceReport } from "@workspace/api-client-react";
import { ShieldAlert, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export default function Compliance() {
  const { data: report, isLoading } = useGetComplianceReport();

  if (isLoading) return <div className="p-8 animate-pulse text-muted-foreground">Loading compliance data...</div>;
  if (!report) return null;

  const hasIssues = report.subcontractor1099Alerts.length > 0 || report.uncategorizedMileageCount > 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Compliance Center</h1>
        <p className="text-muted-foreground mt-1">Proactive alerts for taxes, 1099s, and licensing.</p>
      </div>

      {!hasIssues && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-6 flex items-start">
          <CheckCircle2 className="w-6 h-6 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-lg">All Clear</h3>
            <p className="text-emerald-700/80 mt-1">No immediate compliance actions required. Keep up the good work!</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className={`border-border/50 shadow-md ${report.subcontractor1099Alerts.length > 0 ? 'border-accent/50' : ''}`}>
          <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
            <CardTitle className="font-display flex items-center text-lg">
              <ShieldAlert className={`w-5 h-5 mr-2 ${report.subcontractor1099Alerts.length > 0 ? 'text-accent' : 'text-muted-foreground'}`} /> 
              1099 Subcontractor Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {report.subcontractor1099Alerts.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500"/> No W-9 issues found for subs nearing threshold.</div>
            ) : (
              <div className="divide-y divide-border/50">
                {report.subcontractor1099Alerts.map((alert, i) => (
                  <div key={i} className="p-4 bg-accent/5">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-foreground">{alert.name}</span>
                      <span className="text-accent font-bold font-display">{formatCurrency(alert.ytdPayments)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-start">
                      <AlertTriangle className="w-4 h-4 mr-2 text-accent mt-0.5 flex-shrink-0" />
                      {alert.alert}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`border-border/50 shadow-md ${report.uncategorizedMileageCount > 0 ? 'border-primary/30' : ''}`}>
          <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
            <CardTitle className="font-display flex items-center text-lg">
              <Info className="w-5 h-5 mr-2 text-primary" /> 
              Mileage Classification
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
             {report.uncategorizedMileageCount === 0 ? (
               <div className="text-sm text-muted-foreground flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500"/> All trips categorized.</div>
             ) : (
               <div className="text-center py-4">
                 <div className="text-4xl font-display font-bold text-primary mb-2">{report.uncategorizedMileageCount}</div>
                 <p className="text-sm text-muted-foreground mb-4">Trips missing business/personal classification.</p>
                 <button className="text-sm font-medium bg-primary/10 text-primary px-4 py-2 rounded-lg hover:bg-primary/20 transition-colors">Review Trips</button>
               </div>
             )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
