import { Bell } from "lucide-react";
import * as React from "react";

interface InvoiceDeliveryHistoryProps {
  invoiceNumber?: string | null;
  remindersSentAt: string[];
  isOpen: boolean;
  onToggle: () => void;
}

export function InvoiceDeliveryHistory({
  invoiceNumber,
  remindersSentAt,
  isOpen,
  onToggle,
}: InvoiceDeliveryHistoryProps) {
  if (remindersSentAt.length === 0) return null;

  return (
    <span className="relative">
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          onToggle();
        }}
        className="inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label={`${remindersSentAt.length} reminder${remindersSentAt.length > 1 ? "s" : ""} sent`}
        title={`${remindersSentAt.length} reminder${remindersSentAt.length > 1 ? "s" : ""} sent`}
      >
        <Bell className="w-3 h-3" />
        {remindersSentAt.length}
      </button>
      {isOpen && (
        <div
          role="dialog"
          aria-label={`Reminder history for invoice ${invoiceNumber ?? "draft"}`}
          className="absolute left-0 top-full z-30 mt-2 w-56 rounded-xl border border-border bg-card p-3 text-left shadow-xl"
          onClick={event => event.stopPropagation()}
        >
          <p className="mb-1.5 text-[11px] font-semibold text-foreground">Reminder history</p>
          <div className="space-y-1">
            {remindersSentAt.map((timestamp, index) => (
              <p key={`${timestamp}-${index}`} className="text-[11px] font-normal text-muted-foreground">
                {new Date(timestamp).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}