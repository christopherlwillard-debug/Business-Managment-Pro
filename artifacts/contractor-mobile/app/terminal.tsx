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
import type { Reader } from "@stripe/stripe-terminal-react-native";
import {
  StripeTerminalProvider,
  useStripeTerminal,
} from "@stripe/stripe-terminal-react-native";
import { useAuth } from "@/context/AuthContext";
import { usePaymentSession, type ReceiptData } from "@/context/PaymentSession";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type Phase =
  | "init"
  | "connecting"
  | "ready"
  | "collecting"
  | "confirming"
  | "success"
  | "error"
  | "unavailable";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function extractCardDetails(pi: Record<string, unknown>): {
  last4: string | null;
  brand: string | null;
} {
  const charges = pi["charges"];
  if (!charges || typeof charges !== "object") return { last4: null, brand: null };
  const data = (charges as Record<string, unknown>)["data"];
  if (!Array.isArray(data) || data.length === 0) return { last4: null, brand: null };
  const charge = data[0] as Record<string, unknown>;
  const pmd = charge["paymentMethodDetails"] as Record<string, unknown> | undefined;
  if (!pmd) return { last4: null, brand: null };
  const cp = pmd["cardPresent"] as Record<string, unknown> | undefined;
  if (!cp) return { last4: null, brand: null };
  return {
    last4: typeof cp["last4"] === "string" ? cp["last4"] : null,
    brand: typeof cp["brand"] === "string" ? cp["brand"] : null,
  };
}

class TerminalBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(err: Error): void {
    console.warn("[terminal] SDK boundary caught:", err.message);
  }
  render(): React.ReactNode {
    if (this.state.hasError) return <NativeUnavailableView />;
    return this.props.children;
  }
}

function NativeUnavailableView() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centeredCard}>
        <Text style={styles.bigEmoji}>📱</Text>
        <Text style={styles.unavailableTitle}>Native Build Required</Text>
        <Text style={styles.unavailableText}>
          Tap to Pay on iPhone requires a native Expo Dev Client build.
          {"\n\n"}Build with:{"\n"}eas build --profile development{"\n\n"}
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
    </SafeAreaView>
  );
}

export default function TerminalScreen() {
  const { sessionToken } = useAuth();
  const locationIdRef = useRef<string>("");

  const tokenProvider = useCallback(async (): Promise<string> => {
    const res = await fetch(`${BASE_URL}/api/terminal/connection-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken ?? ""}` },
    });
    if (!res.ok) throw new Error("Failed to get connection token");
    const data = (await res.json()) as { secret: string; locationId: string | null };
    if (data.locationId) locationIdRef.current = data.locationId;
    return data.secret;
  }, [sessionToken]);

  return (
    <TerminalBoundary>
      <StripeTerminalProvider logLevel="none" tokenProvider={tokenProvider}>
        <TerminalFlow sessionToken={sessionToken} locationIdRef={locationIdRef} />
      </StripeTerminalProvider>
    </TerminalBoundary>
  );
}

interface TerminalFlowProps {
  sessionToken: string | null;
  locationIdRef: React.MutableRefObject<string>;
}

