import { useState } from "react";
import { Loader2, CreditCard, ShieldCheck } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DepositContent {
  heading: string;
  description: string;
  amount: number;
  buttonLabel: string;
  allowCustomAmount?: boolean;
}

interface DepositSectionProps {
  content: DepositContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: DepositContent) => void;
  businessSlug?: string;
  blockStyle?: BlockStyle;
}

export function DepositSection({ content, settings, isEditing, onChange, businessSlug, blockStyle }: DepositSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customAmount, setCustomAmount] = useState<string>(String(content.amount ?? 250));

  function update(patch: Partial<DepositContent>) {
    onChange?.({ ...content, ...patch });
  }

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
        setError(`Minimum deposit is ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(minAmount)}.`);
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
      const res = await fetch(`${BASE}/api/public/site/${businessSlug}/create-deposit-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error ?? "Failed to create payment link");
      }
      const { checkoutUrl } = await res.json() as { checkoutUrl: string };
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(content.amount ?? 0);

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
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={!!content.allowCustomAmount}
                onChange={e => update({ allowCustomAmount: e.target.checked })}
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
            </label>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Allow visitors to enter a custom amount
            </span>
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
          className="bg-white p-8 text-center"
          style={{
            borderRadius: "var(--theme-card-radius, 1rem)",
            boxShadow: "var(--theme-card-shadow, 0 4px 12px rgba(0,0,0,0.10))",
            border: "var(--theme-card-border, 1px solid #f3f4f6)",
          }}
        >
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
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-5 leading-relaxed">
              {content.description}
            </p>
          )}
          {content.allowCustomAmount ? (
            <div className="mb-6">
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
            <p className="text-4xl font-bold mb-6" style={{ color: settings.brandColor }}>
              {formattedAmount}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-3 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
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
