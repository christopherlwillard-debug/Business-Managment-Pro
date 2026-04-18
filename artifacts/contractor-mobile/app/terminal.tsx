import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { usePaymentSession } from "@/context/PaymentSession";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type Phase =
  | "init"
  | "connecting"
  | "ready"
  | "collecting"
  | "confirming"
  | "success"
  | "error"
  | "native_unavailable";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

class TerminalErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (e: Error) => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    this.props.onError(err);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function NativeUnavailableView() {
  return (
    <View style={styles.centeredCard}>
      <Text style={styles.bigEmoji}>📱</Text>
      <Text style={styles.unavailableTitle}>Native Build Required</Text>
      <Text style={styles.unavailableText}>
        Tap to Pay on iPhone requires a native Expo Dev Client build.{"\n\n"}
        Build with:{"\n"}
        <Text style={styles.code}>eas build --profile development</Text>
        {"\n\n"}
        Install on iPhone 16+ running iOS 16+.{"\n\n"}
        Stripe Terminal approval is also required from your Stripe Dashboard.
      </Text>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Text style={styles.backBtnText}>← Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TerminalScreen() {
  const { sessionToken } = useAuth();
  const { session, setPaymentDetails } = usePaymentSession();
  const [phase, setPhase] = useState<Phase>("init");
  const [errorMsg, setErrorMsg] = useState("");
  const [nativeAvailable, setNativeAvailable] = useState<boolean | null>(null);

  const tokenRef = useRef<string | null>(null);
  const locationIdRef = useRef<string | null>(null);

  async function fetchConnectionToken(): Promise<{
    secret: string;
    locationId: string | null;
  }> {
    const res = await fetch(`${BASE_URL}/api/terminal/connection-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!res.ok) throw new Error("Failed to get connection token");
    return res.json();
  }

  async function createPaymentIntent(): Promise<{
    paymentIntentId: string;
    clientSecret: string;
  }> {
    const res = await fetch(`${BASE_URL}/api/terminal/payment-intent`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amountCents: session.amountCents,
        currency: "usd",
        description: session.description || undefined,
        invoiceId: session.invoiceId || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? "Failed to create payment intent");
    }
    return res.json();
  }

  useEffect(() => {
    async function tryInitStripeTerminal() {
      try {
        const StripeTerminalModule = await import(
          "@stripe/stripe-terminal-react-native"
        );
        setNativeAvailable(true);
        return StripeTerminalModule;
      } catch {
        setNativeAvailable(false);
        setPhase("native_unavailable");
        return null;
      }
    }
    tryInitStripeTerminal();
  }, []);

  async function handleCollect() {
    setPhase("connecting");
    setErrorMsg("");

    try {
      const sdk = await import("@stripe/stripe-terminal-react-native");

      const { secret, locationId } = await fetchConnectionToken();
      tokenRef.current = secret;
      locationIdRef.current = locationId;

      await sdk.initialize({
        fetchConnectionToken: async () => {
          if (tokenRef.current) {
            const t = tokenRef.current;
            tokenRef.current = null;
            return t;
          }
          const { secret: s } = await fetchConnectionToken();
          return s;
        },
        onUnexpectedReaderDisconnect: () => {
          console.warn("[terminal] Reader disconnected unexpectedly");
        },
      });

      setPhase("connecting");

      const { readers, error: discoverError } = await sdk.discoverReaders({
        discoveryMethod: "localMobile",
        simulated: false,
      });

      if (discoverError) throw new Error(discoverError.message);
      if (!readers || readers.length === 0)
        throw new Error("No local mobile reader found");

      const { error: connectError } = await sdk.connectLocalMobileReader({
        reader: readers[0],
        locationId: locationIdRef.current ?? undefined,
      });

      if (connectError) throw new Error(connectError.message);

      setPhase("ready");

      const { paymentIntentId, clientSecret } = await createPaymentIntent();
      setPaymentDetails({ paymentIntentId, clientSecret });

      setPhase("collecting");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const { paymentIntent: collected, error: collectError } =
        await sdk.collectPaymentMethod({
          paymentIntentClientSecret: clientSecret,
        });

      if (collectError) throw new Error(collectError.message);

      setPhase("confirming");

      const { paymentIntent: confirmed, error: confirmError } =
        await sdk.confirmPaymentIntent({
          paymentIntentClientSecret: clientSecret,
        });

      if (confirmError) throw new Error(confirmError.message);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const charge = (confirmed as any)?.charges?.data?.[0];
      const paymentMethod = charge?.payment_method_details?.card_present;

      setPaymentDetails({
        receipt: {
          paymentIntentId: confirmed?.id ?? paymentIntentId,
          amountCents: session.amountCents,
          description: session.description,
          invoiceNumber: session.invoiceNumber,
          clientName: session.clientName,
          paidAt: new Date(),
          last4: paymentMethod?.last4 ?? null,
          brand: paymentMethod?.brand ?? null,
        },
      });

      setPhase("success");
      setTimeout(() => router.replace("/receipt"), 800);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setErrorMsg(msg);
      setPhase("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  if (nativeAvailable === null) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#1B3A6B" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (nativeAvailable === false || phase === "native_unavailable") {
    return (
      <SafeAreaView style={styles.container}>
        <NativeUnavailableView />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (phase !== "collecting" && phase !== "confirming") {
              router.back();
            }
          }}
          style={styles.navBack}
          disabled={phase === "collecting" || phase === "confirming"}
        >
          <Text style={[styles.navBackText, (phase === "collecting" || phase === "confirming") && styles.navBackDisabled]}>
            ← Back
          </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tap to Pay</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.amountCard}>
        <Text style={styles.amountLabel}>Charging</Text>
        <Text style={styles.amount}>{formatCents(session.amountCents)}</Text>
        {session.description ? (
          <Text style={styles.amountNote}>{session.description}</Text>
        ) : null}
        {session.invoiceNumber ? (
          <Text style={styles.amountNote}>Invoice #{session.invoiceNumber}</Text>
        ) : null}
      </View>

      <View style={styles.stateCard}>
        {phase === "init" || phase === "ready" ? (
          <>
            <Text style={styles.stateEmoji}>📱</Text>
            <Text style={styles.stateTitle}>Ready to Charge</Text>
            <Text style={styles.stateText}>
              Tap the button below to begin. Your iPhone will act as the
              card reader — ask the customer to hold their card or phone
              near yours when prompted.
            </Text>
            <TouchableOpacity
              style={styles.chargeBtn}
              onPress={handleCollect}
              activeOpacity={0.85}
            >
              <Text style={styles.chargeBtnText}>
                Charge {formatCents(session.amountCents)}
              </Text>
            </TouchableOpacity>
          </>
        ) : phase === "connecting" ? (
          <>
            <ActivityIndicator size="large" color="#1B3A6B" />
            <Text style={styles.stateTitle}>Connecting…</Text>
            <Text style={styles.stateText}>
              Initializing the Tap to Pay reader
            </Text>
          </>
        ) : phase === "collecting" ? (
          <>
            <Text style={styles.stateEmoji}>🫳</Text>
            <Text style={styles.stateTitle}>Hold Card Near iPhone</Text>
            <Text style={styles.stateText}>
              iOS will guide the customer through the tap. Keep the phone
              still until the tap completes.
            </Text>
            <ActivityIndicator size="small" color="#64748B" style={{ marginTop: 8 }} />
          </>
        ) : phase === "confirming" ? (
          <>
            <ActivityIndicator size="large" color="#1B3A6B" />
            <Text style={styles.stateTitle}>Processing…</Text>
            <Text style={styles.stateText}>Confirming payment with Stripe</Text>
          </>
        ) : phase === "success" ? (
          <>
            <Text style={styles.stateEmoji}>✅</Text>
            <Text style={styles.stateTitle}>Payment Successful!</Text>
            <Text style={styles.stateText}>Redirecting to receipt…</Text>
          </>
        ) : phase === "error" ? (
          <>
            <Text style={styles.stateEmoji}>❌</Text>
            <Text style={styles.stateTitle}>Payment Failed</Text>
            <Text style={styles.stateText}>{errorMsg}</Text>
            <TouchableOpacity
              style={[styles.chargeBtn, { marginTop: 24 }]}
              onPress={() => { setPhase("ready"); setErrorMsg(""); }}
              activeOpacity={0.85}
            >
              <Text style={styles.chargeBtnText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => router.back()}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F9FC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  navBack: { padding: 8 },
  navBackText: { fontSize: 15, color: "#1B3A6B", fontFamily: "Inter_500Medium" },
  navBackDisabled: { color: "#CBD5E1" },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1B3A6B",
    fontFamily: "Inter_600SemiBold",
  },
  amountCard: {
    margin: 20,
    backgroundColor: "#1B3A6B",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 4,
  },
  amountLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  amount: {
    fontSize: 48,
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  amountNote: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_400Regular",
  },
  stateCard: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  stateEmoji: { fontSize: 48, marginBottom: 4 },
  stateTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1B3A6B",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  stateText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  chargeBtn: {
    backgroundColor: "#E8621A",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 16,
    width: "100%",
    alignItems: "center",
  },
  chargeBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelBtnText: {
    fontSize: 15,
    color: "#94A3B8",
    fontFamily: "Inter_500Medium",
  },
  centeredCard: {
    flex: 1,
    margin: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  bigEmoji: { fontSize: 56 },
  unavailableTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1B3A6B",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  unavailableText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#475569",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  code: {
    fontFamily: "monospace",
    backgroundColor: "#F1F5F9",
    color: "#1B3A6B",
    fontSize: 13,
  },
  backBtn: {
    backgroundColor: "#1B3A6B",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 8,
    alignItems: "center",
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
  },
});
