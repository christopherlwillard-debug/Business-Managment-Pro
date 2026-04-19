import { useEffect, useState, useCallback } from "react";
import { useParams } from "wouter";
import { CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PayPageData {
  type: "invoice" | "quick_charge";
  squarePaymentLinkUrl?: string;
  amountCents: number;
  description: string;
  businessName: string;
  paidAt?: string | null;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function Pay() {
  const params = useParams<{ payToken: string }>();
  const payToken = params.payToken;

  const [data, setData] = useState<PayPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const load = useCallback(async () => {
    if (!payToken) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${BASE}/api/pay/${payToken}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const json = await res.json() as PayPageData;
      setData(json);

      if (json.squarePaymentLinkUrl && !json.paidAt) {
        setRedirecting(true);
        window.location.href = json.squarePaymentLinkUrl;
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load payment");
    } finally {
      setLoading(false);
    }
  }, [payToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400" />

          <div className="p-6 border-b border-gray-100">
            {loading || redirecting ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-8 bg-gray-200 rounded w-2/3" />
              </div>
            ) : fetchError ? null : data ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
                  {data.businessName}
                </p>
                <p className="text-sm text-gray-600 mb-2">{data.description}</p>
                <p className="text-3xl font-black text-gray-900">
                  {formatMoney(data.amountCents)}
                </p>
              </>
            ) : null}
          </div>

          <div className="p-6">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-12 bg-gray-100 rounded-xl" />
                <div className="h-12 bg-amber-100 rounded-xl" />
              </div>
            ) : redirecting ? (
              <div className="text-center space-y-3 py-4">
                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-gray-500">Redirecting to Square checkout…</p>
              </div>
            ) : fetchError ? (
              <div className="text-center space-y-3 py-4">
                <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                <p className="font-semibold text-gray-900">Payment link unavailable</p>
                <p className="text-sm text-gray-500">{fetchError}</p>
              </div>
            ) : data?.paidAt ? (
              <div className="text-center space-y-3 py-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <p className="text-xl font-black text-gray-900">All paid up!</p>
                <p className="text-sm text-gray-500">
                  This payment was received on{" "}
                  {new Date(data.paidAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  . Thank you for your business!
                </p>
                <p className="text-xs text-gray-400 font-medium">{data.businessName}</p>
              </div>
            ) : data?.squarePaymentLinkUrl ? (
              <div className="text-center space-y-3 py-4">
                <a
                  href={data.squarePaymentLinkUrl}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-base transition-colors shadow-md"
                >
                  <ExternalLink className="w-4 h-4" />
                  Pay {formatMoney(data.amountCents)} with Square
                </a>
                <p className="text-xs text-gray-400">
                  You'll be taken to Square's secure checkout page.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Powered by Square · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
