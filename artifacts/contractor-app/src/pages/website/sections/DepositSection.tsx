import { useState, useEffect } from "react";
import { Loader2, CreditCard, ShieldCheck, User, Mail, Phone, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CustomerFieldConfig {
  show?: boolean;
  required?: boolean;
}

interface DepositContent {
  heading: string;
  description: string;
  amount: number;
  buttonLabel: string;
  allowCustomAmount?: boolean;
  collectCustomerInfo?: boolean;
  fieldName?: CustomerFieldConfig;
  fieldEmail?: CustomerFieldConfig;
  fieldPhone?: CustomerFieldConfig;
  fieldNotes?: CustomerFieldConfig;
}

interface DepositSectionProps {
  content: DepositContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: DepositContent) => void;
  businessSlug?: string;
  blockStyle?: BlockStyle;
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
    </label>
  );
}

function FieldConfigRow({
  label,
  fieldKey,
  cfg,
  onUpdate,
}: {
  label: string;
  fieldKey: keyof Pick<DepositContent, "fieldName" | "fieldEmail" | "fieldPhone" | "fieldNotes">;
  cfg: CustomerFieldConfig | undefined;
  onUpdate: (key: typeof fieldKey, v: CustomerFieldConfig) => void;
}) {
  const show = cfg?.show ?? true;
  const required = cfg?.required ?? (fieldKey === "fieldName" || fieldKey === "fieldEmail");
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-gray-700 dark:text-gray-300 flex-1">{label}</span>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <ToggleSwitch checked={show} onChange={v => onUpdate(fieldKey, { show: v, required: v ? required : false })} />
          <span className="text-xs text-gray-500 dark:text-gray-400 w-8">{show ? "On" : "Off"}</span>
        </div>
        {show && (
          <div className="flex items-center gap-1.5">
            <ToggleSwitch
              checked={required}
              onChange={v => onUpdate(fieldKey, { show, required: v })}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400 w-14">{required ? "Required" : "Optional"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function DepositSection({ content, settings, isEditing, onChange, businessSlug, blockStyle }: DepositSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customAmount, setCustomAmount] = useState<string>(String(content.amount ?? 250));

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  const [showFieldConfig, setShowFieldConfig] = useState(false);
  const [prefillLoaded, setPrefillLoaded] = useState(false);

  const collectCustomerInfo = content.collectCustomerInfo !== false;

  useEffect(() => {
    if (isEditing || prefillLoaded || !collectCustomerInfo || !businessSlug) return;
    const params = new URLSearchParams(window.location.search);
    const contactId = params.get("contactId");
    if (!contactId) return;
    setPrefillLoaded(true);
    fetch(`${BASE}/api/public/site/${businessSlug}/contact-prefill?contactId=${encodeURIComponent(contactId)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { name?: string; email?: string; phone?: string } | null) => {
        if (!data) return;
        if (data.name) setCustomerName(data.name);
        if (data.email) setCustomerEmail(data.email);
        if (data.phone) setCustomerPhone(data.phone);
      })
      .catch(() => {});
  }, [isEditing, collectCustomerInfo, businessSlug, prefillLoaded]);

  const fieldName  = { show: true,  required: true,  ...content.fieldName };
  const fieldEmail = { show: true,  required: true,  ...content.fieldEmail };
  const fieldPhone = { show: false, required: false, ...content.fieldPhone };
  const fieldNotes = { show: false, required: false, ...content.fieldNotes };

  function update(patch: Partial<DepositContent>) {
    onChange?.({ ...content, ...patch });
  }

  function updateFieldCfg(key: keyof Pick<DepositContent, "fieldName" | "fieldEmail" | "fieldPhone" | "fieldNotes">, v: CustomerFieldConfig) {
    onChange?.({ ...content, [key]: v });
  }

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(content.amount ?? 0);

  async function handlePayNow() {
    if (!businessSlug) return;

    const parsedCustom = parseFloat(customAmount);
    const minAmount = content.amount ?? 0;

    if (content.allowCustomAmount) {
      if (isNaN(parsedCustom) || parsedCustom <= 0) {
        setError("Please enter a valid amount.");
        return;
      }
      if (parsedCustom < minAmount) {
        setError(`Minimum deposit is ${formattedAmount}.`);
        return;
      }
    }

    if (collectCustomerInfo) {
      if (fieldName.show && fieldName.required && !customerName.trim()) {
        setError("Please enter your name.");
        return;
      }
      if (fieldEmail.show && fieldEmail.required && !customerEmail.trim()) {
        setError("Please enter your email address.");
        return;
      }
      if (fieldEmail.show && customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
        setError("Please enter a valid email address.");
        return;
      }
      if (fieldPhone.show && fieldPhone.required && !customerPhone.trim()) {
        setError("Please enter your phone number.");
        return;
      }
      if (fieldNotes.show && fieldNotes.required && !customerNotes.trim()) {
        setError("Please fill in the notes field.");
        return;
      }
    }

    setLoading(true);
    setError("");
    try {
      const returnUrl = window.location.origin + window.location.pathname;
      const body: Record<string, unknown> = { returnUrl };

      if (content.allowCustomAmount && !isNaN(parsedCustom) && parsedCustom !== minAmount) {
        body.customAmount = parsedCustom;
      }

      let endpoint: string;
      if (collectCustomerInfo) {
        endpoint = `${BASE}/api/public/site/${businessSlug}/deposit-submit`;
        body.customerName = customerName.trim();
        body.customerEmail = customerEmail.trim();
        if (fieldPhone.show && customerPhone.trim()) body.customerPhone = customerPhone.trim();
        if (fieldNotes.show && customerNotes.trim()) body.customerNotes = customerNotes.trim();
      } else {
        endpoint = `${BASE}/api/public/site/${businessSlug}/create-deposit-link`;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, unknown>).error as string ?? "Failed to create payment link");
      }
      const { checkoutUrl } = await res.json() as { checkoutUrl: string };
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (isEditing) {
    return (
      <BlockStyleWrapper
        wrapperClassName="py-12 px-6 bg-gray-50 dark:bg-gray-800/40"
        blockStyle={blockStyle}
        isEditing={isEditing}
      >
        <div className="max-w-lg mx-auto bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 space-y-4">
          <input
            className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-gray-200 focus:border-blue-500 outline-none w-full"
            value={content.heading}
            onChange={e => update({ heading: e.target.value })}
            placeholder="Reserve Your Spot"
          />
          <textarea
            className="text-gray-500 dark:text-gray-400 bg-transparent border border-gray-200 rounded-lg focus:border-blue-500 outline-none w-full text-sm p-2 resize-none"
            rows={2}
            value={content.description}
            onChange={e => update({ description: e.target.value })}
            placeholder="Secure your project date with a deposit. Pay online in minutes."
          />
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
              {content.allowCustomAmount ? "Minimum Amount ($)" : "Deposit Amount ($)"}
            </label>
            <input
              type="number"
              min={1}
              step={1}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm w-28 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={content.amount}
              onChange={e => update({ amount: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Button Label
            </label>
            <input
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm flex-1 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={content.buttonLabel}
              onChange={e => update({ buttonLabel: e.target.value })}
              placeholder="Pay Deposit Now"
            />
          </div>
          <div className="flex items-center gap-3">
            <ToggleSwitch
              checked={!!content.allowCustomAmount}
              onChange={v => update({ allowCustomAmount: v })}
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Allow visitors to enter a custom amount
            </span>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <button
              type="button"
              className="flex items-center justify-between w-full text-sm font-medium text-gray-700 dark:text-gray-300"
              onClick={() => setShowFieldConfig(v => !v)}
            >
              <span>Customer Info Fields</span>
              {showFieldConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showFieldConfig && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3 pb-2 border-b border-gray-100 dark:border-gray-800">
                  <ToggleSwitch
                    checked={content.collectCustomerInfo !== false}
                    onChange={v => update({ collectCustomerInfo: v })}
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Collect customer info before checkout
                  </span>
                </div>
                {content.collectCustomerInfo !== false && (
                  <div className="space-y-2.5 pl-1">
                    <FieldConfigRow label="Name" fieldKey="fieldName" cfg={content.fieldName} onUpdate={updateFieldCfg} />
                    <FieldConfigRow label="Email" fieldKey="fieldEmail" cfg={content.fieldEmail} onUpdate={updateFieldCfg} />
                    <FieldConfigRow label="Phone" fieldKey="fieldPhone" cfg={content.fieldPhone} onUpdate={updateFieldCfg} />
                    <FieldConfigRow label="Notes / message" fieldKey="fieldNotes" cfg={content.fieldNotes} onUpdate={updateFieldCfg} />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              disabled
              className="w-full py-3 rounded-xl text-white font-semibold text-base opacity-80 cursor-default flex items-center justify-center gap-2"
              style={{ backgroundColor: settings.brandColor }}
            >
              <CreditCard className="w-4 h-4" />
              {content.buttonLabel || "Pay Deposit Now"} · {formattedAmount}
            </button>
            <p className="text-xs text-center text-gray-400 mt-2">
              Preview — button is active on the published site
            </p>
          </div>
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper
      id="deposit"
      wrapperClassName="py-16 px-6 bg-gray-50 dark:bg-gray-900"
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      <div className="max-w-lg mx-auto">
        <div
          className="bg-white p-8"
          style={{
            borderRadius: "var(--theme-card-radius, 1rem)",
            boxShadow: "var(--theme-card-shadow, 0 4px 12px rgba(0,0,0,0.10))",
            border: "var(--theme-card-border, 1px solid #f3f4f6)",
          }}
        >
          <div className="text-center mb-6">
            <div
              className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center"
              style={{ backgroundColor: settings.brandColor + "22" }}
            >
              <CreditCard className="w-6 h-6" style={{ color: settings.brandColor }} />
            </div>
            <h2 className="text-2xl font-bold mb-3" style={{ color: "var(--theme-text, #111827)" }}>
              {content.heading || "Reserve Your Spot"}
            </h2>
            {content.description && (
              <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                {content.description}
              </p>
            )}
          </div>

          {collectCustomerInfo && (
            <div className="space-y-3 mb-5">
              {fieldName.show && (
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder={`Your name${fieldName.required ? "" : " (optional)"}`}
                    value={customerName}
                    onChange={e => { setCustomerName(e.target.value); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </div>
              )}
              {fieldEmail.show && (
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="email"
                    placeholder={`Email address${fieldEmail.required ? "" : " (optional)"}`}
                    value={customerEmail}
                    onChange={e => { setCustomerEmail(e.target.value); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </div>
              )}
              {fieldPhone.show && (
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="tel"
                    placeholder={`Phone number${fieldPhone.required ? "" : " (optional)"}`}
                    value={customerPhone}
                    onChange={e => { setCustomerPhone(e.target.value); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </div>
              )}
              {fieldNotes.show && (
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                  <textarea
                    rows={3}
                    placeholder={`Notes or message${fieldNotes.required ? "" : " (optional)"}`}
                    value={customerNotes}
                    onChange={e => { setCustomerNotes(e.target.value); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                  />
                </div>
              )}
            </div>
          )}

          {content.allowCustomAmount ? (
            <div className="mb-6 text-center">
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                Deposit Amount (minimum {formattedAmount})
              </label>
              <div className="relative max-w-[180px] mx-auto">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  min={content.amount}
                  step={1}
                  value={customAmount}
                  onChange={e => {
                    setCustomAmount(e.target.value);
                    setError("");
                  }}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-xl pl-7 pr-3 py-2.5 text-xl font-bold text-center bg-white dark:bg-gray-700 focus:outline-none focus:ring-2"
                />
              </div>
            </div>
          ) : (
            <p className="text-4xl font-bold mb-6 text-center" style={{ color: settings.brandColor }}>
              {formattedAmount}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-3 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 text-center">
              {error}
            </p>
          )}
          <button
            onClick={handlePayNow}
            disabled={loading || !businessSlug}
            className="w-full py-4 text-white text-lg transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            style={{
              backgroundColor: settings.brandColor,
              borderRadius: "var(--theme-btn-radius, 0.75rem)",
              fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
              boxShadow: "var(--theme-btn-shadow, none)",
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Redirecting to checkout…
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                {content.buttonLabel || "Pay Now"}
              </>
            )}
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            Secure checkout powered by Square
          </p>
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
