import { useState } from "react";
import { useListInvoices, useGetInvoiceTaxReport } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { FileText, Download, Printer, Plus } from "lucide-react";

export default function Invoices() {
  const [activeTab, setActiveTab] = useState<'all' | 'tax'>('all');
  const { data: invoices, isLoading: loadingInvoices } = useListInvoices();
  const { data: taxReport, isLoading: loadingTax } = useGetInvoiceTaxReport();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Invoices & Reports</h1>
          <p className="text-muted-foreground mt-1">Manage billing and local tax operating records.</p>
        </div>
        <div className="flex gap-3">
          {activeTab === 'tax' && (
            <button className="flex items-center px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </button>
          )}
          <button className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95">
            <Plus className="w-5 h-5 mr-2" /> New Invoice
          </button>
        </div>
      </div>

      <div className="flex p-1 bg-muted/50 rounded-xl w-fit border border-border/50">
        <button 
          onClick={() => setActiveTab('all')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'all' ? 'bg-card text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'}`}
        >
          All Invoices
        </button>
        <button 
          onClick={() => setActiveTab('tax')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'tax' ? 'bg-card text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Tax Report (By City)
        </button>
      </div>

      <Card className="border-border/50 shadow-md overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
              {activeTab === 'all' ? (
                <tr>
                  <th className="px-6 py-4">Invoice #</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Client / Job</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4 text-center">Status</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-4">Invoice #</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Location (City/State)</th>
                  <th className="px-6 py-4 text-right">Subtotal</th>
                  <th className="px-6 py-4 text-right">Tax</th>
                  <th className="px-6 py-4 text-right">Total</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-border/50">
              {activeTab === 'all' ? (
                loadingInvoices ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading invoices...</td></tr>
                ) : invoices?.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground"><FileText className="w-8 h-8 mx-auto mb-2 opacity-20"/> No invoices found</td></tr>
                ) : (
                  invoices?.map(inv => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors group cursor-pointer">
                      <td className="px-6 py-4 font-medium text-foreground">{inv.invoiceNumber}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{inv.clientName || '-'}</div>
                        <div className="text-xs text-muted-foreground">{inv.jobTitle || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-right font-display font-semibold text-foreground">{formatCurrency(inv.total)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2 py-1 rounded-md text-xs font-semibold tracking-wide uppercase
                          ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 
                            inv.status === 'sent' ? 'bg-blue-100 text-blue-700' : 
                            inv.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}
                        `}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )
              ) : (
                loadingTax ? (
                   <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading tax report...</td></tr>
                ) : taxReport?.map(row => (
                  <tr key={row.invoiceNumber} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium">{row.invoiceNumber}</td>
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(row.issueDate)}</td>
                    <td className="px-6 py-4 font-medium text-primary">
                      {row.city ? `${row.city}, ${row.state || ''}` : 'Unspecified'}
                    </td>
                    <td className="px-6 py-4 text-right">{formatCurrency(row.subtotal)}</td>
                    <td className="px-6 py-4 text-right text-muted-foreground">{formatCurrency(row.taxAmount)}</td>
                    <td className="px-6 py-4 text-right font-bold">{formatCurrency(row.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
