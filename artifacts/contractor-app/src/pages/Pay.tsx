import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { CheckCircle2, AlertCircle, Lock } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

interface PayPageData {
  type: "invoice" | "quick_charge";
  clientSecret?: string;
  amountCents: number;
  currency?: string;
  description: string;
  businessName: string;
  paidAt?: string | null;
}

function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function PayForm({
  data,
  payToken,
  onSuccess,
}: {
  data: PayPageData;
  payToken: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const returnUrl = `${window.location.origin}${BASE}/pay/${payToken}?success=1`;

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });

    if (stripeError) {
      setError(stripeError.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement
        options={{
          layout: "tabs",
          fields: {
            billingDetails: {
              email: "never",
              phone: "never",
              address: "never",
            },
          },
        }}
      />

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-bold rounded-xl text-base transition-colors shadow-md"
      >
        <Lock className="w-4 h-4" />
        {submitting
          ? "Processing…"
          : `Pay ${formatMoney(data.amountCents, data.currency ?? "USD")} Securely`}
      </button>

      <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" />
        Secured by Stripe — Your card info is never stored with {data.businessName}
      </p>
    </form>
  );
}

export default function Pay() {
  const params = useParams<{ payToken: string }>();
  const [location] = useLocation();
  const payToken = params.payToken;

  const [data, setData] = useState<PayPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isSuccess =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("success") === "1";

  const load = useCallback(async () => {
    if (!payToken) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${BASE}/api/pay/${payToken}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load payment");
    } finally {
      setLoading(false);
    }
  }, [payToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (!STRIPE_PK) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="font-bold text-gray-900">Payment Not Configured</h2>
          <p className="text-sm text-gray-500">
            VITE_STRIPE_PUBLISHABLE_KEY is not set. Add your Stripe publishable key to enable online payments.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400" />

          <div className="p-6 border-b border-gray-100">
            {loading ? (
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
                  {formatMoney(data.amountCents, data.currency ?? "USD")}
                </p>
              </>
            ) : null}
          </div>

          <div className="p-6">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-12 bg-gray-100 rounded-xl" />
                <div className="h-12 bg-gray-100 rounded-xl" />
                <div className="h-12 bg-amber-100 rounded-xl" />
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
            ) : isSuccess ? (
              <div className="text-center space-y-3 py-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <p className="text-xl font-black text-gray-900">Payment received!</p>
                <p className="text-sm text-gray-500">
                  Thank you! Your payment is being processed. You'll receive a receipt from Stripe shortly.
                </p>
                <p className="text-xs text-gray-400 font-medium">{data?.businessName}</p>
              </div>
            ) : data?.clientSecret ? (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: data.clientSecret,
                  appearance: {
                    theme: "stripe",
                    variables: {
                      colorPrimary: "#f59e0b",
                      borderRadius: "12px",
                    },
                  },
                }}
              >
                <PayForm data={data} payToken={payToken!} onSuccess={() => {}} />
              </Elements>
            ) : null}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Powered by Stripe · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
