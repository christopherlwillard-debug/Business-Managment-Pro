import { useState, useRef, useEffect } from "react";
import {
  useCreateInvoice, useUpdateInvoice, useCreateClient, useListClients,
  useListJobs, useGetSettings,
  useCreateInvoicePaymentLink, useDeleteInvoicePaymentLink,
  useListInvoiceCommunications,
  Invoice, InvoiceDraft, AppSettings, Client, CreateInvoiceRequest, InvoiceAttachment,
} from "@workspace/api-client-react";
import {
  calculateInvoiceTotals,
  invoiceLogoPositionFromLayout,
  normalizeInvoiceLogoLayout,
  resolveInvoiceBrand,
  type InvoiceLogoLayout,
} from "@workspace/api-zod";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, localDateString } from "@/lib/utils";
import { printInvoiceWindow } from "@/lib/printInvoice";
import {
  moveInvoiceLogoLayout,
  resizeInvoiceLogoLayout,
  shouldEnterInvoiceLogoLayoutMode,
} from "@/lib/invoiceLogoConstants";
import { sendViaGmail, buildInvoiceEmailHtml, dataUriToInlineImage } from "@/lib/gmailSend";
import { buildInvoiceHtml } from "@/lib/printInvoice";
import { useGoogleAuth } from "@/contexts/GoogleAuth";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";
import { InvoiceDeliveryHistory } from "@/components/InvoiceDeliveryHistory";
import {
  Building2, MapPin, Check, X, Plus, Trash2, Printer,
  Send, Mail, CreditCard, Copy, Eye, ChevronDown, ChevronUp, Paperclip, Upload,
  ChevronLeft, ChevronRight, RotateCcw,
} from "lucide-react";

interface LineItem { description: string; quantity: number; unitPrice: number; }
function emptyLine(): LineItem { return { description: "", quantity: 1, unitPrice: 0 }; }
type GmailFinalizationRecovery = {
  invoiceId: number;
  eventId: number;
  providerMessageId: string;
  providerThreadId: string | null;
};

interface FormState {
  clientId: string;
  jobId: string;
  issueDate: string;
  dueDate: string;
  status: string;
  taxRate: string;
  city: string;
  state: string;
  locationName: string;
  notes: string;
  terms: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  clientCity: string;
  clientState: string;
  clientZip: string;
  clientNotes: string;
  businessLine: string;
}

export interface InvoicePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: InvoiceDraft | null;
  existingInvoice?: Invoice;
  onSaved?: () => void;
  onDelete?: () => void;
  onVoid?: () => void;
  onRevertToDraft?: (draftInvoice: Invoice) => void;
}

