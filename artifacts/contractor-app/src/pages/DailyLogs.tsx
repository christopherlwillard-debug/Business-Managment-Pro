import { useListDailyLogs } from "@workspace/api-client-react";
import { ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export default function DailyLogs() {
  const { data: logs, isLoading } = useListDailyLogs();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Daily Field Logs</h1>
          <p className="text-muted-foreground mt-1">Documentation of site conditions and progress.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoading ? (
          [1,2].map(i => <div key={i} className="h-64 bg-card rounded-2xl border border-border/50 animate-pulse"></div>)
        ) : logs?.length === 0 ? (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-border rounded-2xl bg-card/50">
            <ClipboardList className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No field logs</h3>
            <p className="text-muted-foreground mt-1">Log your first day on site.</p>
          </div>
        ) : (
          logs?.map(log => (
            <Card key={log.id} className="border-border/50 shadow-sm bg-card hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-4 border-b border-border/50 pb-4">
                  <div>
                    <h3 className="font-bold text-lg text-foreground">{formatDate(log.date)}</h3>
                    <p className="text-sm text-primary font-medium">{log.jobTitle || 'General'}</p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <div>{log.weather || 'Unknown weather'}</div>
                    <div>Crew: {log.crewCount || 0}</div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Work Completed</span>
                    <p className="text-sm text-foreground">{log.workCompleted || 'None recorded'}</p>
                  </div>
                  {log.issues && (
                    <div>
                      <span className="text-xs font-semibold text-destructive uppercase tracking-wider block mb-1">Issues/Delays</span>
                      <p className="text-sm text-foreground bg-destructive/5 p-2 rounded-md border border-destructive/10">{log.issues}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
