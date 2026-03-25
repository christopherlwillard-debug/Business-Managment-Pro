import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  useScheduleCReport,
  useAllSubcontractorsPayments,
  useCreatePayment,
  useUpdatePayment,
  useDeletePayment,
  type Payment,
} from "@workspace/api-client-react";
import {
  AlertCircle, Calendar, DollarSign, FileText, Download,
  Plus, Trash2, Edit2, CheckCircle, AlertTriangle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function TaxReports() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const { data: report, isLoading: reportLoading } = useScheduleCReport(selectedYear);
  const { data: subPayments } = useAllSubcontractorsPayments(selectedYear);
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();

  // Available years (current and past 4 years)
  const availableYears = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  const handleExportCSV = () => {
    if (!report) return;

    const csvContent = `Schedule C - Tax Year ${report.year}\nGenerated: ${new Date().toLocaleDateString()}\n\nLine,Description,Amount\n1,Gross receipts or sales,"$${report.grossReceipts.toFixed(2)}"\n${report.scheduleLines
      .filter(l => l.line > 1)
      .map(line => `${line.line},"${line.description}","$${line.amount.toFixed(2)}"`)
      .join("\n")}\n\nData Quality Check\nUncategorized Expenses,${report.dataQuality.uncategorizedExpenses}\nDraft Invoices,${report.dataQuality.invoicesDraft}`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Schedule_C_${selectedYear}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!report) return;

    let htmlContent = `
      <html>
        <head>
          <title>Schedule C - Tax Year ${report.year}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
            h1 { text-align: center; font-size: 18px; margin-bottom: 30px; }
            .form-line { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
            .line-number { font-weight: bold; width: 40px; }
            .line-description { flex: 1; margin: 0 20px; }
            .line-amount { width: 120px; text-align: right; }
            .section-header { font-weight: bold; margin-top: 20px; margin-bottom: 10px; }
            .total-line { font-weight: bold; background-color: #f0f0f0; padding: 8px; }
            .disclaimer { margin-top: 40px; font-size: 10px; border-top: 1px solid #000; padding-top: 10px; color: #666; }
          </style>
        </head>
        <body>
          <h1>SCHEDULE C (FORM 1040)</h1>
          <h2>Profit or Loss From Business</h2>
          <p style="text-align: center;">Tax Year ${report.year}</p>
          
          <div class="section-header">INCOME</div>
          <div class="form-line">
            <span class="line-number">1</span>
            <span class="line-description">Gross receipts or sales</span>
            <span class="line-amount">$${report.grossReceipts.toFixed(2)}</span>
          </div>
          
          <div class="section-header">EXPENSES</div>
          ${report.scheduleLines
            .filter(l => l.line > 1 && l.line < 28)
            .map(
              line => `
            <div class="form-line">
              <span class="line-number">${line.line}</span>
              <span class="line-description">${line.description}</span>
              <span class="line-amount">$${line.amount.toFixed(2)}</span>
            </div>
          `
            )
            .join("")}
          
          <div class="form-line total-line">
            <span class="line-number">28</span>
            <span class="line-description">Total Expenses</span>
            <span class="line-amount">$${report.totalExpenses.toFixed(2)}</span>
          </div>
          
          <div class="form-line total-line">
            <span class="line-number">29</span>
            <span class="line-description">Gross Profit</span>
            <span class="line-amount">$${report.grossProfit.toFixed(2)}</span>
          </div>
          
          <div class="disclaimer">
            <strong>⚠️ DISCLAIMER:</strong> This Schedule C summary is for informational purposes only and does not constitute tax advice. 
            Please consult with a qualified tax professional or CPA before filing. BuildPro is not responsible for tax filing accuracy or penalties 
            resulting from incomplete or incorrect information. Data is based on entries in your account; verify all categories are correct before sharing with your CPA.
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open("", "", "width=800,height=600");
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 250);
    }
  };

  if (reportLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-display font-bold text-foreground">Tax Reports</h1>
        <Card className="p-8 text-center text-muted-foreground animate-pulse">Loading tax report…</Card>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-display font-bold text-foreground">Tax Reports</h1>
        <Card className="p-8 text-center text-destructive">
          Failed to load tax report. Please try again.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Tax Reports</h1>
          <p className="text-muted-foreground mt-1">Schedule C summary and subcontractor payment tracking for tax year reporting.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm transition-all border border-border"
          >
            <Download className="w-4 h-4 mr-2" /> CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all"
          >
            <FileText className="w-4 h-4 mr-2" /> PDF
          </button>
        </div>
      </div>

      {/* Year Selector */}
      <Card className="p-4 border-border/50">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium text-foreground">Tax Year:</span>
          <div className="flex gap-2">
            {availableYears.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedYear === year
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Data Quality Warnings */}
      {report.dataQuality.warnings.length > 0 && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-amber-900">Data Quality Warnings</p>
              {report.dataQuality.warnings.map((warning, i) => (
                <p key={i} className="text-sm text-amber-800">
                  • {warning}
                </p>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Schedule C Preview */}
      <Card className="border-border/50 shadow-md overflow-hidden">
        <div className="bg-muted/50 px-6 py-4 border-b border-border">
          <h2 className="text-xl font-display font-bold text-foreground">Schedule C Summary</h2>
        </div>
        <div className="p-6 space-y-3">
          {report.scheduleLines.map((line, idx) => (
            <div
              key={idx}
              className={`flex justify-between items-center py-2 ${
                [1, 28, 29].includes(line.line) ? "border-t border-border pt-3 font-semibold" : ""
              } ${[28, 29].includes(line.line) ? "bg-muted/30 px-3 rounded" : ""}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-sm text-muted-foreground w-8">Line {line.line}</span>
                <span className="text-foreground">{line.description}</span>
              </div>
              <span className="text-lg font-semibold text-primary">{formatCurrency(line.amount)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Mileage Data */}
      {report.mileageData.logCount > 0 && (
        <Card className="border-border/50 shadow-md p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Business Mileage Deduction</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total Business Miles</p>
              <p className="text-2xl font-bold text-foreground">{report.mileageData.totalBusinessMiles.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Rate per Mile</p>
              <p className="text-2xl font-bold text-foreground">${report.mileageData.ratePerMile.toFixed(3)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Deduction Amount</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(report.mileageData.deduction)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Logs Recorded</p>
              <p className="text-2xl font-bold text-foreground">{report.mileageData.logCount}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Expense Breakdown */}
      {Object.keys(report.expensesByCategory).length > 0 && (
        <Card className="border-border/50 shadow-md overflow-hidden">
          <div className="bg-muted/50 px-6 py-4 border-b border-border">
            <h2 className="text-xl font-display font-bold text-foreground">Expense Breakdown by Category</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                <tr>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Count</th>
                  <th className="px-6 py-3 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {Object.entries(report.expensesByCategory)
                  .sort((a, b) => parseFloat(b[1].amount) - parseFloat(a[1].amount))
                  .map(([category, data]) => (
                    <tr key={category} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground capitalize">{category}</td>
                      <td className="px-6 py-4 text-muted-foreground">{data.count}</td>
                      <td className="px-6 py-4 text-right font-semibold text-foreground">{formatCurrency(data.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Subcontractor Payments (Admin View) */}
      {subPayments && subPayments.subcontractors.length > 0 && (
        <Card className="border-border/50 shadow-md overflow-hidden">
          <div className="bg-muted/50 px-6 py-4 border-b border-border flex justify-between items-center">
            <h2 className="text-xl font-display font-bold text-foreground">Subcontractor Payments</h2>
            <button
              onClick={() => {
                setEditingPayment(null);
                setShowPaymentDialog(true);
              }}
              className="flex items-center justify-center px-3 py-1.5 rounded-lg font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4 mr-1" /> Add Payment
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                <tr>
                  <th className="px-6 py-3">Subcontractor</th>
                  <th className="px-6 py-3 text-right">Total Payments</th>
                  <th className="px-6 py-3 text-center">Payment Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {subPayments.subcontractors.map(sub => (
                  <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{sub.name}</td>
                    <td className="px-6 py-4 text-right font-semibold text-primary">{formatCurrency(sub.totalPayments)}</td>
                    <td className="px-6 py-4 text-center text-muted-foreground">{sub.paymentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Disclaimer */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900 mb-2">⚠️ Tax Disclaimer</p>
            <p className="text-sm text-blue-800">
              This Schedule C summary is for informational purposes only and does not constitute tax advice. 
              Please consult with a qualified tax professional or CPA before filing. BuildPro is not responsible 
              for tax filing accuracy or penalties resulting from incomplete or incorrect information. 
              Data is based on entries in your account; verify all categories are correct before sharing with your CPA.
            </p>
          </div>
        </div>
      </Card>

      {/* Add/Edit Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPayment ? "Edit Payment" : "Log Subcontractor Payment"}</DialogTitle>
          </DialogHeader>
          <PaymentForm
            payment={editingPayment}
            year={selectedYear}
            onSuccess={() => {
              setShowPaymentDialog(false);
              setEditingPayment(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Payment form component
function PaymentForm({
  payment,
  year,
  onSuccess,
}: {
  payment: Payment | null;
  year: number;
  onSuccess: () => void;
}) {
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const [formData, setFormData] = React.useState({
    subcontractorId: payment?.subcontractorId || "",
    amount: payment?.amount || "",
    paymentDate: payment?.paymentDate || new Date().toISOString().split("T")[0],
    description: payment?.description || "",
    invoiceNumber: payment?.invoiceNumber || "",
    notes: payment?.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        subcontractorId: parseInt(formData.subcontractorId as string),
        amount: parseFloat(formData.amount as string),
        year,
      };

      if (payment) {
        await updatePayment.mutateAsync({ id: payment.id, ...data });
      } else {
        await createPayment.mutateAsync(data as any);
      }
      onSuccess();
    } catch (err) {
      console.error("Failed to save payment:", err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Subcontractor ID *</label>
        <input
          type="number"
          required
          value={formData.subcontractorId}
          onChange={e => setFormData({ ...formData, subcontractorId: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Enter subcontractor ID"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Amount *</label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
            <input
              type="number"
              step="0.01"
              required
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
              className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Payment Date *</label>
          <input
            type="date"
            required
            value={formData.paymentDate}
            onChange={e => setFormData({ ...formData, paymentDate: e.target.value })}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="e.g., Monthly retainer"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Invoice/Reference #</label>
        <input
          type="text"
          value={formData.invoiceNumber}
          onChange={e => setFormData({ ...formData, invoiceNumber: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Optional"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <input
          type="text"
          value={formData.notes}
          onChange={e => setFormData({ ...formData, notes: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Optional notes"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createPayment.isPending || updatePayment.isPending}
          className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {createPayment.isPending || updatePayment.isPending ? "Saving…" : "Save Payment"}
        </button>
      </div>
    </form>
  );
}
