import { useState } from "react";
import { Loader2, CreditCard, ShieldCheck } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DepositContent {
  heading: string;
  description: string;
  amount: number;
  buttonLabel: string;
}

interface DepositSectionProps {
  content: DepositContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: DepositContent) => void;
  businessSlug?: string;
}

export function DepositSection({ content, settings, isEditing, onChange, businessSlug }: DepositSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update(patch: Partial<DepositContent>) {
    onChange?.({ ...content, ...patch });
  }

  async function handlePayNow() {
    if (!businessSlug) return;
    setLoading(true);
    setError("");
    try {
      const returnUrl = window.location.origin + window.location.pathname;
      const res = await fetch(`${BASE}/api/public/site/${businessSlug}/create-deposit-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl }),
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
      <div className="py-12 px-6 bg-gray-50 dark:bg-gray-800/40">
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
              Deposit Amount ($)
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
      </div>
    );
  }

  return (
    <div className="py-16 px-6 bg-gray-50 dark:bg-gray-900" id="deposit">
      <div className="max-w-lg mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 p-8 text-center">
          <div
            className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center"
            style={{ backgroundColor: settings.brandColor + "22" }}
          >
            <CreditCard className="w-6 h-6" style={{ color: settings.brandColor }} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            {content.heading || "Reserve Your Spot"}
          </h2>
          {content.description && (
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-5 leading-relaxed">
              {content.description}
            </p>
          )}
          <p className="text-4xl font-bold mb-6" style={{ color: settings.brandColor }}>
            {formattedAmount}
          </p>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-3 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            onClick={handlePayNow}
            disabled={loading || !businessSlug}
            className="w-full py-4 rounded-xl text-white font-semibold text-lg transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: settings.brandColor }}
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
    </div>
  );
}