export function InvoicePanel({
  open, onOpenChange, initialData, existingInvoice, onSaved, onDelete, onVoid, onRevertToDraft,
}: InvoicePanelProps) {
  const queryClient = useQueryClient();
  const { data: clients = [] } = useListClients();
  const { data: jobs = [] } = useListJobs();
  const { data: settings } = useGetSettings();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const createClientMutation = useCreateClient();
  const createPaymentLink = useCreateInvoicePaymentLink();
  const deletePaymentLink = useDeleteInvoicePaymentLink();
  const { isConfigured: googleConfigured, isConnected: googleConnected, getToken, signIn } = useGoogleAuth();
  const { toast } = useToast();
  const { activeBusiness, businesses, refresh: refreshBusinesses } = useBusiness();

  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(null);
  const effectiveExistingInvoice = existingInvoice ?? savedInvoice ?? null;
  const communicationHistory = useListInvoiceCommunications(effectiveExistingInvoice?.id ?? 0, {
    query: {
      queryKey: [`/api/invoices/${effectiveExistingInvoice?.id ?? 0}/communications`],
      enabled: Boolean(open && effectiveExistingInvoice?.id),
    },
  });

  const s = settings as AppSettings | undefined;
  const prefix = s?.invoicePrefix ?? "INV-2026-";
  const nextNum = s?.invoiceNextNumber ?? 1001;
  const previewNumber = effectiveExistingInvoice
    ? (effectiveExistingInvoice.invoiceNumber ?? "Draft")
    : `${prefix}${nextNum}`;

  const isEdit = Boolean(effectiveExistingInvoice);
  const isVoided = effectiveExistingInvoice?.status === "cancelled";
  const isNumbered = Boolean(effectiveExistingInvoice?.invoiceNumber);

  function makeInitialForm(): FormState {
    if (effectiveExistingInvoice) {
      return {
        clientId: String(effectiveExistingInvoice.clientId ?? ""),
        jobId: String(effectiveExistingInvoice.jobId ?? ""),
        issueDate: effectiveExistingInvoice.issueDate ?? localDateString(),
        dueDate: effectiveExistingInvoice.dueDate ?? "",
        status: effectiveExistingInvoice.status ?? "draft",
        taxRate: effectiveExistingInvoice.taxRate ? String(effectiveExistingInvoice.taxRate) : "",
        city: effectiveExistingInvoice.city ?? "",
        state: effectiveExistingInvoice.state ?? "KY",
        locationName: effectiveExistingInvoice.locationName ?? "",
        notes: effectiveExistingInvoice.notes ?? "",
        terms: effectiveExistingInvoice.terms ?? "Net 30",
        clientEmail: effectiveExistingInvoice.clientEmail ?? "",
        clientPhone: effectiveExistingInvoice.clientPhone ?? "",
        clientAddress: effectiveExistingInvoice.clientAddress ?? "",
        clientCity: effectiveExistingInvoice.clientCity ?? "",
        clientState: effectiveExistingInvoice.clientState ?? "",
        clientZip: effectiveExistingInvoice.clientZip ?? "",
        clientNotes: effectiveExistingInvoice.clientNotes ?? "",
        businessLine: effectiveExistingInvoice.businessLine ?? "general_contracting",
      };
    }
    return {
      clientId: String(initialData?.clientId ?? ""),
      jobId: String(initialData?.jobId ?? ""),
      issueDate: localDateString(),
      dueDate: "",
      status: "draft",
      taxRate: "",
      city: initialData?.city ?? "",
      state: initialData?.state ?? "KY",
      locationName: initialData?.locationName ?? "",
      notes: "",
      terms: "Net 30",
      clientEmail: initialData?.clientEmail ?? "",
      clientPhone: initialData?.clientPhone ?? "",
      clientAddress: initialData?.clientAddress ?? "",
      clientCity: initialData?.clientCity ?? "",
      clientState: initialData?.clientState ?? "",
      clientZip: initialData?.clientZip ?? "",
      clientNotes: "",
      businessLine: activeBusiness?.slug ?? (initialData?.businessLine as string | undefined) ?? businesses[0]?.slug ?? "general_contracting",
    };
  }

  function makeInitialLineItems(): LineItem[] {
    if (effectiveExistingInvoice?.lineItems?.length) {
      return effectiveExistingInvoice.lineItems.map(li => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      }));
    }
    // Recovery: existing invoice has a stored total but no line items (legacy/migrated data).
    // Seed one line so the amount is visible and not silently lost when the user saves.
    if (effectiveExistingInvoice) {
      const storedSubtotal = Number(effectiveExistingInvoice.subtotal);
      const storedTotal    = Number(effectiveExistingInvoice.total);
      const taxRate        = Number(effectiveExistingInvoice.taxRate ?? 0);

      let recoveredUnitPrice = 0;
      if (storedSubtotal > 0) {
        // Subtotal is explicitly positive — use it directly as the pre-tax amount
        recoveredUnitPrice = storedSubtotal;
      } else if (storedTotal > 0) {
        // Subtotal is zero/missing; derive pre-tax amount from total by removing any tax
        recoveredUnitPrice = taxRate > 0 ? storedTotal / (1 + taxRate / 100) : storedTotal;
      }

      if (recoveredUnitPrice > 0) {
        return [{ description: "", quantity: 1, unitPrice: recoveredUnitPrice }];
      }
    }
    if (initialData?.lineItems?.length) {
      return initialData.lineItems.map((li: any) => ({
        description: String(li.description ?? ""),
        quantity: parseFloat(li.quantity) || 1,
        unitPrice: parseFloat(li.unitPrice) || 0,
      }));
    }
    return [emptyLine()];
  }

  function makeInitialClientInput(): string {
    if (effectiveExistingInvoice?.clientName) return effectiveExistingInvoice.clientName;
    if (initialData?.clientName) return initialData.clientName;
    return "";
  }

  const [form, setFormState] = useState<FormState>(makeInitialForm);
  const [lineItems, setLineItems] = useState<LineItem[]>(makeInitialLineItems);
  const [attachments, setAttachments] = useState<InvoiceAttachment[]>(() => effectiveExistingInvoice?.attachments ?? []);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [isNewClient, setIsNewClient] = useState(false);
  const [clientInput, setClientInput] = useState(makeInitialClientInput);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);
  const [logoLayoutMode, setLogoLayoutMode] = useState(false);
  const [logoLayoutDraft, setLogoLayoutDraft] = useState<InvoiceLogoLayout | null>(null);
  const [logoLayoutDraftBusinessId, setLogoLayoutDraftBusinessId] = useState<number | null>(null);
  const [savingLogoLayout, setSavingLogoLayout] = useState(false);
  const [resetLogoLayoutBusinessId, setResetLogoLayoutBusinessId] = useState<number | null>(null);
  const logoAreaRef = useRef<HTMLDivElement>(null);
  const savingLogoLayoutRef = useRef(false);

  const [payUrl, setPayUrl] = useState<string | null>(
    effectiveExistingInvoice?.squarePaymentLinkUrl ?? effectiveExistingInvoice?.stripePaymentLinkUrl ?? null
  );
  const [removingLink, setRemovingLink] = useState(false);

  const [showGmailCompose, setShowGmailCompose] = useState(false);
  const [gmailTo, setGmailTo] = useState(effectiveExistingInvoice?.clientEmail ?? "");
  const [gmailSubject, setGmailSubject] = useState(
    effectiveExistingInvoice ? `Invoice ${effectiveExistingInvoice.invoiceNumber} from ${s?.companyName || "us"}` : ""
  );
  const [gmailMessage, setGmailMessage] = useState("");
  const [gmailSending, setGmailSending] = useState(false);
  const [gmailFinalizationRecovery, setGmailFinalizationRecovery] = useState<GmailFinalizationRecovery | null>(null);
  const [gmailDeliveryBlocked, setGmailDeliveryBlocked] = useState<string | null>(null);
  const [gmailPendingEventId, setGmailPendingEventId] = useState<number | null>(null);
  const [gmailSent, setGmailSent] = useState(false);
  const [gmailPreview, setGmailPreview] = useState(false);
  const [attachChecklist, setAttachChecklist] = useState(true);
  const [jobHasChecklist, setJobHasChecklist] = useState(false);
  const [attachMaterials, setAttachMaterials] = useState(true);
  const [jobHasMaterials, setJobHasMaterials] = useState(false);
  const [extraEmailFiles, setExtraEmailFiles] = useState<{ filename: string; base64: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [recordPaymentAmount, setRecordPaymentAmount] = useState("");
  const [recordPaymentDate, setRecordPaymentDate] = useState(() => localDateString(new Date()));
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [revertConfirm, setRevertConfirm] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [serverUpdatedBanner, setServerUpdatedBanner] = useState(false);

  // Tracks the last-seen server-side values so we can detect background changes.
  const prevServerDataRef = useRef<{
    status: string;
    amountPaid: number | null | undefined;
    payUrl: string | null;
  } | null>(null);

  const clientRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emailFileInputRef = useRef<HTMLInputElement>(null);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const selectedBiz = businesses.find(b => b.slug === form.businessLine)
    ?? (activeBusiness?.slug === form.businessLine ? activeBusiness : null);
  const invoiceBrand = resolveInvoiceBrand(form.businessLine, s, selectedBiz);
  const companyName = invoiceBrand.displayName;
  const companyEmail = invoiceBrand.email;
  const companyPhone = invoiceBrand.phone;
  const companyAddress = invoiceBrand.address;
  const companyCity = invoiceBrand.city;
  const companyState = invoiceBrand.state;
  const companyZip = invoiceBrand.zip;
  const logoUrl = invoiceBrand.logoUrl;

  useEffect(() => {
    if (open && effectiveExistingInvoice && !showGmailCompose) {
      setGmailSubject(`Invoice ${effectiveExistingInvoice.invoiceNumber} from ${companyName || "us"}`);
    }
  }, [open, effectiveExistingInvoice?.id, effectiveExistingInvoice?.invoiceNumber, companyName, showGmailCompose]);
  const savedLogoLayout = normalizeInvoiceLogoLayout(
    selectedBiz?.id === resetLogoLayoutBusinessId ? null : invoiceBrand.logoLayout,
    s?.invoiceLogoPosition,
    s?.invoiceLogoSize,
  );
  const logoLayout = logoLayoutDraft ?? savedLogoLayout;
  const logoPos = invoiceLogoPositionFromLayout(logoLayout);

  useEffect(() => {
    if (open) {
      setFormState(makeInitialForm());
      setLineItems(makeInitialLineItems());
      setClientInput(makeInitialClientInput());
      setAttachments(effectiveExistingInvoice?.attachments ?? []);
      setIsNewClient(false);
      setFormError("");
      setShowGmailCompose(false);
      setGmailSent(false);
      setGmailPreview(false);
      setGmailMessage("");
      setGmailDeliveryBlocked(null);
      setGmailPendingEventId(null);
      if (effectiveExistingInvoice) {
        const recoveryKey = `invoice-gmail-finalization:${effectiveExistingInvoice.id}`;
        try {
          const stored = window.localStorage.getItem(recoveryKey);
          setGmailFinalizationRecovery(stored ? JSON.parse(stored) as GmailFinalizationRecovery : null);
        } catch {
          window.localStorage.removeItem(recoveryKey);
          setGmailFinalizationRecovery(null);
        }
      } else {
        setGmailFinalizationRecovery(null);
      }
      setShowMoreOptions(false);
      setLogoLayoutMode(false);
      setLogoLayoutDraft(null);
      setLogoLayoutDraftBusinessId(null);
      setResetLogoLayoutBusinessId(null);
      setRevertConfirm(false);
      setServerUpdatedBanner(false);
      const url = effectiveExistingInvoice?.squarePaymentLinkUrl ?? effectiveExistingInvoice?.stripePaymentLinkUrl ?? null;
      setPayUrl(url);
      // Record baseline server values so the background-sync effect can diff against them.
      prevServerDataRef.current = effectiveExistingInvoice
        ? { status: effectiveExistingInvoice.status, amountPaid: effectiveExistingInvoice.amountPaid, payUrl: url }
        : null;
      if (effectiveExistingInvoice) {
        setGmailTo(effectiveExistingInvoice.clientEmail ?? "");
        setGmailSubject(`Invoice ${effectiveExistingInvoice.invoiceNumber} from ${s?.companyName || "us"}`);
      } else {
        setGmailTo("");
        setGmailSubject("");
      }
    } else {
      setSavedInvoice(null);
      setLogoDataUri(null);
      prevServerDataRef.current = null;
      setServerUpdatedBanner(false);
    }
  }, [open, effectiveExistingInvoice?.id, savedInvoice?.id, initialData?.jobId]);

  useEffect(() => {
    setLogoLayoutMode(false);
    setLogoLayoutDraft(null);
    setLogoLayoutDraftBusinessId(null);
    setResetLogoLayoutBusinessId(null);
  }, [form.businessLine]);

  useEffect(() => {
    if (!open || !["approved", "sent", "overdue", "partiallyPaid"].includes(effectiveExistingInvoice?.status ?? "")) return;
    if (!effectiveExistingInvoice) return;
    if (!communicationHistory.data) return;
    const acceptedAt = effectiveExistingInvoice.acceptedAt
      ? new Date(effectiveExistingInvoice.acceptedAt).getTime()
      : 0;
    const unresolved = communicationHistory.data
      ?.filter(event =>
        event.channel === "gmail" &&
        event.provider === "gmail" &&
        ["initial_invoice", "resend_invoice"].includes(event.eventType) &&
        (
          event.status === "pending"
          || (
            event.status === "accepted"
            && (
              !event.providerMessageId
              || !event.metadata
              || typeof event.metadata !== "object"
              || (event.metadata as Record<string, unknown>).gmailEvidenceVerified !== true
            )
          )
        ) &&
        new Date(event.requestedAt).getTime() >= acceptedAt
      )
      .at(-1);
    if (!unresolved) {
      setGmailFinalizationRecovery(null);
      setGmailDeliveryBlocked(null);
      setGmailPendingEventId(null);
      return;
    }
    if (unresolved.providerMessageId) {
      setGmailFinalizationRecovery({
        invoiceId: effectiveExistingInvoice.id,
        eventId: unresolved.id,
        providerMessageId: unresolved.providerMessageId,
        providerThreadId: unresolved.providerThreadId ?? null,
      });
      setGmailDeliveryBlocked(null);
      setGmailPendingEventId(null);
    } else if (unresolved.status === "pending") {
      setGmailFinalizationRecovery(null);
      setGmailDeliveryBlocked("A previous Gmail delivery attempt is still pending. Resolve its delivery history before sending again.");
      setGmailPendingEventId(unresolved.id);
    } else {
      setGmailFinalizationRecovery(null);
      setGmailDeliveryBlocked("This Gmail delivery has no message evidence and cannot be marked Sent.");
      setGmailPendingEventId(null);
    }
  }, [open, effectiveExistingInvoice?.id, effectiveExistingInvoice?.status, effectiveExistingInvoice?.acceptedAt, communicationHistory.data]);

  async function finalizeGmailDelivery(
    recovery: GmailFinalizationRecovery,
    gmailAccessToken: string,
  ): Promise<{ ok: boolean; result: Record<string, any> }> {
    let result: Record<string, any> = {};
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(
        `${base}/api/invoices/${recovery.invoiceId}/communications/${recovery.eventId}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status: "accepted",
            providerMessageId: recovery.providerMessageId,
            providerThreadId: recovery.providerThreadId,
            gmailAccessToken,
          }),
        },
      );
      result = await response.json().catch(() => ({}));
      if (response.ok) return { ok: true, result };
      const verificationMayBeDelayed = response.status === 400
        && /could not verify/i.test(String(result.error ?? ""));
      if (!verificationMayBeDelayed || attempt === 2) break;
      await new Promise(resolve => window.setTimeout(resolve, 700 * (attempt + 1)));
    }
    return { ok: false, result };
  }

  // Detect background changes to an already-open invoice (e.g. Square webhook
  // or another tab saving). Updates payUrl silently and shows a non-intrusive
  // banner when status or amountPaid change — never touches the user's draft.
  useEffect(() => {
    if (!open || !effectiveExistingInvoice || !prevServerDataRef.current) return;

    const freshUrl = effectiveExistingInvoice.squarePaymentLinkUrl ?? effectiveExistingInvoice.stripePaymentLinkUrl ?? null;
    const prev = prevServerDataRef.current;

    // Silently sync the payment link URL so Copy/Remove buttons stay accurate.
    if (freshUrl !== prev.payUrl) {
      setPayUrl(freshUrl);
    }

    // Surface a banner if the invoice was updated externally.
    const statusChanged = effectiveExistingInvoice.status !== prev.status;
    const amountChanged = effectiveExistingInvoice.amountPaid !== prev.amountPaid;
    if (statusChanged || amountChanged) {
      setServerUpdatedBanner(true);
    }

    // Advance the baseline so the next refetch diffs against the newest data.
    prevServerDataRef.current = {
      status: effectiveExistingInvoice.status,
      amountPaid: effectiveExistingInvoice.amountPaid,
      payUrl: freshUrl,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveExistingInvoice]);

  useEffect(() => {
    if (!open || !logoUrl) { setLogoDataUri(null); return; }
    const blParam = form.businessLine ? `?businessLine=${encodeURIComponent(form.businessLine)}` : "";
    fetch(`${base}/api/settings/logo-data-uri${blParam}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(({ dataUri }) => setLogoDataUri(dataUri ?? null))
      .catch(() => setLogoDataUri(null));
  }, [open, logoUrl, form.businessLine]);

  // When a job is selected from the dropdown, auto-fill Work Location fields if they're blank.
  useEffect(() => {
    const jobId = form.jobId ? parseInt(form.jobId) : NaN;
    if (!open || isNaN(jobId)) return;
    // Only fetch if at least one location field is empty — don't overwrite manual entries
    if (form.locationName || form.city) return;
    fetch(`${base}/api/jobs/${jobId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((job: { locationName?: string | null; city?: string | null; state?: string | null }) => {
        if (job.locationName && !form.locationName) setField("locationName", job.locationName);
        if (job.city && !form.city) setField("city", job.city);
        if (job.state && !form.state) setField("state", job.state);
      })
      .catch(() => { /* non-fatal — location fields stay blank */ });
  }, [open, form.jobId]); // intentionally exclude form.locationName/city to avoid re-running after fill

  useEffect(() => {
    const jobId = form.jobId ? parseInt(form.jobId) : NaN;
    if (!open || isNaN(jobId)) { setJobHasChecklist(false); setAttachChecklist(true); return; }
    fetch(`${base}/api/jobs/${jobId}/checklist/exists`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(({ exists }: { exists: boolean }) => {
        setJobHasChecklist(exists);
        setAttachChecklist(true);
      })
      .catch(() => { setJobHasChecklist(false); setAttachChecklist(true); });
  }, [open, form.jobId]);

  useEffect(() => {
    const jobId = form.jobId ? parseInt(form.jobId) : NaN;
    if (!open || isNaN(jobId)) { setJobHasMaterials(false); setAttachMaterials(true); return; }
    fetch(`${base}/api/material-lists?jobId=${jobId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((lists: unknown[]) => {
        setJobHasMaterials(Array.isArray(lists) && lists.length > 0);
        setAttachMaterials(true);
      })
      .catch(() => { setJobHasMaterials(false); setAttachMaterials(true); });
  }, [open, form.jobId]);

  function setField(k: string, v: string) {
    setFormState(f => ({ ...f, [k]: v }));
  }

  function beginLogoLayout() {
    if (!selectedBiz || isVoided) return;
    setLogoLayoutDraft(savedLogoLayout);
    setLogoLayoutDraftBusinessId(selectedBiz.id);
    setLogoLayoutMode(true);
  }

  function startLogoPointerAction(
    kind: "move" | "resize",
    event: React.PointerEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (!logoLayoutMode) {
      beginLogoLayout();
      return;
    }
    const area = logoAreaRef.current;
    if (!area) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = logoLayout;
    const areaWidth = Math.max(1, area.getBoundingClientRect().width);
    const onMove = (moveEvent: PointerEvent) => {
      if (kind === "move") {
        setLogoLayoutDraft(moveInvoiceLogoLayout(start, moveEvent.clientX - startX, areaWidth));
        return;
      }
      setLogoLayoutDraft(resizeInvoiceLogoLayout(
        start,
        moveEvent.clientX - startX,
        moveEvent.clientY - startY,
      ));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  async function saveLogoLayout() {
    if (
      savingLogoLayoutRef.current
      ||
      !selectedBiz
      || !logoLayoutDraft
      || logoLayoutDraftBusinessId === null
      || selectedBiz.id !== logoLayoutDraftBusinessId
    ) return;
    const draftBusiness = selectedBiz;
    savingLogoLayoutRef.current = true;
    setSavingLogoLayout(true);
    try {
      const response = await fetch(`${base}/api/businesses/${draftBusiness.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceLogoLayout: logoLayoutDraft }),
      });
      if (!response.ok) throw new Error("Could not save logo layout");
      setResetLogoLayoutBusinessId(null);
      refreshBusinesses();
      setLogoLayoutMode(false);
      setLogoLayoutDraft(null);
      setLogoLayoutDraftBusinessId(null);
      toast({ title: "Logo layout saved", description: `Future ${draftBusiness.name} invoices will use this layout.` });
    } catch (error) {
      toast({
        title: "Logo layout not saved",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      savingLogoLayoutRef.current = false;
      setSavingLogoLayout(false);
    }
  }

  async function resetLogoLayout() {
    if (!selectedBiz) return;
    setSavingLogoLayout(true);
    try {
      const response = await fetch(`${base}/api/businesses/${selectedBiz.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceLogoLayout: null }),
      });
      if (!response.ok) throw new Error("Could not reset logo layout");
      setResetLogoLayoutBusinessId(selectedBiz.id);
      setLogoLayoutMode(false);
      setLogoLayoutDraft(null);
      setLogoLayoutDraftBusinessId(null);
      refreshBusinesses();
      toast({
        title: "Logo layout reset",
        description: `${selectedBiz.name} invoices now use the default logo placement.`,
      });
    } catch (error) {
      toast({
        title: "Logo layout not reset",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingLogoLayout(false);
    }
  }

  function setLine(i: number, k: keyof LineItem, v: string) {
    setLineItems(ls =>
      ls.map((l, idx) => idx === i ? { ...l, [k]: k === "description" ? v : parseFloat(v) || 0 } : l)
    );
  }
  function addLine() { setLineItems(ls => [...ls, emptyLine()]); }
  function removeLine(i: number) {
    if (lineItems.length > 1) setLineItems(ls => ls.filter((_, idx) => idx !== i));
  }

  function cyclePhotoType(idx: number) {
    const cycle: Record<string, "before" | "after" | "general"> = { general: "before", before: "after", after: "general" };
    setAttachments(prev => prev.map((a, i) => i !== idx ? a : { ...a, photoType: cycle[a.photoType ?? "general"] }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadingFile(true);
    try {
      const results: InvoiceAttachment[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`${base}/api/uploads`, { method: "POST", body: fd });
        if (res.ok) {
          const data = await res.json();
          results.push({ name: data.filename || file.name, url: data.url, size: data.size, photoType: "general" });
        }
      }
      if (results.length) setAttachments(prev => [...prev, ...results]);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const taxRate = parseFloat(form.taxRate) || 0;
  const { lineTotals, subtotal, taxAmount, total } = calculateInvoiceTotals(lineItems, taxRate);

  const suggestions: Client[] = clientInput.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(clientInput.toLowerCase()))
    : clients;
  const hasExact = clients.some(c => c.name.toLowerCase() === clientInput.toLowerCase());
  const selectedClient = clients.find(c => String(c.id) === form.clientId);
  const filteredJobs = form.clientId
    ? (jobs as any[]).filter(j => String(j.clientId) === form.clientId)
    : (jobs as any[]);

  function handlePrint() {
    printInvoiceWindow(
      {
        invoiceNumber: previewNumber,
        issueDate: form.issueDate,
        dueDate: form.dueDate || null,
        terms: form.terms || null,
        clientName: clientInput || null,
        clientEmail: form.clientEmail || null,
        clientPhone: form.clientPhone || null,
        clientAddress: form.clientAddress || null,
        clientCity: form.clientCity || null,
        clientState: form.clientState || null,
        clientZip: form.clientZip || null,
        clientNotes: form.clientNotes || null,
        locationName: form.locationName || null,
        city: form.city || null,
        state: form.state || null,
        lineItems: lineItems.filter(l => l.description.trim()),
        subtotal,
        taxRate: taxRate || null,
        taxAmount: taxRate ? taxAmount : null,
        total,
        notes: form.notes || null,
        businessLine: form.businessLine || null,
      },
      {
        companyName,
        companyEmail,
        companyPhone,
        companyAddress,
        companyCity,
        companyState,
        companyZip,
        logoAbsoluteUrl: logoDataUri,
        logoLayout,
      }
    );
  }

  async function handleSubmit() {
    if (!lineItems.some(l => l.description.trim())) {
      setFormError("Add at least one line item with a description.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      let resolvedClientId = form.clientId ? parseInt(form.clientId) : undefined;
      if (isNewClient && clientInput.trim()) {
        const nc = await createClientMutation.mutateAsync({ data: { name: clientInput.trim() } });
        resolvedClientId = (nc as any).id;
      }
      const payload: CreateInvoiceRequest = {
        clientId: resolvedClientId,
        jobId: form.jobId ? parseInt(form.jobId) : undefined,
        issueDate: form.issueDate,
        dueDate: form.dueDate || undefined,
        status: form.status as CreateInvoiceRequest["status"],
        taxRate: form.taxRate ? parseFloat(form.taxRate) : undefined,
        locationName: form.locationName || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        notes: form.notes || undefined,
        terms: form.terms || undefined,
        lineItems: lineItems
          .filter(l => l.description.trim())
          .map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
        attachments,
        businessLine: form.businessLine || undefined,
      };
      if (isEdit) {
        await updateInvoice.mutateAsync({ id: effectiveExistingInvoice!.id, data: payload });
        // Await the refetch so the list is already fresh when the panel closes.
        // Scoping to ["/api/invoices"] keeps this fast (one endpoint, not everything).
        await queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        onOpenChange(false);
        onSaved?.();
      } else {
        const newInv = await createInvoice.mutateAsync({ data: payload });
        setSavedInvoice(newInv as Invoice);
        queryClient.invalidateQueries();
        onSaved?.();
        toast({ title: "Invoice created", description: "You can now send it via Gmail or add a payment link." });
      }
    } catch {
      setFormError(`Failed to ${isEdit ? "update" : "create"} invoice. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGetPaymentLink() {
    if (!effectiveExistingInvoice) return;
    try {
      const result = await createPaymentLink.mutateAsync(effectiveExistingInvoice.id);
      setPayUrl(result.paymentLinkUrl);
      navigator.clipboard.writeText(result.paymentLinkUrl).catch(() => {});
      toast({ title: "Payment link created & copied", description: result.emailWarning ?? (result.emailSent ? "Email sent to client." : "Link copied to clipboard.") });
      queryClient.invalidateQueries();
    } catch (err: any) {
      toast({ title: "Failed to create payment link", description: err?.message ?? "An error occurred.", variant: "destructive" });
    }
  }

  async function handleRemovePaymentLink() {
    if (!effectiveExistingInvoice) return;
    setRemovingLink(true);
    try {
      await deletePaymentLink.mutateAsync(effectiveExistingInvoice.id);
      setPayUrl(null);
      toast({ title: "Payment link removed" });
      queryClient.invalidateQueries();
    } catch (err: any) {
      toast({ title: "Failed to remove payment link", description: err?.message ?? "An error occurred.", variant: "destructive" });
    } finally {
      setRemovingLink(false);
    }
  }

  async function handleGmailSend() {
    if (!effectiveExistingInvoice) {
      toast({ title: "Save the invoice first", description: "Save the invoice before sending via Gmail.", variant: "destructive" });
      return;
    }
    if (!gmailTo.trim()) {
      toast({ title: "Recipient required", description: "Enter a recipient email address.", variant: "destructive" });
      return;
    }
    setGmailSending(true);
    try {
      const token = await getToken();
      let logoForEmail: string | null = logoDataUri;
      if (!logoForEmail && logoUrl) {
        try {
          const blParam = form.businessLine ? `?businessLine=${encodeURIComponent(form.businessLine)}` : "";
          const logoResp = await fetch(`${base}/api/settings/logo-data-uri${blParam}`, { credentials: "include" });
          if (logoResp.ok) {
            const { dataUri } = await logoResp.json();
            logoForEmail = dataUri ?? null;
          }
        } catch { /* non-fatal */ }
      }
      const currentLineItems = lineItems
        .filter(l => l.description.trim())
        .map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }));
      const inlineLogo = dataUriToInlineImage(logoForEmail);
      const html = buildInvoiceEmailHtml({
        companyName, companyAddress, companyCity, companyState, companyZip, companyPhone, companyEmail,
        invoiceNumber: effectiveExistingInvoice.invoiceNumber,
        issueDate: form.issueDate,
        dueDate: form.dueDate || undefined,
        terms: form.terms || undefined,
        clientName: clientInput || undefined,
        clientEmail: form.clientEmail || undefined,
        clientPhone: form.clientPhone || undefined,
        clientAddress: form.clientAddress || undefined,
        clientCity: form.clientCity || undefined,
        clientState: form.clientState || undefined,
        clientZip: form.clientZip || undefined,
        clientNotes: form.clientNotes || undefined,
        jobTitle: effectiveExistingInvoice.jobTitle ?? undefined,
        locationName: form.locationName || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        businessLine: form.businessLine || undefined,
        lineItems: currentLineItems,
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: form.notes || undefined,
        customMessage: gmailMessage.trim() || undefined,
        paymentLink: payUrl,
        logoSrc: inlineLogo ? `cid:${inlineLogo.contentId}` : null,
        logoLayout,
      });
      const printHtml = buildInvoiceHtml(
        {
          invoiceNumber: effectiveExistingInvoice.invoiceNumber,
          issueDate: form.issueDate,
          dueDate: form.dueDate || null,
          terms: form.terms || null,
          clientName: clientInput || null,
          clientEmail: form.clientEmail || null,
          clientPhone: form.clientPhone || null,
          clientAddress: form.clientAddress || null,
          clientCity: form.clientCity || null,
          clientState: form.clientState || null,
          clientZip: form.clientZip || null,
          clientNotes: form.clientNotes || null,
          locationName: form.locationName || null,
          city: form.city || null,
          state: form.state || null,
          lineItems: currentLineItems,
          subtotal,
          taxRate: taxRate || null,
          taxAmount: taxRate ? taxAmount : null,
          total,
          notes: form.notes || null,
          businessLine: form.businessLine || null,
        },
        { companyName, companyEmail, companyPhone, companyAddress, companyCity, companyState, companyZip, logoLayout, logoAbsoluteUrl: logoForEmail }
      );
      let pdfBase64: string | undefined;
      let pdfFilename: string | undefined;
      try {
        const pdfResp = await fetch(`${base}/api/invoices/render-html-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ html: printHtml }),
        });
        if (pdfResp.ok) {
          const pdfData = await pdfResp.json();
          if (pdfData.pdfBase64) {
            pdfBase64 = pdfData.pdfBase64;
            pdfFilename = `Invoice-${effectiveExistingInvoice.invoiceNumber}.pdf`;
          }
        }
      } catch { /* non-fatal — send without PDF if rendering fails */ }

      let checklistBase64: string | undefined;
      let checklistFilename: string | undefined;
      if (attachChecklist && jobHasChecklist && effectiveExistingInvoice.jobId) {
        try {
          const clResp = await fetch(`${base}/api/jobs/${effectiveExistingInvoice.jobId}/checklist/pdf`, { credentials: "include" });
          if (clResp.ok) {
            const clBuffer = await clResp.arrayBuffer();
            let binary = "";
            const bytes = new Uint8Array(clBuffer);
            bytes.forEach(b => { binary += String.fromCharCode(b); });
            checklistBase64 = btoa(binary);
            const disp = clResp.headers.get("content-disposition") ?? "";
            const match = disp.match(/filename="?([^"]+)"?/);
            checklistFilename = match?.[1] ?? "Checklist.pdf";
          }
        } catch { /* non-fatal — send without checklist if fetch fails */ }
      }

      let materialsBase64: string | undefined;
      let materialsFilename: string | undefined;
      if (attachMaterials && jobHasMaterials && effectiveExistingInvoice.jobId) {
        try {
          const matResp = await fetch(`${base}/api/material-lists/jobs/${effectiveExistingInvoice.jobId}/materials-pdf`, { credentials: "include" });
          if (matResp.ok) {
            const matBuffer = await matResp.arrayBuffer();
            let binary = "";
            const bytes = new Uint8Array(matBuffer);
            bytes.forEach(b => { binary += String.fromCharCode(b); });
            materialsBase64 = btoa(binary);
            const disp = matResp.headers.get("content-disposition") ?? "";
            const match = disp.match(/filename="?([^"]+)"?/);
            materialsFilename = match?.[1] ?? "Materials.pdf";
          }
        } catch { /* non-fatal — send without materials PDF if fetch fails */ }
      }

      const photoAttachments: { base64: string; filename: string }[] = [];
      const photoCounters: Record<"before" | "after" | "general", number> = { before: 0, after: 0, general: 0 };
      for (const att of attachments) {
        try {
          const fetchUrl = att.url.startsWith("http") ? att.url : `${base}${att.url}`;
          const attResp = await fetch(fetchUrl, { credentials: "include" });
          if (!attResp.ok) continue;
          const attBuffer = await attResp.arrayBuffer();
          let binary = "";
          const bytes = new Uint8Array(attBuffer);
          bytes.forEach(b => { binary += String.fromCharCode(b); });
          const attBase64 = btoa(binary);
          const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name);
          let filename: string;
          if (isImage) {
            const photoType: "before" | "after" | "general" =
              att.photoType === "before" || att.photoType === "after" || att.photoType === "general"
                ? att.photoType
                : "general";
            photoCounters[photoType] += 1;
            const prefix = photoType === "before" ? "before" : photoType === "after" ? "after" : "photo";
            filename = `${prefix}-${photoCounters[photoType]}.jpg`;
          } else {
            filename = att.name;
          }
          photoAttachments.push({ base64: attBase64, filename });
        } catch { /* non-fatal — skip attachment if fetch fails */ }
      }

      const gmailSubjectLine = gmailSubject.trim() || `Invoice ${effectiveExistingInvoice.invoiceNumber}`;
      const eventType = effectiveExistingInvoice.sentAt ? "resend_invoice" : "initial_invoice";
      const prepareResponse = await fetch(`${base}/api/invoices/${effectiveExistingInvoice.id}/communications/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          eventType,
          recipient: gmailTo.trim(),
          subject: gmailSubjectLine,
          metadata: {
            attachmentCount: (pdfBase64 ? 1 : 0) + (checklistBase64 ? 1 : 0) + (materialsBase64 ? 1 : 0) + photoAttachments.length + extraEmailFiles.length,
          },
        }),
      });
      if (!prepareResponse.ok) {
        const prepareError = await prepareResponse.json().catch(() => ({}));
        if (prepareError.repairRequired && prepareError.eventId && prepareError.providerMessageId) {
          setGmailFinalizationRecovery({
            invoiceId: effectiveExistingInvoice.id,
            eventId: prepareError.eventId,
            providerMessageId: prepareError.providerMessageId,
            providerThreadId: prepareError.providerThreadId ?? null,
          });
        } else if (prepareResponse.status === 409) {
          setGmailDeliveryBlocked(prepareError.error ?? "A previous Gmail delivery attempt needs review.");
          setGmailPendingEventId(prepareError.eventId ?? null);
        }
        throw new Error(prepareError.error ?? "Could not prepare invoice delivery history.");
      }
      const pendingEvent = await prepareResponse.json() as { id: number };
      let gmailResult: { provider: "gmail"; messageId?: string | null; threadId?: string | null };
      try {
        gmailResult = await sendViaGmail({
        token,
        to: gmailTo.trim(),
        subject: gmailSubjectLine,
        deliveryId: String(pendingEvent.id),
        html,
        text: gmailMessage.trim() || `Please see invoice ${effectiveExistingInvoice.invoiceNumber} attached. Total due: $${total.toFixed(2)}`,
        pdfBase64,
        pdfFilename,
        extraAttachments: [
          ...(checklistBase64 && checklistFilename ? [{ base64: checklistBase64, filename: checklistFilename }] : []),
          ...(materialsBase64 && materialsFilename ? [{ base64: materialsBase64, filename: materialsFilename }] : []),
          ...photoAttachments,
          ...extraEmailFiles,
        ],
        inlineImages: inlineLogo ? [inlineLogo] : [],
        });
      } catch (sendError) {
        await fetch(`${base}/api/invoices/${effectiveExistingInvoice.id}/communications/${pendingEvent.id}/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status: "failed",
            errorMessage: sendError instanceof Error ? sendError.message : String(sendError),
          }),
        }).catch(() => {});
        throw sendError;
      }

      if (!gmailResult.messageId) {
        throw new Error("Gmail did not return a message ID, so delivery could not be verified.");
      }
      const recovery: GmailFinalizationRecovery = {
        invoiceId: effectiveExistingInvoice.id,
        eventId: pendingEvent.id,
        providerMessageId: gmailResult.messageId,
        providerThreadId: gmailResult.threadId ?? null,
      };
      const recoveryKey = `invoice-gmail-finalization:${effectiveExistingInvoice.id}`;
      setGmailFinalizationRecovery(recovery);
      try {
        window.localStorage.setItem(recoveryKey, JSON.stringify(recovery));
      } catch {
        // React state still blocks another send in this browser. The prepared
        // event also makes the server block duplicate sends across sessions.
      }
      const finalization = await finalizeGmailDelivery(recovery, token);
      if (!finalization.ok) {
        await communicationHistory.refetch();
        toast({
          title: "Email accepted by Gmail — history needs repair",
          description: finalization.result.error ?? "The invoice remains Approved. Repair the delivery history before sending again.",
          variant: "destructive",
        });
        return;
      }
      window.localStorage.removeItem(recoveryKey);
      setGmailFinalizationRecovery(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      await communicationHistory.refetch();
      setGmailSent(true);
      setExtraEmailFiles([]);
      toast({
        title: "Invoice sent via Gmail",
        description: pdfBase64
          ? `Accepted by Gmail for ${gmailTo.trim()} with PDF attached`
          : `Accepted by Gmail for ${gmailTo.trim()} (HTML format — PDF unavailable)`,
      });
      setTimeout(() => { setShowGmailCompose(false); setGmailSent(false); setGmailPreview(false); }, 2000);
    } catch (err: any) {
      toast({ title: "Gmail send failed", description: err?.message ?? "An error occurred.", variant: "destructive" });
    } finally {
      setGmailSending(false);
    }
  }

  async function handleRepairGmailHistory(eventIdOverride?: unknown) {
    if (!effectiveExistingInvoice) return;
    const pendingEventId = typeof eventIdOverride === "number"
      ? eventIdOverride
      : gmailPendingEventId;
    setGmailSending(true);
    try {
      const token = await getToken();
      const directPendingEventId = typeof eventIdOverride === "number"
        ? eventIdOverride
        : null;
      if (directPendingEventId || (!gmailFinalizationRecovery && pendingEventId)) {
        const recoveryEventId = directPendingEventId ?? pendingEventId!;
        const response = await fetch(
          `${base}/api/invoices/${effectiveExistingInvoice.id}/communications/${recoveryEventId}/recover-gmail`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ gmailAccessToken: token }),
          },
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error ?? "Delivery history could not be recovered.");
        setGmailDeliveryBlocked(null);
        setGmailPendingEventId(null);
        await queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        await communicationHistory.refetch();
        toast({ title: "Delivery history repaired", description: "The existing Gmail message was verified. The invoice is now marked Sent." });
        return;
      }
      if (!gmailFinalizationRecovery) return;
      const finalization = await finalizeGmailDelivery(gmailFinalizationRecovery, token);
      if (!finalization.ok) {
        throw new Error(finalization.result.error ?? "Delivery history could not be repaired.");
      }
      window.localStorage.removeItem(`invoice-gmail-finalization:${effectiveExistingInvoice.id}`);
      setGmailFinalizationRecovery(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      await communicationHistory.refetch();
      toast({ title: "Delivery history repaired", description: "The invoice is now marked Sent." });
    } catch (err: any) {
      toast({
        title: "History still needs repair",
        description: err?.message ?? "Please reconnect Gmail and try again.",
        variant: "destructive",
      });
    } finally {
      setGmailSending(false);
    }
  }

  async function handleResolvePendingGmailAttempt() {
    if (!effectiveExistingInvoice || !gmailPendingEventId) return;
    const confirmed = window.confirm(
      "First check Gmail's Sent folder for this invoice. Continue only if no message was sent. This will record the interrupted attempt as Not Sent and allow a new delivery.",
    );
    if (!confirmed) return;
    setGmailSending(true);
    try {
      const response = await fetch(
        `${base}/api/invoices/${effectiveExistingInvoice.id}/communications/${gmailPendingEventId}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status: "failed",
            errorCode: "user_confirmed_not_sent",
            errorMessage: "User checked Gmail Sent and confirmed the interrupted attempt was not sent.",
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The interrupted attempt could not be resolved.");
      setGmailDeliveryBlocked(null);
      setGmailPendingEventId(null);
      await communicationHistory.refetch();
      toast({ title: "Interrupted attempt cleared", description: "You can now send the invoice through Gmail." });
    } catch (err: any) {
      toast({
        title: "Attempt still needs review",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setGmailSending(false);
    }
  }

  function handleGmailButtonClick() {
    if (!googleConnected) {
      signIn(() => { setShowGmailCompose(true); setGmailPreview(false); });
    } else {
      setShowGmailCompose(v => !v);
      setGmailPreview(false);
    }
  }

  if (!open) return null;

  const STATUS_COLORS: Record<string, string> = {
    paid:          "bg-emerald-100 text-emerald-700",
    partiallyPaid: "bg-emerald-50 text-emerald-600",
    sent:          "bg-blue-100 text-blue-700",
    approved:      "bg-indigo-100 text-indigo-700",
    overdue:       "bg-red-100 text-red-700",
    draft:         "bg-gray-100 text-gray-600",
    cancelled:     "bg-orange-100 text-orange-700",
  };

  const isPayable = !effectiveExistingInvoice || (effectiveExistingInvoice.status !== "paid" && effectiveExistingInvoice.status !== "cancelled");
  const generatingLink = createPaymentLink.isPending;
  const hasConfirmedGmailSend = Boolean(communicationHistory.data?.some(event =>
    ["initial_invoice", "resend_invoice"].includes(event.eventType) &&
    event.status === "accepted" &&
    event.provider === "gmail" &&
    Boolean(event.providerMessageId)
  ));
  const invoiceHasBeenSent = effectiveExistingInvoice?.status !== "approved"
    || Boolean(effectiveExistingInvoice?.sentAt)
    || hasConfirmedGmailSend;

  const logoEl = logoDataUri ? (
    <div ref={logoAreaRef} className="relative w-full max-w-full" style={{ height: logoLayout.height }}>
      {logoLayoutMode && (
        <div
          aria-hidden="true"
          data-invoice-logo-guides
          className="pointer-events-none absolute inset-0 rounded-sm border border-dashed border-amber-300/80"
        >
          <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-amber-300/80" />
        </div>
      )}
      <div
        data-invoice-logo={logoPos}
        data-invoice-logo-x={logoLayout.x}
        className={`absolute top-0 select-none ${logoLayoutMode ? "cursor-move ring-2 ring-amber-400 ring-offset-2 rounded-md" : "cursor-pointer"}`}
        style={{
          left: `${logoLayout.x * 100}%`,
          transform: `translateX(-${logoLayout.x * 100}%)`,
          width: logoLayout.width,
          height: logoLayout.height,
          touchAction: "none",
        }}
        onClick={shouldEnterInvoiceLogoLayoutMode(logoLayoutMode) ? beginLogoLayout : undefined}
        onPointerDown={event => startLogoPointerAction("move", event)}
        title={logoLayoutMode ? "Drag to move the logo" : "Click to move or resize this logo"}
      >
        <img
          src={logoDataUri}
          alt={`${companyName} logo`}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
          onError={() => setLogoDataUri(null)}
        />
        {logoLayoutMode && (
          <button
            type="button"
            aria-label="Resize logo"
            onPointerDown={event => startLogoPointerAction("resize", event)}
            onClick={event => event.stopPropagation()}
            className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full border-2 border-white bg-amber-500 shadow-md cursor-nwse-resize"
            style={{ touchAction: "none" }}
          />
        )}
      </div>
    </div>
  ) : null;
  const companyContact = (
    <div className="text-xs text-gray-400 space-y-0.5">
      <p className="text-base font-extrabold text-gray-900 leading-tight">{companyName}</p>
      {companyAddress && <p>{companyAddress}</p>}
      {(companyCity || companyState || companyZip) && <p>{[companyCity, companyState, companyZip].filter(Boolean).join(", ")}</p>}
      {companyPhone && <p>{companyPhone}</p>}
      {companyEmail && <p>{companyEmail}</p>}
    </div>
  );
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !submitting && onOpenChange(false)} />
      <div className="relative w-full bg-white shadow-2xl rounded-2xl flex flex-col overflow-hidden"
        style={{ maxWidth: "min(96vw, 760px)", maxHeight: "96vh" }}>

        {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
        <div className="relative z-20 flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 truncate">
              {isEdit ? (effectiveExistingInvoice!.invoiceNumber ? `Invoice ${effectiveExistingInvoice!.invoiceNumber}` : "Draft Invoice") : "New Invoice"}
            </h2>
            {isEdit && (
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${STATUS_COLORS[effectiveExistingInvoice!.status] ?? "bg-gray-100 text-gray-600"}`}>
                {effectiveExistingInvoice!.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button type="button" onClick={handlePrint}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>

            {googleConfigured && isEdit && ["approved", "sent", "overdue"].includes(effectiveExistingInvoice?.status ?? "") && (
              <button type="button" onClick={handleGmailButtonClick}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${showGmailCompose ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"}`}
                title={googleConnected ? "Send via Gmail" : "Connect Google to send via Gmail"}>
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {invoiceHasBeenSent ? "Resend Invoice" : "Send Invoice"}
                </span>
              </button>
            )}

            {isEdit && isPayable && (
              payUrl ? (
                <div className="flex items-center gap-1">
                  <button type="button"
                    onClick={() => { navigator.clipboard.writeText(payUrl); toast({ title: "Payment link copied" }); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors"
                    title="Copy payment link">
                    <Copy className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Copy Link</span>
                  </button>
                  <button type="button" onClick={handleRemovePaymentLink} disabled={removingLink}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="Remove payment link">
                    {removingLink
                      ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      : <X className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">Remove Link</span>
                  </button>
                </div>
              ) : (
                <button type="button" onClick={handleGetPaymentLink} disabled={generatingLink}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-40"
                  title="Generate Square payment link">
                  {generatingLink
                    ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <CreditCard className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{generatingLink ? "Generating…" : "Payment Link"}</span>
                </button>
              )
            )}

            {/* Record Payment — for sent / partiallyPaid / overdue invoices */}
            {isEdit && !isVoided && ["sent", "partiallyPaid", "overdue", "approved"].includes(effectiveExistingInvoice?.status ?? "") && (
              <button type="button"
                onClick={() => { setShowRecordPayment(v => !v); setRecordPaymentAmount(""); setRecordPaymentDate(localDateString(new Date())); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${showRecordPayment ? "bg-emerald-100 text-emerald-700" : "text-gray-500 hover:bg-emerald-50 hover:text-emerald-700"}`}
                title="Record a payment received">
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Record Payment</span>
              </button>
            )}

            {isEdit && !isVoided && isNumbered &&
              (effectiveExistingInvoice?.status === "approved" || effectiveExistingInvoice?.status === "sent") &&
              !effectiveExistingInvoice?.amountPaid && (
              <button type="button" onClick={() => setRevertConfirm(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-violet-500 hover:bg-violet-50 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Revert to Draft</span>
              </button>
            )}

            {isEdit && !isVoided && isNumbered && onVoid && (
              <button type="button" onClick={onVoid}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-orange-400 hover:bg-orange-50 transition-colors">
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Void</span>
              </button>
            )}

            {isEdit && !isVoided && !isNumbered && onDelete && (
              <button type="button" onClick={onDelete}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}

            {!isVoided && (
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl font-bold text-sm bg-amber-500 text-white hover:bg-amber-600 shadow transition-all active:scale-95 disabled:opacity-60">
                {submitting
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Check className="w-4 h-4" />}
                {submitting ? "Saving…" : "Save"}
              </button>
            )}

            <button type="button" onClick={() => !submitting && onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors ml-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {googleConfigured
          && isEdit
          && ["approved", "sent", "overdue"].includes(effectiveExistingInvoice?.status ?? "")
          && !showGmailCompose
          && !gmailFinalizationRecovery
          && !gmailDeliveryBlocked && (
          <div className="border-b border-blue-100 bg-blue-50 px-4 py-2 sm:hidden">
            <button
              type="button"
              onClick={handleGmailButtonClick}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm"
              aria-label={invoiceHasBeenSent ? "Resend invoice via Gmail" : "Send invoice via Gmail"}
            >
              <Send className="h-4 w-4" />
              {invoiceHasBeenSent ? "Resend Invoice" : "Send Invoice"}
            </button>
          </div>
        )}

        {/* Voided banner */}
        {isVoided && (
          <div className="mx-4 mt-3 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700 flex items-center gap-2 flex-shrink-0">
            <X className="w-4 h-4 flex-shrink-0" />
            <span><span className="font-bold">Voided.</span> This invoice has been permanently voided and is kept for audit records. It cannot be edited or paid.</span>
          </div>
        )}

        {/* Background-update banner — shown when another tab or webhook changed the invoice */}
        {serverUpdatedBanner && !isVoided && (
          <div className="mx-4 mt-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center justify-between gap-2 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <RotateCcw className="w-4 h-4 flex-shrink-0 text-amber-600" />
              <span>
                <span className="font-semibold">This invoice was updated</span> (status or payment changed on another tab or device).
                The status badge above reflects the latest data. Your draft edits are unchanged — save to apply them, or close and reopen to start fresh.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setServerUpdatedBanner(false)}
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-amber-600 hover:bg-amber-100 transition-colors"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Revert to Draft confirmation banner */}
        {revertConfirm && (
          <div className="mx-4 mt-3 px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl flex-shrink-0">
            <div className="flex items-start gap-3">
              <RotateCcw className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-violet-900">Revert to Draft?</p>
                <p className="text-xs text-violet-700 mt-0.5">
                  The invoice number will be removed and the status reset to Draft so you can make corrections.
                  {effectiveExistingInvoice?.invoiceNumber ? ` Number ${effectiveExistingInvoice.invoiceNumber} may be reused if it was the most recently issued.` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setRevertConfirm(false)}
                  disabled={reverting}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={reverting}
                  onClick={async () => {
                    if (!effectiveExistingInvoice) return;
                    setReverting(true);
                    try {
                      const res = await fetch(`${base}/api/invoices/${effectiveExistingInvoice.id}/revert-to-draft`, {
                        method: "POST",
                        credentials: "include",
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || "Failed to revert");
                      toast({ title: "Invoice reverted to draft", description: "You can now edit and re-issue it." });
                      queryClient.invalidateQueries();
                      setRevertConfirm(false);
                      onRevertToDraft?.(data);
                    } catch (err: any) {
                      toast({ title: "Failed to revert invoice", description: err.message ?? "An error occurred.", variant: "destructive" });
                    } finally {
                      setReverting(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 transition-colors shadow disabled:opacity-60 flex items-center gap-1.5"
                >
                  {reverting
                    ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <RotateCcw className="w-3 h-3" />}
                  {reverting ? "Reverting…" : "Revert to Draft"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error banner */}
        {formError && (
          <div className="mx-4 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2 flex-shrink-0">
            <X className="w-4 h-4 flex-shrink-0" /> {formError}
          </div>
        )}

        {/* Payment balance banner — shown for partiallyPaid invoices */}
        {isEdit && effectiveExistingInvoice?.status === "partiallyPaid" && effectiveExistingInvoice.amountPaid != null && (
          <div className="mx-4 mt-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-emerald-700"><span className="font-bold">Paid:</span> {formatCurrency(effectiveExistingInvoice.amountPaid)}</span>
              <span className="text-orange-600"><span className="font-bold">Remaining:</span> {formatCurrency(Math.max(0, (effectiveExistingInvoice.total ?? 0) - effectiveExistingInvoice.amountPaid))}</span>
            </div>
            {(effectiveExistingInvoice as any).lastManualPaidAt && (
              <span className="text-[10px] text-emerald-600 font-medium">
                Last payment: {new Date((effectiveExistingInvoice as any).lastManualPaidAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </div>
        )}

        {/* Record Payment inline panel */}
        {showRecordPayment && isEdit && effectiveExistingInvoice && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-3.5 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> Record Payment Received
              </p>
              <button onClick={() => setShowRecordPayment(false)}
                className="w-6 h-6 flex items-center justify-center rounded text-emerald-400 hover:bg-emerald-100 hover:text-emerald-600 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[110px]">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-emerald-600 font-bold">$</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Amount received"
                  value={recordPaymentAmount}
                  onChange={e => setRecordPaymentAmount(e.target.value)}
                  className="w-full pl-6 pr-3 py-1.5 border border-emerald-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
              <input
                type="date"
                value={recordPaymentDate}
                onChange={e => setRecordPaymentDate(e.target.value)}
                className="flex-1 min-w-[120px] px-3 py-1.5 border border-emerald-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
              <button
                disabled={recordingPayment || !recordPaymentAmount || parseFloat(recordPaymentAmount) <= 0}
                onClick={async () => {
                  const amount = parseFloat(recordPaymentAmount);
                  if (!amount || amount <= 0) return;
                  setRecordingPayment(true);
                  try {
                    const res = await fetch(`${base}/api/invoices/${effectiveExistingInvoice.id}/record-payment`, {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ amount, paidAt: recordPaymentDate }),
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error(err.error ?? "Failed to record payment");
                    }
                    const updated = await res.json();
                    toast({
                      title: updated.status === "paid" ? "Invoice marked as paid!" : "Payment recorded",
                      description: updated.status === "paid"
                        ? `${formatCurrency(amount)} received — invoice fully paid.`
                        : `${formatCurrency(amount)} received — ${formatCurrency(Math.max(0, (updated.total ?? 0) - (updated.amountPaid ?? 0)))} remaining.`,
                    });
                    setShowRecordPayment(false);
                    setRecordPaymentAmount("");
                    onSaved?.();
                  } catch (err: any) {
                    toast({ title: "Failed to record payment", description: err?.message, variant: "destructive" });
                  } finally {
                    setRecordingPayment(false);
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {recordingPayment
                  ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Check className="w-3 h-3" />}
                {recordingPayment ? "Saving…" : "Save"}
              </button>
            </div>
            {effectiveExistingInvoice.amountPaid != null && effectiveExistingInvoice.amountPaid > 0 && (
              <p className="mt-1.5 text-[10px] text-emerald-600">
                Previously recorded: {formatCurrency(effectiveExistingInvoice.amountPaid)} · Total: {formatCurrency(effectiveExistingInvoice.total ?? 0)}
              </p>
            )}
          </div>
        )}

        {/* Gmail compose panel */}
        {showGmailCompose && isEdit && (
          <div className="bg-blue-50 border-b border-blue-200 px-5 py-3.5 flex-shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Send via Gmail
                {googleConnected && (
                  <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                    <Check className="w-2.5 h-2.5" /> Connected
                  </span>
                )}
              </p>
              <button onClick={() => { setShowGmailCompose(false); setGmailSent(false); setGmailPreview(false); }}
                className="w-6 h-6 flex items-center justify-center rounded text-blue-400 hover:bg-blue-100 hover:text-blue-600 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {gmailFinalizationRecovery ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800">Email accepted by Gmail — history needs repair</p>
                <p className="mt-1 text-[11px] text-amber-700">This invoice remains Approved. Sending again is blocked until the existing Gmail delivery is finalized.</p>
                <button
                  type="button"
                  onClick={handleRepairGmailHistory}
                  disabled={gmailSending}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  {gmailSending ? "Repairing…" : "Repair Delivery History"}
                </button>
              </div>
            ) : gmailDeliveryBlocked ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800">Delivery history needs review</p>
                <p className="mt-1 text-[11px] text-amber-700">{gmailDeliveryBlocked}</p>
                {gmailPendingEventId && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleRepairGmailHistory}
                      disabled={gmailSending}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {gmailSending ? "Checking Gmail…" : "Find Sent Email & Repair"}
                    </button>
                    <button
                      type="button"
                      onClick={handleResolvePendingGmailAttempt}
                      disabled={gmailSending}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      I Checked Gmail — Not Sent
                    </button>
                  </div>
                )}
              </div>
            ) : gmailSent ? (
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
                <Check className="w-4 h-4" /> Sent successfully!
              </div>
            ) : (
              <>
                <div className="flex gap-0 border-b border-blue-200 -mb-1">
                  <button onClick={() => setGmailPreview(false)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold border-b-2 transition-colors ${!gmailPreview ? "border-blue-600 text-blue-700" : "border-transparent text-blue-400 hover:text-blue-600"}`}>
                    <Send className="w-3 h-3" /> Compose
                  </button>
                  <button onClick={() => setGmailPreview(true)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold border-b-2 transition-colors ${gmailPreview ? "border-blue-600 text-blue-700" : "border-transparent text-blue-400 hover:text-blue-600"}`}>
                    <Eye className="w-3 h-3" /> Preview
                  </button>
                </div>
                {gmailPreview ? (
                  <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
                    <div className="px-3 py-1.5 bg-blue-100/60 border-b border-blue-200">
                      <span className="text-[10px] text-blue-600 font-medium">Exactly what the recipient will see</span>
                    </div>
                    <iframe title="Email preview" sandbox="allow-same-origin"
                      srcDoc={effectiveExistingInvoice ? buildInvoiceEmailHtml({
                        companyName, companyAddress, companyCity, companyState, companyZip, companyPhone, companyEmail,
                        invoiceNumber: effectiveExistingInvoice.invoiceNumber,
                        issueDate: form.issueDate,
                        dueDate: form.dueDate || undefined,
                        terms: form.terms || undefined,
                        clientName: clientInput || undefined,
                        clientEmail: form.clientEmail || undefined,
                        clientPhone: form.clientPhone || undefined,
                        clientAddress: form.clientAddress || undefined,
                        clientCity: form.clientCity || undefined,
                        clientState: form.clientState || undefined,
                        clientZip: form.clientZip || undefined,
                        clientNotes: form.clientNotes || undefined,
                        locationName: form.locationName || undefined,
                        city: form.city || undefined,
                        state: form.state || undefined,
                        businessLine: form.businessLine || undefined,
                        lineItems: lineItems.filter(l => l.description.trim()).map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
                        subtotal,
                        taxRate,
                        taxAmount,
                        total,
                        notes: form.notes || undefined,
                        customMessage: gmailMessage.trim() || undefined,
                        paymentLink: payUrl,
                        logoSrc: logoDataUri,
                        logoLayout,
                      }) : ""}
                      style={{ width: "100%", height: "320px", border: "none", display: "block" }} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">To</label>
                        <input type="email" value={gmailTo} onChange={e => setGmailTo(e.target.value)}
                          placeholder="client@example.com"
                          className="w-full mt-0.5 px-3 py-1.5 border border-blue-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Subject</label>
                        <input type="text" value={gmailSubject} onChange={e => setGmailSubject(e.target.value)}
                          className="w-full mt-0.5 px-3 py-1.5 border border-blue-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Message (optional)</label>
                      <textarea value={gmailMessage} onChange={e => setGmailMessage(e.target.value)} rows={2}
                        placeholder="Hi, please find your invoice attached…"
                        className="w-full mt-0.5 px-3 py-1.5 border border-blue-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
                    </div>
                    {jobHasChecklist && (
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={attachChecklist}
                            onChange={e => setAttachChecklist(e.target.checked)}
                            className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                          />
                          <span className="text-[10px] text-blue-700 font-medium">Attach checklist PDF</span>
                        </label>
                        {effectiveExistingInvoice?.jobId && (
                          <a
                            href={`${base}/api/jobs/${effectiveExistingInvoice.jobId}/checklist/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-500 underline hover:text-blue-700"
                          >
                            Preview PDF
                          </a>
                        )}
                      </div>
                    )}
                    {jobHasMaterials && (
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={attachMaterials}
                            onChange={e => setAttachMaterials(e.target.checked)}
                            className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                          />
                          <span className="text-[10px] text-blue-700 font-medium">Attach materials PDF</span>
                        </label>
                        {effectiveExistingInvoice?.jobId && (
                          <a
                            href={`${base}/api/material-lists/jobs/${effectiveExistingInvoice.jobId}/materials-pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-500 underline hover:text-blue-700"
                          >
                            Preview PDF
                          </a>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-0.5">
                      <button onClick={handleGmailSend} disabled={gmailSending || !gmailTo.trim() || Boolean(gmailFinalizationRecovery) || Boolean(gmailDeliveryBlocked)}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                        {gmailSending ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-3 h-3" />}
                        {gmailSending ? "Sending…" : "Send Invoice"}
                      </button>
                      <p className="text-[10px] text-blue-500">Sends from your Gmail with PDF attached</p>
                    </div>
                                    {/* Extra file attachments */}
                    <div className="pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => emailFileInputRef.current?.click()}
                          className="flex items-center gap-1 px-2 py-1 rounded-md border border-blue-200 text-[10px] text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <span>📎</span> Add file
                        </button>
                        {extraEmailFiles.map((f, i) => (
                          <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-md text-[10px] text-blue-700">
                            {f.filename}
                            <button
                              type="button"
                              onClick={() => setExtraEmailFiles(prev => prev.filter((_, j) => j !== i))}
                              className="ml-0.5 text-blue-400 hover:text-red-500 leading-none"
                            >×</button>
                          </span>
                        ))}
                      </div>
                      <input
                        ref={emailFileInputRef}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                        multiple
                        className="hidden"
                        onChange={e => {
                          const files = Array.from(e.target.files ?? []);
                          files.forEach(file => {
                            const reader = new FileReader();
                            reader.onload = ev => {
                              const result = ev.target?.result as string;
                              const base64 = result.split(",")[1];
                              if (base64) setExtraEmailFiles(prev => [...prev, { filename: file.name, base64 }]);
                            };
                            reader.readAsDataURL(file);
                          });
                          e.target.value = "";
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-blue-400">
                      📎 {["Invoice PDF", ...(jobHasChecklist && attachChecklist ? ["Checklist PDF"] : []), ...(jobHasMaterials && attachMaterials ? ["Materials PDF"] : []), ...extraEmailFiles.map(f => f.filename)].join(" · ")}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Single scrollable invoice document ──────────────────────────────── */}
        <div className={`flex-1 overflow-y-auto bg-gray-50 ${isVoided ? "pointer-events-none select-none opacity-70" : ""}`}>
          <div className="p-4 sm:p-6">

            {/* Business line toggle */}
            {!form.jobId && !activeBusiness && businesses.length > 1 && (
              <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-lg w-fit mb-4">
                {businesses.map(b => (
                  <button key={b.slug} type="button"
                    onClick={() => setField("businessLine", b.slug)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      form.businessLine === b.slug ? "bg-amber-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}>
                    {b.name}
                  </button>
                ))}
              </div>
            )}

            {logoLayoutMode && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-amber-900">Position {selectedBiz?.name ?? "business"} logo</p>
                  <p className="text-[10px] text-amber-700">Drag the logo sideways. Drag the round corner handle to resize it proportionally.</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={savingLogoLayout}
                    onClick={resetLogoLayout}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Reset to default
                  </button>
                  <button
                    type="button"
                    disabled={savingLogoLayout}
                    onClick={() => {
                      setLogoLayoutMode(false);
                      setLogoLayoutDraft(null);
                      setLogoLayoutDraftBusinessId(null);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingLogoLayout}
                    onClick={saveLogoLayout}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
                  >
                    {savingLogoLayout ? "Saving…" : "Done"}
                  </button>
                </div>
              </div>
            )}

            {/* Invoice document */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
              <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400" />

              <div className="p-5 sm:p-7 space-y-6">

                {/* ── Header: company info + invoice meta ── */}
                <div data-invoice-brand-position={logoPos} className="space-y-3">
                  {logoEl}
                  <div className="flex justify-between items-start gap-6">
                    <div className="flex-1 min-w-0">{companyContact}</div>

                    {/* Invoice number + editable date/terms/status */}
                    <div className="text-right flex-shrink-0 space-y-1">
                    <p className="text-2xl font-black tracking-widest text-gray-200 uppercase leading-none">Invoice</p>
                    <p className="text-xs font-bold text-amber-500">{previewNumber}</p>
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Date</span>
                        <input type="date" value={form.issueDate} onChange={e => setField("issueDate", e.target.value)}
                          className="text-xs text-gray-700 border border-gray-200 rounded-md px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 w-32" />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Due</span>
                        <input type="date" value={form.dueDate} onChange={e => setField("dueDate", e.target.value)}
                          className="text-xs text-gray-700 border border-gray-200 rounded-md px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 w-32" />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Terms</span>
                        <select value={form.terms} onChange={e => setField("terms", e.target.value)}
                          className="text-xs text-gray-700 border border-gray-200 rounded-md px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 w-32">
                          <option>Due on receipt</option>
                          <option>Net 15</option>
                          <option>Net 30</option>
                          <option>Net 60</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Status</span>
                        {/* Status is read-only — transitions happen via dedicated actions
                            (Accept Invoice, Mark Sent, Mark Paid, Void). */}
                        <span className={`text-[10px] font-bold uppercase tracking-wide border border-gray-200 rounded-full px-2 py-0.5 ${STATUS_COLORS[effectiveExistingInvoice?.status ?? form.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {effectiveExistingInvoice?.status === "cancelled" ? "Voided"
                            : effectiveExistingInvoice?.status === "partiallyPaid" ? "Partial"
                            : effectiveExistingInvoice?.status === "approved" ? "Approved"
                            : effectiveExistingInvoice?.status ?? form.status}
                        </span>
                      </div>
                    </div>
                    </div>
                  </div>
                </div>

                {/* ── Bill To + Work Location ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Bill To */}
                  <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                    <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-2">Bill To</p>
                    <div className="relative mb-2">
                      <input ref={clientRef} type="text" placeholder="Client name…"
                        value={clientInput}
                        onChange={e => { setClientInput(e.target.value); setShowClientDrop(true); setIsNewClient(false); setField("clientId", ""); }}
                        onFocus={() => setShowClientDrop(true)}
                        onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
                        className="w-full text-sm font-bold text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:outline-none focus:border-amber-400 placeholder-gray-300 pb-0.5" />
                      {isNewClient && (
                        <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[9px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded-full">NEW</span>
                      )}
                      {showClientDrop && (
                        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                          {suggestions.length === 0 && !clientInput.trim() && (
                            <p className="px-3 py-2 text-xs text-gray-400">No clients yet</p>
                          )}
                          {suggestions.map((c: Client) => (
                            <button key={c.id} type="button"
                              onMouseDown={() => {
                                setClientInput(c.name);
                                setField("clientId", String(c.id));
                                setField("clientEmail", c.email ?? "");
                                setField("clientPhone", c.phone ?? "");
                                setField("clientAddress", c.address ?? "");
                                setField("clientCity", c.city ?? "");
                                setField("clientState", c.state ?? "");
                                setField("clientZip", c.zip ?? "");
                                setField("clientNotes", c.notes ?? "");
                                setIsNewClient(false);
                                setShowClientDrop(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm text-gray-700 transition-colors">
                              {c.name}
                            </button>
                          ))}
                          {clientInput.trim() && !hasExact && (
                            <button type="button"
                              onMouseDown={() => { setField("clientId", ""); setIsNewClient(true); setShowClientDrop(false); }}
                              className="w-full text-left px-3 py-2 border-t border-gray-100 text-xs font-semibold text-amber-600 hover:bg-amber-50 transition-colors">
                              + Add "{clientInput}" as new client
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <input type="email" placeholder="Email…" value={form.clientEmail} onChange={e => setField("clientEmail", e.target.value)}
                        className="w-full text-xs text-gray-500 bg-transparent border-b border-dashed border-gray-200 focus:outline-none focus:border-amber-300 placeholder-gray-300 pb-0.5" />
                      <input type="text" placeholder="Phone…" value={form.clientPhone} onChange={e => setField("clientPhone", e.target.value)}
                        className="w-full text-xs text-gray-500 bg-transparent border-b border-dashed border-gray-200 focus:outline-none focus:border-amber-300 placeholder-gray-300 pb-0.5" />
                    </div>
                  </div>

                  {/* Work Location */}
                  <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-100">
                    <p className="text-[9px] uppercase tracking-widest font-bold text-amber-400 mb-2 flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" /> Work Location
                    </p>
                    <input type="text" placeholder="Location / address…" value={form.locationName} onChange={e => setField("locationName", e.target.value)}
                      className="w-full text-sm font-bold text-gray-900 bg-transparent border-b border-dashed border-amber-200 focus:outline-none focus:border-amber-400 placeholder-amber-200 pb-0.5 mb-2" />
                    <div className="flex gap-2">
                      <input type="text" placeholder="City" value={form.city} onChange={e => setField("city", e.target.value)}
                        className="flex-1 text-xs text-gray-500 bg-transparent border-b border-dashed border-amber-200 focus:outline-none focus:border-amber-300 placeholder-amber-200 pb-0.5" />
                      <input type="text" maxLength={2} placeholder="ST" value={form.state} onChange={e => setField("state", e.target.value.toUpperCase())}
                        className="w-8 text-xs text-gray-500 bg-transparent border-b border-dashed border-amber-200 focus:outline-none focus:border-amber-300 uppercase placeholder-amber-200 pb-0.5" />
                    </div>
                  </div>
                </div>

                {/* ── Line Items ── */}
                <div>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b-2 border-gray-800">
                        <th className="text-left pb-2 font-bold uppercase tracking-wide text-gray-400">Description</th>
                        <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-400 w-14">Qty</th>
                        <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-400 w-24">Unit Price</th>
                        <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-400 w-20">Total</th>
                        <th className="w-5" />
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((li, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-gray-50/60" : ""}>
                          <td className="py-1.5 pr-2">
                            <input type="text" value={li.description} onChange={e => setLine(i, "description", e.target.value)}
                              placeholder="Description…"
                              className="w-full text-gray-800 bg-transparent border-b border-dashed border-transparent hover:border-gray-200 focus:border-amber-300 focus:outline-none placeholder-gray-300 py-0.5" />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input type="number" min="0" step="any" value={li.quantity} onChange={e => setLine(i, "quantity", e.target.value)}
                              className="w-full text-right text-gray-600 bg-transparent border-b border-dashed border-transparent hover:border-gray-200 focus:border-amber-300 focus:outline-none py-0.5" />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input type="number" min="0" step="0.01" value={li.unitPrice} onChange={e => setLine(i, "unitPrice", e.target.value)}
                              className="w-full text-right text-gray-600 bg-transparent border-b border-dashed border-transparent hover:border-gray-200 focus:border-amber-300 focus:outline-none py-0.5" />
                          </td>
                          <td className="py-1.5 text-right font-semibold text-gray-900 tabular-nums">
                            {formatCurrency(lineTotals[i] ?? 0)}
                          </td>
                          <td className="py-1.5 pl-2 text-center">
                            <button type="button" onClick={() => removeLine(i)}
                              className="text-gray-300 hover:text-red-400 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <button type="button" onClick={addLine}
                    className="mt-2 flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-semibold transition-colors">
                    <Plus className="w-3 h-3" /> Add Line Item
                  </button>
                </div>

                {/* ── Totals ── */}
                <div className="flex justify-end">
                  <div className="w-56 space-y-1.5 text-xs">
                    <div className="flex justify-between text-gray-500">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-500">
                      <span className="flex items-center gap-1.5">
                        Tax
                        <input type="number" min="0" max="100" step="0.1" value={form.taxRate} onChange={e => setField("taxRate", e.target.value)}
                          placeholder="0"
                          className="w-12 text-xs text-right bg-white border border-gray-200 rounded-md px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-300" />
                        %
                      </span>
                      <span className="tabular-nums">{taxRate > 0 ? formatCurrency(taxAmount) : "—"}</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-sm text-gray-900 border-t-2 border-gray-800 pt-2">
                      <span>Total Due</span>
                      <span className="text-amber-600 tabular-nums">{formatCurrency(total)}</span>
                    </div>
                  </div>
                </div>

                {/* ── Notes ── */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-1.5">Notes</p>
                  <textarea rows={2} value={form.notes} onChange={e => setField("notes", e.target.value)}
                    placeholder="Payment instructions, notes to client…"
                    className="w-full text-xs text-gray-600 bg-transparent border border-dashed border-gray-200 rounded-lg p-2 focus:outline-none focus:border-amber-300 resize-none placeholder-gray-300 leading-relaxed" />
                </div>

                {/* Active payment link display */}
                {payUrl && (
                  <div className="border-t border-gray-100 pt-3 text-center">
                    <p className="text-[9px] uppercase tracking-wide text-emerald-500 font-bold mb-1">Payment Link Active</p>
                    <p className="text-xs text-emerald-600 break-all font-mono">{payUrl}</p>
                  </div>
                )}

                {/* Attachments display */}
                {attachments.length > 0 && (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-2 flex items-center gap-1">
                      <Paperclip className="w-2.5 h-2.5" /> Attachments
                      <span className="ml-1 font-normal text-gray-300">· tap badge to tag</span>
                    </p>
                    {/* Photo grid with cycling Before / After / General badges */}
                    {attachments.some(a => /\.(jpg|jpeg|png|gif|webp)$/i.test(a.name)) && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {attachments.map((att, i) => {
                          if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(att.name)) return null;
                          const type = att.photoType ?? "general";
                          const tagCfg = type === "before"
                            ? { bg: "bg-blue-500", label: "BEFORE" }
                            : type === "after"
                            ? { bg: "bg-green-500", label: "AFTER" }
                            : { bg: "bg-gray-400", label: "GENERAL" };
                          return (
                            <div key={i} className="relative group flex-shrink-0" style={{ width: 72, height: 72 }}>
                              <img src={att.url} alt={att.name}
                                onClick={() => setLightboxIndex(i)}
                                className="w-full h-full object-cover rounded-lg border border-gray-200 cursor-pointer" />
                              <button type="button" onClick={() => cyclePhotoType(i)}
                                title="Tap to cycle: General → Before → After"
                                className={`absolute bottom-0.5 left-0.5 right-5 px-0.5 py-px rounded text-[7px] font-bold text-white ${tagCfg.bg} truncate text-center leading-tight cursor-pointer`}>
                                {tagCfg.label}
                              </button>
                              <button type="button" onClick={() => setAttachments(a => a.filter((_, idx) => idx !== i))}
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Non-image file chips (PDFs etc.) */}
                    {attachments.some(a => !/\.(jpg|jpeg|png|gif|webp)$/i.test(a.name)) && (
                      <div className="flex flex-wrap gap-1.5">
                        {attachments.map((att, i) => {
                          if (/\.(jpg|jpeg|png|gif|webp)$/i.test(att.name)) return null;
                          return (
                            <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 max-w-[200px]">
                              <Paperclip className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <span className="truncate flex-1">{att.name}</span>
                              <button type="button" onClick={() => setAttachments(a => a.filter((_, idx) => idx !== i))}
                                className="text-gray-400 hover:text-red-400 transition-colors flex-shrink-0">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── More options: job, client address, add attachments ── */}
                <div className="border-t border-gray-100 pt-3">
                  <button type="button" onClick={() => setShowMoreOptions(v => !v)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-semibold transition-colors">
                    {showMoreOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {showMoreOptions ? "Hide options" : "More options"} (job, client address, attachments)
                  </button>

                  {showMoreOptions && (
                    <div className="mt-3 space-y-3">
                      {/* Job selector */}
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">Job (optional)</label>
                        <select value={form.jobId} onChange={e => {
                          const jobId = e.target.value;
                          const selectedJob = jobs.find(job => String(job.id) === jobId);
                          const jobBusiness = selectedJob?.businessId != null
                            ? businesses.find(business => business.id === Number(selectedJob.businessId))
                            : null;
                          setFormState(current => ({
                            ...current,
                            jobId,
                            businessLine: jobId
                              ? (jobBusiness?.slug ?? selectedJob?.businessLine ?? current.businessLine)
                              : current.businessLine,
                          }));
                        }}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400">
                          <option value="">No specific job</option>
                          {filteredJobs.map((j: any) => <option key={j.id} value={j.id}>{j.title}</option>)}
                        </select>
                      </div>

                      {/* Client address */}
                      {(selectedClient || isNewClient) && (
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">Client Address</label>
                          <div className="space-y-1.5">
                            <input type="text" placeholder="Street address" value={form.clientAddress} onChange={e => setField("clientAddress", e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400" />
                            <div className="grid grid-cols-3 gap-1.5">
                              <input type="text" placeholder="City" value={form.clientCity} onChange={e => setField("clientCity", e.target.value)}
                                className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400" />
                              <input type="text" placeholder="State" value={form.clientState} onChange={e => setField("clientState", e.target.value)}
                                className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400" />
                              <input type="text" placeholder="Zip" value={form.clientZip} onChange={e => setField("clientZip", e.target.value)}
                                className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400" />
                            </div>
                            <input type="text" placeholder="Client notes…" value={form.clientNotes} onChange={e => setField("clientNotes", e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400" />
                          </div>
                        </div>
                      )}

                      {/* Attachments */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1">
                            <Paperclip className="w-3 h-3" /> Add Attachments
                          </label>
                          <label className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${uploadingFile ? "text-gray-400" : "text-amber-600 hover:bg-amber-50"}`}>
                            <Upload className="w-3 h-3" />
                            {uploadingFile ? "Uploading…" : "Browse files"}
                            <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={handleFileChange} disabled={uploadingFile} />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
            </div>

          </div>
        </div>

        {isEdit && effectiveExistingInvoice && (
          <InvoiceDeliveryHistory
            invoiceNumber={effectiveExistingInvoice.invoiceNumber}
            events={communicationHistory.data ?? []}
            isLoading={communicationHistory.isLoading}
            isRepairingGmail={gmailSending}
            onRepairGmail={eventId => { void handleRepairGmailHistory(eventId); }}
          />
        )}

      </div>
    </div>

    {/* ── Fullscreen photo lightbox ── */}
    {lightboxIndex !== null && (() => {
      const imgAtts = attachments
        .map((a, i) => ({ ...a, origIdx: i }))
        .filter(a => /\.(jpg|jpeg|png|gif|webp)$/i.test(a.name));
      const pos = imgAtts.findIndex(a => a.origIdx === lightboxIndex);
      const att = imgAtts[pos];
      if (!att) return null;
      const type = att.photoType ?? "general";
      const tagCfg = type === "before"
        ? { bg: "bg-blue-500", label: "BEFORE" }
        : type === "after"
        ? { bg: "bg-green-500", label: "AFTER" }
        : { bg: "bg-gray-400", label: "GENERAL" };
      const prevIdx = pos > 0 ? imgAtts[pos - 1].origIdx : null;
      const nextIdx = pos < imgAtts.length - 1 ? imgAtts[pos + 1].origIdx : null;
      return (
        <div
          className="fixed inset-0 z-[500] bg-black/92 flex flex-col"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <span className="text-white/80 text-sm font-medium truncate max-w-[55%]">{att.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-white/40 text-xs">{pos + 1} / {imgAtts.length}</span>
              <button
                type="button"
                onClick={() => cyclePhotoType(lightboxIndex)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${tagCfg.bg}`}
              >
                {tagCfg.label}
              </button>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Photo + prev/next arrows */}
          <div
            className="flex-1 flex items-center justify-center relative px-14 min-h-0"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={att.url}
              alt={att.name}
              className="max-w-full max-h-full object-contain rounded-lg select-none"
              style={{ maxHeight: "calc(100dvh - 120px)" }}
            />
            {prevIdx !== null && (
              <button
                type="button"
                onClick={() => setLightboxIndex(prevIdx)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {nextIdx !== null && (
              <button
                type="button"
                onClick={() => setLightboxIndex(nextIdx)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Bottom hint */}
          <div className="h-10 flex items-center justify-center flex-shrink-0">
            <p className="text-white/25 text-[10px]">tap outside to close · tap badge to tag</p>
          </div>
        </div>
      );
    })()}
    </>
  );
}
