import { useState, useRef, useEffect } from "react";
import {
  useCreateInvoice, useUpdateInvoice, useCreateClient, useListClients,
  useListJobs, useGetSettings,
  useCreateInvoicePaymentLink, useDeleteInvoicePaymentLink,
  Invoice, InvoiceDraft, AppSettings, Client, CreateInvoiceRequest, InvoiceAttachment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, localDateString } from "@/lib/utils";
import { printInvoiceWindow } from "@/lib/printInvoice";
import { sendViaGmail, buildInvoiceEmailHtml } from "@/lib/gmailSend";
import { buildInvoiceHtml } from "@/lib/printInvoice";
import { useGoogleAuth } from "@/contexts/GoogleAuth";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  Building2, MapPin, Check, X, Plus, Trash2, Printer,
  Send, Mail, CreditCard, Copy, Eye, ChevronDown, ChevronUp, Paperclip, Upload,
} from "lucide-react";

interface LineItem { description: string; quantity: number; unitPrice: number; }
function emptyLine(): LineItem { return { description: "", quantity: 1, unitPrice: 0 }; }

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
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
  return iso;
}

export function InvoicePanel({
  open, onOpenChange, initialData, existingInvoice, onSaved, onDelete,
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
  const { activeBusiness, businesses } = useBusiness();

  // After creating a new invoice, store it here so the panel stays open in edit mode
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(null);
  const effectiveExistingInvoice = existingInvoice ?? savedInvoice ?? null;

  const s = settings as AppSettings | undefined;
  const prefix = s?.invoicePrefix ?? "INV-2026-";
  const nextNum = s?.invoiceNextNumber ?? 1001;
  const previewNumber = effectiveExistingInvoice?.invoiceNumber ?? `${prefix}${nextNum}`;

  const isEdit = Boolean(effectiveExistingInvoice);

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
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");

  // Payment link state — mirrors effectiveExistingInvoice optimistically
  const [payUrl, setPayUrl] = useState<string | null>(
    effectiveExistingInvoice?.squarePaymentLinkUrl ?? effectiveExistingInvoice?.stripePaymentLinkUrl ?? null
  );
  const [removingLink, setRemovingLink] = useState(false);

  // Gmail compose state
  const [showGmailCompose, setShowGmailCompose] = useState(false);
  const [gmailTo, setGmailTo] = useState(effectiveExistingInvoice?.clientEmail ?? "");
  const [gmailSubject, setGmailSubject] = useState(
    effectiveExistingInvoice ? `Invoice ${effectiveExistingInvoice.invoiceNumber} from ${s?.companyName || "us"}` : ""
  );
  const [gmailMessage, setGmailMessage] = useState("");
  const [gmailSending, setGmailSending] = useState(false);
  const [gmailSent, setGmailSent] = useState(false);
  const [gmailPreview, setGmailPreview] = useState(false);

  const clientRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

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
      setMobileTab("edit");
      setShowMoreOptions(false);
      const url = effectiveExistingInvoice?.squarePaymentLinkUrl ?? effectiveExistingInvoice?.stripePaymentLinkUrl ?? null;
      setPayUrl(url);
      if (effectiveExistingInvoice) {
        setGmailTo(effectiveExistingInvoice.clientEmail ?? "");
        setGmailSubject(`Invoice ${effectiveExistingInvoice.invoiceNumber} from ${s?.companyName || "us"}`);
      } else {
        setGmailTo("");
        setGmailSubject("");
      }
    } else {
      // Reset savedInvoice when panel closes so fresh state on next open
      setSavedInvoice(null);
    }
  }, [open, effectiveExistingInvoice?.id, savedInvoice?.id, initialData?.jobId]);

  function setField(k: string, v: string) {
    setFormState(f => ({ ...f, [k]: v }));
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
          results.push({ name: data.filename || file.name, url: data.url, size: data.size });
        }
      }
      if (results.length) setAttachments(prev => [...prev, ...results]);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Computed values ──────────────────────────────────────────────────────────
  const subtotal = lineItems.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const taxRate = parseFloat(form.taxRate) || 0;
  const taxAmount = subtotal * taxRate / 100;
  const total = subtotal + taxAmount;

  const selectedBiz = businesses.find(b => b.slug === form.businessLine);
  const bizSource = activeBusiness ?? selectedBiz ?? null;
  const baseCompanyName = s?.companyName || "";
  const companyName = bizSource
    ? (bizSource.name || baseCompanyName)
    : (form.businessLine === "asphalt_sealing"
      ? `${baseCompanyName || "Willard's General Contracting LLC"}, DBA Willard's Asphalt Sealing`
      : baseCompanyName);
  const companyEmail = bizSource?.email || s?.companyEmail || "";
  const companyPhone = bizSource?.phone || s?.companyPhone || "";
  const companyAddress = bizSource?.address || s?.companyAddress || "";
  const companyCity = bizSource?.city || s?.companyCity || "";
  const companyState = bizSource?.state || s?.companyState || "";
  const companyZip = bizSource?.zip || s?.companyZip || "";
  const logoUrl: string | null = bizSource?.logoUrl ?? (form.businessLine === "asphalt_sealing"
    ? (s?.dbaLogoUrl ?? s?.logoUrl) : s?.logoUrl) ?? null;
  const logoSize = s?.invoiceLogoSize ?? "medium";
  const logoPos = s?.invoiceLogoPosition ?? "top-left";
  const logoPx = logoSize === "small" ? 64 : logoSize === "large" ? 160 : 100;

  const suggestions: Client[] = clientInput.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(clientInput.toLowerCase()))
    : clients;
  const hasExact = clients.some(c => c.name.toLowerCase() === clientInput.toLowerCase());
  const selectedClient = clients.find(c => String(c.id) === form.clientId);
  const filteredJobs = form.clientId
    ? (jobs as any[]).filter(j => String(j.clientId) === form.clientId)
    : (jobs as any[]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handlePrint() {
    const absoluteLogoUrl = logoUrl ? `${window.location.origin}${base}${logoUrl}` : null;
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
        logoAbsoluteUrl: absoluteLogoUrl,
        logoSize,
        logoPosition: logoPos,
      }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        queryClient.invalidateQueries();
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
    if (!effectiveExistingInvoice) return;
    if (!gmailTo.trim()) {
      toast({ title: "Recipient required", description: "Enter a recipient email address.", variant: "destructive" });
      return;
    }
    setGmailSending(true);
    try {
      const token = await getToken();
      let logoDataUri: string | null = null;
      if (logoUrl) {
        try {
          const blParam = effectiveExistingInvoice.businessLine ? `?businessLine=${encodeURIComponent(effectiveExistingInvoice.businessLine)}` : "";
          const logoResp = await fetch(`${base}/api/settings/logo-data-uri${blParam}`, { credentials: "include" });
          if (logoResp.ok) {
            const { dataUri } = await logoResp.json();
            logoDataUri = dataUri ?? null;
          }
        } catch { /* non-fatal */ }
      }
      const html = buildInvoiceEmailHtml({
        companyName,
        companyAddress,
        companyCity,
        companyState,
        companyZip,
        companyPhone,
        companyEmail,
        invoiceNumber: effectiveExistingInvoice.invoiceNumber,
        issueDate: effectiveExistingInvoice.issueDate,
        dueDate: effectiveExistingInvoice.dueDate,
        terms: effectiveExistingInvoice.terms ?? undefined,
        clientName: effectiveExistingInvoice.clientName ?? undefined,
        clientEmail: effectiveExistingInvoice.clientEmail ?? undefined,
        clientPhone: effectiveExistingInvoice.clientPhone ?? undefined,
        clientAddress: effectiveExistingInvoice.clientAddress ?? undefined,
        clientCity: effectiveExistingInvoice.clientCity ?? undefined,
        clientState: effectiveExistingInvoice.clientState ?? undefined,
        clientZip: effectiveExistingInvoice.clientZip ?? undefined,
        clientNotes: effectiveExistingInvoice.clientNotes ?? undefined,
        jobTitle: effectiveExistingInvoice.jobTitle ?? undefined,
        locationName: effectiveExistingInvoice.locationName ?? undefined,
        city: effectiveExistingInvoice.city ?? undefined,
        state: effectiveExistingInvoice.state ?? undefined,
        businessLine: effectiveExistingInvoice.businessLine ?? undefined,
        lineItems: (effectiveExistingInvoice.lineItems ?? []).map((li: any) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice })),
        subtotal: effectiveExistingInvoice.subtotal,
        taxRate: effectiveExistingInvoice.taxRate ?? 0,
        taxAmount: effectiveExistingInvoice.taxAmount ?? 0,
        total: effectiveExistingInvoice.total,
        notes: effectiveExistingInvoice.notes ?? undefined,
        customMessage: gmailMessage.trim() || undefined,
        paymentLink: payUrl,
        logoSrc: logoDataUri,
      });
      const printHtml = buildInvoiceHtml(
        {
          invoiceNumber: effectiveExistingInvoice.invoiceNumber,
          issueDate: effectiveExistingInvoice.issueDate,
          dueDate: effectiveExistingInvoice.dueDate,
          terms: effectiveExistingInvoice.terms,
          clientName: effectiveExistingInvoice.clientName,
          clientEmail: effectiveExistingInvoice.clientEmail,
          clientPhone: effectiveExistingInvoice.clientPhone,
          clientAddress: effectiveExistingInvoice.clientAddress,
          clientCity: effectiveExistingInvoice.clientCity,
          clientState: effectiveExistingInvoice.clientState,
          clientZip: effectiveExistingInvoice.clientZip,
          clientNotes: effectiveExistingInvoice.clientNotes,
          locationName: effectiveExistingInvoice.locationName,
          city: effectiveExistingInvoice.city,
          state: effectiveExistingInvoice.state,
          lineItems: (effectiveExistingInvoice.lineItems ?? []).map((li: any) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice })),
          subtotal: effectiveExistingInvoice.subtotal,
          taxRate: effectiveExistingInvoice.taxRate,
          taxAmount: effectiveExistingInvoice.taxAmount,
          total: effectiveExistingInvoice.total,
          notes: effectiveExistingInvoice.notes,
          businessLine: effectiveExistingInvoice.businessLine ?? null,
        },
        { companyName, companyEmail, companyPhone, companyAddress, companyCity, companyState, companyZip, logoSize, logoPosition: logoPos, logoAbsoluteUrl: logoDataUri }
      );
      const pdfResp = await fetch(`${base}/api/invoices/render-html-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ html: printHtml }),
      });
      if (!pdfResp.ok) {
        const errData = await pdfResp.json().catch(() => ({}));
        throw new Error(errData.error ?? `PDF render error ${pdfResp.status}`);
      }
      const pdfData = await pdfResp.json();
      if (!pdfData.pdfBase64) throw new Error("PDF render returned an empty result");
      await sendViaGmail({
        token,
        to: gmailTo.trim(),
        subject: gmailSubject.trim() || `Invoice ${effectiveExistingInvoice.invoiceNumber}`,
        html,
        text: gmailMessage.trim() || `Please see invoice ${effectiveExistingInvoice.invoiceNumber} attached. Total due: $${effectiveExistingInvoice.total.toFixed(2)}`,
        pdfBase64: pdfData.pdfBase64,
        pdfFilename: `Invoice-${effectiveExistingInvoice.invoiceNumber}.pdf`,
      });
      setGmailSent(true);
      toast({ title: "Invoice sent via Gmail", description: `Delivered to ${gmailTo.trim()} with PDF attached` });
      setTimeout(() => { setShowGmailCompose(false); setGmailSent(false); setGmailPreview(false); }, 2000);
    } catch (err: any) {
      toast({ title: "Gmail send failed", description: err?.message ?? "An error occurred.", variant: "destructive" });
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
    paid: "bg-emerald-100 text-emerald-700",
    sent: "bg-blue-100 text-blue-700",
    overdue: "bg-red-100 text-red-700",
    draft: "bg-gray-100 text-gray-600",
    cancelled: "bg-orange-100 text-orange-700",
  };

  const isPayable = !effectiveExistingInvoice || (effectiveExistingInvoice.status !== "paid" && effectiveExistingInvoice.status !== "cancelled");
  const generatingLink = createPaymentLink.isPending;

  // ── Preview ──────────────────────────────────────────────────────────────────
  const PreviewContent = () => {
    const hasClientContact = clientInput || form.clientEmail || form.clientPhone || form.clientAddress;
    const hasWorkLocation = form.locationName || form.city || form.state;

    const logoEl = logoUrl ? (
      <img src={`${base}${logoUrl}`} alt="Logo" className="flex-shrink-0"
        style={{ height: logoPx, width: "auto", maxWidth: logoPx * 2.5, objectFit: "contain" }} />
    ) : (
      <div className="rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0" style={{ width: 44, height: 44 }}>
        <Building2 className="w-5 h-5 text-amber-500" />
      </div>
    );

    const contactEl = (
      <div className="text-xs text-gray-400 space-y-0.5 mt-1">
        {companyAddress && <p>{companyAddress}</p>}
        {(companyCity || companyState || companyZip) && <p>{[companyCity, companyState, companyZip].filter(Boolean).join(", ")}</p>}
        {companyPhone && <p>{companyPhone}</p>}
        {companyEmail && <p>{companyEmail}</p>}
      </div>
    );

    const nameEl = <p className="text-base font-extrabold text-gray-900 leading-tight">{companyName || <span className="text-gray-300 italic font-normal text-sm">Your Company</span>}</p>;

    const headerBlock = logoPos === "top-center" ? (
      <div className="flex-1 flex flex-col items-center text-center gap-1">{logoEl}{nameEl}{contactEl}</div>
    ) : logoPos === "top-right" ? (
      <div className="flex-1">{nameEl}{contactEl}</div>
    ) : (
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">{logoEl}{nameEl}</div>
        {contactEl}
      </div>
    );

    const invoiceDetailsEl = (
      <div className="text-right flex-shrink-0">
        <p className="text-2xl font-black tracking-widest text-gray-200 uppercase leading-none">Invoice</p>
        <p className="text-xs font-bold text-amber-500 mt-0.5">{previewNumber}</p>
        <div className="mt-2 space-y-0.5 text-xs">
          {form.issueDate && <div className="flex justify-end gap-2 text-gray-600"><span className="font-semibold text-gray-700">Date:</span><span>{fmtDate(form.issueDate)}</span></div>}
          {form.dueDate && <div className="flex justify-end gap-2 text-gray-600"><span className="font-semibold text-gray-700">Due:</span><span>{fmtDate(form.dueDate)}</span></div>}
          {form.terms && <div className="flex justify-end gap-2 text-gray-600"><span className="font-semibold text-gray-700">Terms:</span><span>{form.terms}</span></div>}
          <div className="flex justify-end gap-2 text-gray-600 mt-1">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${STATUS_COLORS[form.status] ?? "bg-gray-100 text-gray-600"}`}>{form.status}</span>
          </div>
        </div>
      </div>
    );

    const headerRow = logoPos === "top-right" ? (
      <div className="flex justify-between items-start gap-4">
        {headerBlock}
        <div className="flex flex-col items-end gap-2">{logoEl}{invoiceDetailsEl}</div>
      </div>
    ) : (
      <div className="flex justify-between items-start gap-4">{headerBlock}{invoiceDetailsEl}</div>
    );

    return (
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
        <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400" />
        <div className="p-6 space-y-5">
          {headerRow}

          {/* Bill To + Work Location */}
          <div className={`grid gap-4 ${hasWorkLocation ? "grid-cols-2" : "grid-cols-1"}`}>
            <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
              <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-2">Bill To</p>
              {hasClientContact ? (
                <div className="space-y-0.5 text-xs">
                  {clientInput && <p className="font-bold text-gray-900 text-sm">{clientInput}</p>}
                  {form.clientEmail && <p className="text-gray-500">{form.clientEmail}</p>}
                  {form.clientPhone && <p className="text-gray-500">{form.clientPhone}</p>}
                  {(form.clientAddress || form.clientCity || form.clientState || form.clientZip) && (
                    <p className="text-gray-500">{[form.clientAddress, form.clientCity, form.clientState, form.clientZip].filter(Boolean).join(", ")}</p>
                  )}
                  {form.clientNotes && <p className="text-gray-400 text-[10px] border-t border-gray-100 pt-1.5 mt-1.5">{form.clientNotes}</p>}
                </div>
              ) : (
                <p className="text-xs text-gray-300 italic">No client specified</p>
              )}
            </div>
            {hasWorkLocation && (
              <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-100">
                <p className="text-[9px] uppercase tracking-widest font-bold text-amber-400 mb-2 flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5" /> Work Location
                </p>
                {form.locationName && <p className="font-bold text-gray-900 text-sm">{form.locationName}</p>}
                {(form.city || form.state) && <p className="text-xs text-gray-500">{[form.city, form.state].filter(Boolean).join(", ")}</p>}
              </div>
            )}
          </div>

          {/* Line Items */}
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="text-left pb-1.5 font-bold uppercase tracking-wide text-gray-400 w-1/2">Description</th>
                <th className="text-right pb-1.5 font-bold uppercase tracking-wide text-gray-400">Qty</th>
                <th className="text-right pb-1.5 font-bold uppercase tracking-wide text-gray-400">Unit Price</th>
                <th className="text-right pb-1.5 font-bold uppercase tracking-wide text-gray-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.filter(l => l.description.trim()).length > 0
                ? lineItems.filter(l => l.description.trim()).map((li, i) => (
                  <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                    <td className="py-2 pr-3 text-gray-800">{li.description}</td>
                    <td className="py-2 text-right text-gray-500">{li.quantity}</td>
                    <td className="py-2 text-right text-gray-500">{formatCurrency(li.unitPrice)}</td>
                    <td className="py-2 text-right font-semibold text-gray-900">{formatCurrency(li.quantity * li.unitPrice)}</td>
                  </tr>
                ))
                : <tr><td colSpan={4} className="py-4 text-center text-gray-200 italic">No line items yet</td></tr>
              }
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-52 space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              {taxRate > 0 && <div className="flex justify-between text-gray-500"><span>Tax ({taxRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>}
              <div className="flex justify-between font-extrabold text-sm text-gray-900 border-t-2 border-gray-800 pt-2">
                <span>Total Due</span><span className="text-amber-600">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {form.notes && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-1">Notes</p>
              <p className="text-gray-600 text-xs leading-relaxed whitespace-pre-wrap">{form.notes}</p>
            </div>
          )}

          {/* Payment link */}
          {payUrl && (
            <div className="border-t border-gray-100 pt-3 text-center">
              <p className="text-[9px] uppercase tracking-wide text-emerald-500 font-bold mb-1">Payment Link Active</p>
              <p className="text-xs text-emerald-600 break-all font-mono">{payUrl}</p>
            </div>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-1.5 flex items-center gap-1">
                <Paperclip className="w-2.5 h-2.5" /> Attachments
              </p>
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((att, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-100 rounded-lg text-[10px] text-amber-700 max-w-[160px]">
                    <Paperclip className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="truncate">{att.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
      </div>
    );
  };

  // ── Edit Form ────────────────────────────────────────────────────────────────
  const EditForm = () => (
    <div className="space-y-4">
      {/* Business Line toggle */}
      {!activeBusiness && businesses.length > 1 && (
        <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-lg w-fit">
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

      {/* Client */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">Client</label>
        <div className="relative">
          <input
            ref={clientRef}
            type="text"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-300"
            placeholder="Search or add new client…"
            value={clientInput}
            onChange={e => { setClientInput(e.target.value); setShowClientDrop(true); setIsNewClient(false); setField("clientId", ""); }}
            onFocus={() => setShowClientDrop(true)}
            onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
          />
          {isNewClient && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded-full">NEW</span>
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
        {(selectedClient || isNewClient) && (
          <div className="mt-2 space-y-1.5">
            {[
              { key: "clientEmail", label: "Email", type: "email" },
              { key: "clientPhone", label: "Phone", type: "text" },
            ].map(({ key, label, type }) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-[10px] text-gray-400 w-12 flex-shrink-0">{label}</label>
                <input type={type}
                  className="flex-1 px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  value={form[key as keyof FormState] as string}
                  onChange={e => setField(key, e.target.value)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Job */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">Job (optional)</label>
        <select
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
          value={form.jobId}
          onChange={e => setField("jobId", e.target.value)}>
          <option value="">No specific job</option>
          {filteredJobs.map((j: any) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </div>

      {/* Line Items */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1.5">Line Items</label>
        <div className="space-y-1.5">
          {lineItems.map((li, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input type="text"
                className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder-gray-300"
                placeholder="Description"
                value={li.description}
                onChange={e => setLine(i, "description", e.target.value)} />
              <input type="number" min="0" step="any"
                className="w-14 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
                placeholder="Qty"
                value={li.quantity}
                onChange={e => setLine(i, "quantity", e.target.value)} />
              <input type="number" min="0" step="0.01"
                className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
                placeholder="$ Price"
                value={li.unitPrice}
                onChange={e => setLine(i, "unitPrice", e.target.value)} />
              <span className="text-xs font-semibold text-gray-500 w-14 text-right flex-shrink-0">{formatCurrency(li.quantity * li.unitPrice)}</span>
              <button type="button" onClick={() => removeLine(i)}
                className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLine}
          className="mt-2 flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-semibold transition-colors">
          <Plus className="w-3 h-3" /> Add Line Item
        </button>
        <div className="mt-2 flex items-center gap-2 justify-end">
          <label className="text-xs text-gray-400 font-semibold">Tax %</label>
          <input type="number" min="0" max="100" step="0.1"
            className="w-20 px-2 py-1 text-xs rounded-lg border border-gray-200 text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
            placeholder="0"
            value={form.taxRate}
            onChange={e => setField("taxRate", e.target.value)} />
        </div>
        <div className="text-right mt-1 text-xs font-bold text-amber-600">
          Total: {formatCurrency(total)}
        </div>
      </div>

      {/* Dates & Terms */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">Issue Date</label>
          <input type="date" required
            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
            value={form.issueDate} onChange={e => setField("issueDate", e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">Due Date</label>
          <input type="date"
            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
            value={form.dueDate} onChange={e => setField("dueDate", e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">Terms</label>
          <select
            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
            value={form.terms} onChange={e => setField("terms", e.target.value)}>
            <option>Due on receipt</option>
            <option>Net 15</option>
            <option>Net 30</option>
            <option>Net 60</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">Status</label>
          <select
            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
            value={form.status} onChange={e => setField("status", e.target.value)}>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">Notes</label>
        <textarea rows={2}
          className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 text-gray-700"
          placeholder="Payment instructions, notes to client…"
          value={form.notes}
          onChange={e => setField("notes", e.target.value)} />
      </div>

      {/* More options (collapsible) */}
      <div>
        <button type="button" onClick={() => setShowMoreOptions(v => !v)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-semibold transition-colors">
          {showMoreOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showMoreOptions ? "Hide" : "More options"} (location, attachments)
        </button>
        {showMoreOptions && (
          <div className="mt-3 space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
            {/* Work Location */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-amber-500 flex items-center gap-1 mb-2">
                <MapPin className="w-3 h-3" /> Work Location
              </label>
              <div className="space-y-2">
                <input type="text"
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  placeholder="Location name (e.g. 123 Main St)"
                  value={form.locationName} onChange={e => setField("locationName", e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text"
                    className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    placeholder="City"
                    value={form.city} onChange={e => setField("city", e.target.value)} />
                  <input type="text" maxLength={2}
                    className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 uppercase focus:outline-none focus:ring-1 focus:ring-amber-400"
                    placeholder="State"
                    value={form.state} onChange={e => setField("state", e.target.value.toUpperCase())} />
                </div>
              </div>
            </div>

            {/* Client address fields */}
            {(selectedClient || isNewClient) && (
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-2">Client Address</label>
                <div className="space-y-1.5">
                  <input type="text"
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    placeholder="Street address"
                    value={form.clientAddress} onChange={e => setField("clientAddress", e.target.value)} />
                  <div className="grid grid-cols-3 gap-1.5">
                    <input type="text"
                      className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      placeholder="City"
                      value={form.clientCity} onChange={e => setField("clientCity", e.target.value)} />
                    <input type="text"
                      className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      placeholder="State"
                      value={form.clientState} onChange={e => setField("clientState", e.target.value)} />
                    <input type="text"
                      className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      placeholder="Zip"
                      value={form.clientZip} onChange={e => setField("clientZip", e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Attachments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1">
                  <Paperclip className="w-3 h-3" /> Attachments
                </label>
                <label className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${uploadingFile ? "text-gray-400" : "text-amber-600 hover:bg-amber-50"}`}>
                  <Upload className="w-3 h-3" />
                  {uploadingFile ? "Uploading…" : "Add files"}
                  <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={handleFileChange} disabled={uploadingFile} />
                </label>
              </div>
              {attachments.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 max-w-[180px]">
                      <Paperclip className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="truncate flex-1">{att.name}</span>
                      <button type="button" onClick={() => setAttachments(a => a.filter((_, idx) => idx !== i))}
                        className="text-gray-400 hover:text-red-400 transition-colors flex-shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300 italic">No attachments yet</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Gmail Compose Panel ──────────────────────────────────────────────────────
  const GmailComposePanel = () => (
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
      {gmailSent ? (
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
              <iframe
                title="Email preview"
                sandbox="allow-same-origin"
                srcDoc={effectiveExistingInvoice ? buildInvoiceEmailHtml({
                  companyName, companyAddress, companyCity, companyState, companyZip, companyPhone, companyEmail,
                  invoiceNumber: effectiveExistingInvoice.invoiceNumber,
                  issueDate: effectiveExistingInvoice.issueDate,
                  dueDate: effectiveExistingInvoice.dueDate,
                  terms: effectiveExistingInvoice.terms ?? undefined,
                  clientName: effectiveExistingInvoice.clientName ?? undefined,
                  clientEmail: effectiveExistingInvoice.clientEmail ?? undefined,
                  clientPhone: effectiveExistingInvoice.clientPhone ?? undefined,
                  clientAddress: effectiveExistingInvoice.clientAddress ?? undefined,
                  clientCity: effectiveExistingInvoice.clientCity ?? undefined,
                  clientState: effectiveExistingInvoice.clientState ?? undefined,
                  clientZip: effectiveExistingInvoice.clientZip ?? undefined,
                  clientNotes: effectiveExistingInvoice.clientNotes ?? undefined,
                  locationName: effectiveExistingInvoice.locationName ?? undefined,
                  city: effectiveExistingInvoice.city ?? undefined,
                  state: effectiveExistingInvoice.state ?? undefined,
                  businessLine: effectiveExistingInvoice.businessLine ?? undefined,
                  lineItems: (effectiveExistingInvoice.lineItems ?? []).map((li: any) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice })),
                  subtotal: effectiveExistingInvoice.subtotal,
                  taxRate: effectiveExistingInvoice.taxRate ?? 0,
                  taxAmount: effectiveExistingInvoice.taxAmount ?? 0,
                  total: effectiveExistingInvoice.total,
                  notes: effectiveExistingInvoice.notes ?? undefined,
                  customMessage: gmailMessage.trim() || undefined,
                  paymentLink: payUrl,
                  logoSrc: logoUrl ? `${base}${logoUrl}` : null,
                }) : ""}
                style={{ width: "100%", height: "320px", border: "none", display: "block" }}
              />
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
              <div className="flex items-center gap-2 pt-0.5">
                <button onClick={handleGmailSend}
                  disabled={gmailSending || !gmailTo.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                  {gmailSending ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-3 h-3" />}
                  {gmailSending ? "Sending…" : "Send Invoice"}
                </button>
                <p className="text-[10px] text-blue-500">Sends from your Gmail with PDF attached</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !submitting && onOpenChange(false)} />
      <div className="relative w-full bg-white shadow-2xl rounded-2xl flex flex-col overflow-hidden"
        style={{ maxWidth: "min(96vw, 1100px)", maxHeight: "96vh" }}>

        {/* ── Unified Toolbar ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 truncate">
              {isEdit ? `Invoice ${effectiveExistingInvoice!.invoiceNumber}` : "New Invoice"}
            </h2>
            {isEdit && (
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${STATUS_COLORS[effectiveExistingInvoice!.status] ?? "bg-gray-100 text-gray-600"}`}>
                {effectiveExistingInvoice!.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Print */}
            <button type="button" onClick={handlePrint}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>

            {/* Gmail */}
            {googleConfigured && isEdit && (
              <button type="button" onClick={handleGmailButtonClick}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${showGmailCompose ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"}`}
                title={googleConnected ? "Send via Gmail" : "Connect Google to send via Gmail"}>
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Gmail</span>
              </button>
            )}

            {/* Payment Link */}
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
                  <button type="button"
                    onClick={handleRemovePaymentLink}
                    disabled={removingLink}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="Remove payment link">
                    {removingLink
                      ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      : <X className="w-3.5 h-3.5" />
                    }
                    <span className="hidden sm:inline">Remove</span>
                  </button>
                </div>
              ) : (
                <button type="button"
                  onClick={handleGetPaymentLink}
                  disabled={generatingLink}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-40"
                  title="Get Square payment link">
                  {generatingLink
                    ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <CreditCard className="w-3.5 h-3.5" />
                  }
                  <span className="hidden sm:inline">{generatingLink ? "Generating…" : "Payment Link"}</span>
                </button>
              )
            )}

            {/* Delete */}
            {isEdit && onDelete && (
              <button type="button" onClick={onDelete}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}

            {/* Save */}
            <button type="button" onClick={handleSubmit} disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl font-bold text-sm bg-amber-500 text-white hover:bg-amber-600 shadow transition-all active:scale-95 disabled:opacity-60">
              {submitting
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Check className="w-4 h-4" />
              }
              {submitting ? "Saving…" : "Save"}
            </button>

            {/* Close */}
            <button type="button" onClick={() => !submitting && onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors ml-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile tab switcher */}
        <div className="flex lg:hidden border-b border-gray-100 flex-shrink-0 bg-white">
          <button
            className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${mobileTab === "edit" ? "border-amber-500 text-amber-600" : "border-transparent text-gray-400"}`}
            onClick={() => setMobileTab("edit")}>
            Edit
          </button>
          <button
            className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${mobileTab === "preview" ? "border-amber-500 text-amber-600" : "border-transparent text-gray-400"}`}
            onClick={() => setMobileTab("preview")}>
            <Eye className="w-3 h-3 inline mr-1" />Preview
          </button>
        </div>

        {/* Error banner */}
        {formError && (
          <div className="mx-4 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2 flex-shrink-0">
            <X className="w-4 h-4 flex-shrink-0" /> {formError}
          </div>
        )}

        {/* Gmail compose panel */}
        {showGmailCompose && isEdit && <GmailComposePanel />}

        {/* ── Main body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* Left: Edit form */}
          <div className={`${mobileTab === "preview" ? "hidden" : "flex"} lg:flex flex-col w-full lg:w-[42%] border-r border-gray-100 overflow-y-auto`}>
            <div className="p-4">
              <EditForm />
            </div>
          </div>

          {/* Right: Live preview */}
          <div className={`${mobileTab === "edit" ? "hidden" : "flex"} lg:flex flex-col flex-1 overflow-y-auto bg-gray-50`}>
            <div className="p-4">
              <PreviewContent />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
