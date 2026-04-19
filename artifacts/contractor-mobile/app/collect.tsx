import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { NumPad } from "@/components/NumPad";
import { usePaymentSession } from "@/context/PaymentSession";

const MAX_CENTS = 9999999;

function formatDisplay(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `$${dollars.toLocaleString()}.${String(remainder).padStart(2, "0")}`;
}

export default function CollectScreen() {
  const { session, setPaymentDetails } = usePaymentSession();
  const [rawCents, setRawCents] = useState(() =>
    session.amountCents > 0 ? String(session.amountCents) : "0",
  );
  const [note, setNote] = useState(session.description ?? "");

  const amountCents = parseInt(rawCents, 10);

  useEffect(() => {
    if (session.amountCents > 0 && session.invoiceId !== null) {
      setRawCents(String(session.amountCents));
    }
  }, [session.amountCents, session.invoiceId]);

  function handleDigit(digit: string) {
    setRawCents((prev) => {
      const next = prev === "0" ? digit : prev + digit;
      if (parseInt(next, 10) > MAX_CENTS) return prev;
      return next;
    });
  }

  function handleDelete() {
    setRawCents((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
  }

  function handleCharge() {
    if (amountCents < 50) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const appId = process.env.EXPO_PUBLIC_SQUARE_APP_ID;
    if (!appId) {
      Alert.alert(
        "Setup required",
        "Square App ID is not configured. Add EXPO_PUBLIC_SQUARE_APP_ID to your environment.",
      );
      return;
    }

    setPaymentDetails({
      amountCents,
      description: note.trim(),
      invoiceId: session.invoiceId,
      invoiceNumber: session.invoiceNumber,
      clientName: session.clientName,
    });

    const callbackUrl = "buildpro://square-callback";
    const posData = JSON.stringify({
      amount_money: { amount: amountCents, currency_code: "USD" },
      callback_url: callbackUrl,
      client_id: appId,
      version: "1.3",
      ...(note.trim() ? { notes: note.trim() } : {}),
    });
    const encoded = btoa(unescape(encodeURIComponent(posData)));
    const squareUrl = `square-commerce-v1://payment/create?data=${encoded}`;

    Linking.canOpenURL(squareUrl)
      .then((canOpen) => {
        if (canOpen) {
          return Linking.openURL(squareUrl);
        }
        Alert.alert(
          "Square POS not installed",
          "Please install the Square Point of Sale app to accept in-person payments.",
        );
      })
      .catch(() => {
        Alert.alert("Could not launch Square POS", "Please try again.");
      });
  }

  function handleInvoicePicker() {
    router.push("/invoices");
  }

  const canCharge = amountCents >= 50;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Collect Payment</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.amountWrap}>
        <Text style={styles.amount}>{formatDisplay(amountCents)}</Text>
        {amountCents > 0 && amountCents < 50 && (
          <Text style={styles.minWarning}>Minimum charge is $0.50</Text>
        )}
      </View>

      {session.invoiceId !== null ? (
        <TouchableOpacity style={styles.invoiceChip} onPress={handleInvoicePicker}>
          <Text style={styles.invoiceChipText}>
            Invoice #{session.invoiceNumber} — {session.clientName}
          </Text>
          <Text style={styles.invoiceChipChange}>Change ›</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.invoiceLink} onPress={handleInvoicePicker}>
          <Text style={styles.invoiceLinkText}>+ Link to an Invoice (optional)</Text>
        </TouchableOpacity>
      )}

      <TextInput
        style={styles.noteInput}
        placeholder="Add a note (optional)"
        placeholderTextColor="#94A3B8"
        value={note}
        onChangeText={setNote}
        maxLength={120}
      />

      <NumPad
        onPress={handleDigit}
        onDelete={handleDelete}
        showDecimal={false}
      />

      <View style={styles.chargeWrap}>
        <TouchableOpacity
          style={[styles.chargeBtn, !canCharge && styles.chargeBtnDisabled]}
          onPress={handleCharge}
          disabled={!canCharge}
          activeOpacity={0.85}
        >
          <Text style={styles.chargeBtnText}>
            {canCharge ? `Charge ${formatDisplay(amountCents)}` : "Enter Amount"}
          </Text>
        </TouchableOpacity>
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
    paddingTop: 8,
    paddingBottom: 8,
  },
  backBtn: { padding: 8 },
  backText: {
    fontSize: 15,
    color: "#1B3A6B",
    fontFamily: "Inter_500Medium",
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1B3A6B",
    fontFamily: "Inter_600SemiBold",
  },
  amountWrap: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 4,
  },
  amount: {
    fontSize: 52,
    fontWeight: "700",
    color: "#1B3A6B",
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  minWarning: {
    fontSize: 13,
    color: "#EF4444",
    fontFamily: "Inter_500Medium",
  },
  invoiceChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 24,
    marginBottom: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  invoiceChipText: {
    flex: 1,
    fontSize: 14,
    color: "#1B3A6B",
    fontFamily: "Inter_500Medium",
  },
  invoiceChipChange: {
    fontSize: 14,
    color: "#3B82F6",
    fontFamily: "Inter_500Medium",
    marginLeft: 8,
  },
  invoiceLink: {
    alignSelf: "center",
    marginBottom: 12,
    padding: 8,
  },
  invoiceLinkText: {
    fontSize: 14,
    color: "#3B82F6",
    fontFamily: "Inter_500Medium",
  },
  noteInput: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1B3A6B",
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chargeWrap: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  chargeBtn: {
    backgroundColor: "#E8621A",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
  },
  chargeBtnDisabled: {
    backgroundColor: "#CBD5E1",
  },
  chargeBtnText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },
});