function TerminalFlow({ sessionToken, locationIdRef }: TerminalFlowProps) {
  const [localDiscoveredReaders, setLocalDiscoveredReaders] = useState<Reader.Type[]>([]);

  const {
    initialize,
    discoverReaders,
    connectReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    connectedReader,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (updatedReaders) => {
      setLocalDiscoveredReaders(updatedReaders);
    },
  });

  const { session, setPaymentDetails } = usePaymentSession();
  const [phase, setPhase] = useState<Phase>("init");
  const [errorMsg, setErrorMsg] = useState("");
  const clientSecretRef = useRef<string | null>(null);

  useEffect(() => {
    async function setup() {
      try {
        await initialize();
        setPhase("connecting");
        const result = await discoverReaders({
          discoveryMethod: "tapToPay",
          simulated: false,
        });
        if (result.error) {
          throw new Error(result.error.message ?? "Reader discovery failed");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Initialization failed";
        const isNativeError =
          msg.includes("null") ||
          msg.includes("NativeModules") ||
          msg.toLowerCase().includes("native") ||
          msg.toLowerCase().includes("nativeeventemitter");
        if (isNativeError) {
          setPhase("unavailable");
        } else {
          setErrorMsg(msg);
          setPhase("error");
        }
      }
    }
    setup();
  }, []);

  useEffect(() => {
    if (
      localDiscoveredReaders.length === 0 ||
      connectedReader !== null ||
      phase !== "connecting"
    ) {
      return;
    }
    const reader = localDiscoveredReaders[0];
    connectReader({
      discoveryMethod: "tapToPay",
      reader,
      locationId: locationIdRef.current,
    })
      .then((result) => {
        if (result.error) {
          setErrorMsg(result.error.message ?? "Failed to connect reader");
          setPhase("error");
        } else {
          setPhase("ready");
        }
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : "Connection failed");
        setPhase("error");
      });
  }, [localDiscoveredReaders, connectedReader, phase]);

  async function handleCharge() {
    setPhase("collecting");
    setErrorMsg("");
    try {
      const piRes = await fetch(`${BASE_URL}/api/terminal/payment-intent`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountCents: session.amountCents,
          currency: "usd",
          description: session.description || undefined,
          invoiceId: session.invoiceId ?? undefined,
        }),
      });
      if (!piRes.ok) {
        const body = (await piRes.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to create payment intent");
      }
      const piData = (await piRes.json()) as {
        paymentIntentId: string;
        clientSecret: string;
      };
      clientSecretRef.current = piData.clientSecret;
      setPaymentDetails({
        paymentIntentId: piData.paymentIntentId,
        clientSecret: piData.clientSecret,
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const retrieveResult = await retrievePaymentIntent(piData.clientSecret);
      if (retrieveResult.error || !retrieveResult.paymentIntent) {
        throw new Error(
          retrieveResult.error?.message ?? "Failed to retrieve payment intent",
        );
      }

      const collectResult = await collectPaymentMethod({
        paymentIntent: retrieveResult.paymentIntent,
      });
      if (collectResult.error || !collectResult.paymentIntent) {
        throw new Error(
          collectResult.error?.message ?? "Payment collection failed",
        );
      }

      setPhase("confirming");

      const confirmResult = await confirmPaymentIntent({
        paymentIntent: collectResult.paymentIntent,
      });
      if (confirmResult.error) {
        throw new Error(
          confirmResult.error.message ?? "Payment confirmation failed",
        );
      }

      const confirmedPi = confirmResult.paymentIntent as unknown as Record<string, unknown> | undefined;
      const { last4, brand } = confirmedPi
        ? extractCardDetails(confirmedPi)
        : { last4: null, brand: null };

      const receipt: ReceiptData = {
        paymentIntentId: piData.paymentIntentId,
        amountCents: session.amountCents,
        description: session.description || null,
        invoiceNumber: session.invoiceNumber,
        clientName: session.clientName,
        paidAt: new Date(),
        last4,
        brand,
      };

      setPaymentDetails({ receipt });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase("success");
      setTimeout(() => router.replace("/receipt"), 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setErrorMsg(msg);
      setPhase("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  if (phase === "unavailable") {
    return <NativeUnavailableView />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.navBack}
          disabled={phase === "collecting" || phase === "confirming"}
        >
          <Text
            style={[
              styles.navBackText,
              (phase === "collecting" || phase === "confirming") && styles.navBackDisabled,
            ]}
          >
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
        {(phase === "init" || phase === "ready") && (
          <>
            <Text style={styles.stateEmoji}>📱</Text>
            <Text style={styles.stateTitle}>Ready to Charge</Text>
            <Text style={styles.stateText}>
              Tap the button below to begin. Your iPhone will act as the card
              reader — ask the customer to hold their card or phone near yours
              when prompted.
            </Text>
            <TouchableOpacity
              style={styles.chargeBtn}
              onPress={handleCharge}
              activeOpacity={0.85}
            >
              <Text style={styles.chargeBtnText}>
                Charge {formatCents(session.amountCents)}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {phase === "connecting" && (
          <>
            <ActivityIndicator size="large" color="#1B3A6B" />
            <Text style={styles.stateTitle}>Connecting…</Text>
            <Text style={styles.stateText}>
              Initializing the Tap to Pay reader on this iPhone
            </Text>
          </>
        )}

        {phase === "collecting" && (
          <>
            <Text style={styles.stateEmoji}>🫳</Text>
            <Text style={styles.stateTitle}>Hold Card Near iPhone</Text>
            <Text style={styles.stateText}>
              iOS will guide the customer through the tap. Keep the phone still
              until the tap completes.
            </Text>
            <ActivityIndicator
              size="small"
              color="#64748B"
              style={{ marginTop: 8 }}
            />
          </>
        )}

        {phase === "confirming" && (
          <>
            <ActivityIndicator size="large" color="#1B3A6B" />
            <Text style={styles.stateTitle}>Processing…</Text>
            <Text style={styles.stateText}>Confirming payment with Stripe</Text>
          </>
        )}

        {phase === "success" && (
          <>
            <Text style={styles.stateEmoji}>✅</Text>
            <Text style={styles.stateTitle}>Payment Successful!</Text>
            <Text style={styles.stateText}>Redirecting to receipt…</Text>
          </>
        )}

        {phase === "error" && (
          <>
            <Text style={styles.stateEmoji}>❌</Text>
            <Text style={styles.stateTitle}>Payment Failed</Text>
            <Text style={styles.stateText}>{errorMsg}</Text>
            <TouchableOpacity
              style={[styles.chargeBtn, { marginTop: 24 }]}
              onPress={() => {
                setPhase("ready");
                setErrorMsg("");
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.chargeBtnText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
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
  navBackText: {
    fontSize: 15,
    color: "#1B3A6B",
    fontFamily: "Inter_500Medium",
  },
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
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 24 },
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
