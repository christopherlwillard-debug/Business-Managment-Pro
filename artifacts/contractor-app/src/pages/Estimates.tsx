import { useListEstimates } from "@workspace/api-client-react";
import { Calculator, FileText, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";

// Implementing simplified read-only view for estimates to fit constraints
// A full estimator module is incredibly complex (line items, markup math)
export default function Estimates() {
  const { data: estimates, isLoading } = useListEstimates();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Estimates & Bidding</h1>
          <p className="text-muted-foreground mt-1">Manage proposals and project bids.</p>
        </div>
        <button 
          className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
          onClick={() => alert("Estimator module builder would open here in full version.")}
        >
          <Calculator className="w-5 h-5 mr-2" /> Build Estimate
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? (
          [1,2].map(i => <div key={i} className="h-48 bg-card rounded-2xl border border-border/50 animate-pulse"></div>)
        ) : estimates?.length === 0 ? (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-border rounded-2xl bg-card/50">
            <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No estimates found</h3>
            <p className="text-muted-foreground mt-1">Create your first bid.</p>
          </div>
        ) : (
          estimates?.map(est => (
            <Card key={est.id} className="border-border/50 shadow-sm bg-card hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider
                    ${est.status === 'won' ? 'bg-emerald-100 text-emerald-700' : 
                      est.status === 'lost' ? 'bg-red-100 text-red-700' : 
                      est.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}
                  `}>
                    {est.status}
                  </span>
                  <span className="text-sm text-muted-foreground">{formatDate(est.createdAt)}</span>
                </div>
                <h3 className="text-xl font-bold font-display text-foreground truncate">{est.title}</h3>
                <p className="text-muted-foreground text-sm mt-1 mb-4">{est.clientName || 'Draft Estimate'}</p>
                
                <div className="flex items-end justify-between border-t border-border/50 pt-4 mt-auto">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
                    <p className="font-display font-bold text-lg text-foreground">{formatCurrency(est.total)}</p>
                  </div>
                  {est.status === 'won' && (
                    <button className="text-sm font-medium text-accent hover:underline flex items-center">
                      View Job <ArrowRight className="w-4 h-4 ml-1" />
                    </button>
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
