import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock3,
  CreditCard,
  Link2,
  Mail,
  ReceiptText,
  RotateCcw,
  Send,
} from "lucide-react";
import type { InvoiceCommunicationEvent } from "@workspace/api-client-react";

interface InvoiceDeliveryHistoryProps {
  invoiceNumber?: string | null;
  events: InvoiceCommunicationEvent[];
  isLoading?: boolean;
  isRepairingGmail?: boolean;
  onRepairGmail?: (eventId: number) => void;
  needsGmailReconnect?: boolean;
  onReconnectGmail?: () => void;
}

const LOCAL_TIMESTAMP_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export function formatInvoiceCommunicationTimestamp(timestamp: string, timeZone?: string) {
  return new Date(timestamp).toLocaleString("en-US", {
    ...LOCAL_TIMESTAMP_OPTIONS,
    ...(timeZone ? { timeZone } : {}),
  });
}

export function sortInvoiceCommunicationEvents(events: InvoiceCommunicationEvent[]) {
  return [...events].sort(
    (left, right) => new Date(left.requestedAt).getTime() - new Date(right.requestedAt).getTime(),
  );
}

export function sortReminderTimestamps(timestamps: string[]) {
  return [...timestamps].sort(
    (left, right) => new Date(left).getTime() - new Date(right).getTime(),
  );
}

const EVENT_LABELS: Record<string, string> = {
  initial_invoice: "Invoice sent",
  resend_invoice: "Invoice resent",
  manual_reminder: "Manual reminder sent",
  automatic_reminder: "Automatic reminder sent",
  payment_link_email: "Payment link emailed",
  payment_receipt: "Payment receipt emailed",
};

function eventLabel(event: InvoiceCommunicationEvent) {
  return EVENT_LABELS[event.eventType] ?? "Invoice communication";
}

function statusIcon(status: InvoiceCommunicationEvent["status"]) {
  if (status === "accepted") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === "failed") return <AlertCircle className="h-3.5 w-3.5 text-red-600" />;
  if (status === "unknown") return <AlertCircle className="h-3.5 w-3.5 text-amber-600" />;
  return <Clock3 className="h-3.5 w-3.5 text-blue-600" />;
}

function eventIcon(eventType: string) {
  if (eventType.includes("reminder")) return <Bell className="h-3.5 w-3.5" />;
  if (eventType === "payment_link_email") return <Link2 className="h-3.5 w-3.5" />;
  if (eventType === "payment_receipt") return <ReceiptText className="h-3.5 w-3.5" />;
  return <Mail className="h-3.5 w-3.5" />;
}

function statusText(status: InvoiceCommunicationEvent["status"]) {
  if (status === "accepted") return "Accepted by provider";
  if (status === "failed") return "Failed";
  if (status === "unknown") return "Uncertain";
  return "Pending";
}

function statusClass(status: InvoiceCommunicationEvent["status"]) {
  if (status === "accepted") return "bg-emerald-50 text-emerald-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "unknown") return "bg-amber-50 text-amber-700";
  return "bg-blue-50 text-blue-700";
}

export function InvoiceDeliveryHistory({
  invoiceNumber,
  events,
  isLoading = false,
  isRepairingGmail = false,
  onRepairGmail,
  needsGmailReconnect = false,
  onReconnectGmail,
}: InvoiceDeliveryHistoryProps) {
  const orderedEvents = sortInvoiceCommunicationEvents(events);

  return (
    <section className="border-t border-gray-100 px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
            <Send className="h-3.5 w-3.5 text-blue-600" />
            Communication &amp; delivery
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {invoiceNumber ? `Invoice ${invoiceNumber}` : "Invoice history"}
          </p>
        </div>
        {events.length > 0 && (
          <span className="text-[11px] font-medium text-gray-400">
            {events.length} event{events.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-gray-400">
          <Clock3 className="h-3.5 w-3.5 animate-pulse" /> Loading history…
        </div>
      ) : events.length === 0 ? (
        <p className="py-2 text-xs text-gray-400">No invoice communications recorded yet.</p>
      ) : (
        <div className="relative space-y-3 pl-1">
          <div className="absolute bottom-2 left-[8px] top-2 w-px bg-gray-200" aria-hidden="true" />
          {orderedEvents.map(event => {
            const gmailEvidenceVerified = event.metadata
              && typeof event.metadata === "object"
              && (event.metadata as Record<string, unknown>).gmailEvidenceVerified === true;
            const canRecoverPendingGmail = (event.status === "pending"
              || (event.status === "accepted" && !gmailEvidenceVerified))
              && event.channel === "gmail"
              && event.provider === "gmail"
              && (event.eventType === "initial_invoice" || event.eventType === "resend_invoice")
              && Boolean(onRepairGmail);
            return (
            <div className="relative flex gap-2.5" key={event.id}>
              <div className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500">
                {eventIcon(event.eventType)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-xs font-semibold text-gray-700">{eventLabel(event)}</p>
                  <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(event.status)}`}>
                    {statusIcon(event.status)}
                    {statusText(event.status)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-gray-400">
                  <span>{formatInvoiceCommunicationTimestamp(event.requestedAt)}</span>
                  <span>{event.channel}{event.provider ? ` · ${event.provider}` : ""}</span>
                  {event.recipient && <span className="truncate">{event.recipient}</span>}
                </div>
                {event.errorMessage && (
                  <p className="mt-1 text-[11px] text-red-600">{event.errorMessage}</p>
                )}
                {event.providerMessageId && (
                  <p className="mt-1 truncate font-mono text-[10px] text-gray-400" title={event.providerMessageId}>
                    Message ID: {event.providerMessageId}
                  </p>
                )}
                {canRecoverPendingGmail && onRepairGmail && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onRepairGmail(event.id)}
                      disabled={isRepairingGmail}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {isRepairingGmail ? "Checking Gmail…" : "Find Sent Email & Repair"}
                    </button>
                    {needsGmailReconnect && onReconnectGmail && (
                      <button
                        type="button"
                        onClick={onReconnectGmail}
                        disabled={isRepairingGmail}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {isRepairingGmail ? "Reconnecting Gmail…" : "Reconnect Gmail & retry"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}