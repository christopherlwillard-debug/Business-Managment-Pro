import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { usePaymentSession } from "@/context/PaymentSession";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function capitalize(s: string | null): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ReceiptScreen() {
  const { session, clearSession } = usePaymentSession();
  const receipt = session.receipt;

  function handleDone() {
    clearSession();
    router.replace("/");
  }

  function handleAnotherCharge() {
    clearSession();
    router.replace("/collect");
  }

  if (!receipt) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>No receipt data found.</Text>
          <TouchableOpacity onPress={handleDone} style={styles.doneBtn}>
            <Text style={styles.doneBtnText}>Go Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.successBadge}>
          <Text style={styles.successEmoji}>✅</Text>
          <Text style={styles.successTitle}>Payment Collected</Text>
          <Text style={styles.successAmount}>{formatCents(receipt.amountCents)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Receipt</Text>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Date</Text>
            <Text style={styles.rowValue}>{formatDate(receipt.paidAt)}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Time</Text>
            <Text style={styles.rowValue}>{formatTime(receipt.paidAt)}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Amount</Text>
            <Text style={[styles.rowValue, styles.rowValueBold]}>
              {formatCents(receipt.amountCents)}
            </Text>
          </View>
          <View style={styles.divider} />

          {receipt.description && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Description</Text>
                <Text style={styles.rowValue}>{receipt.description}</Text>
              </View>
              <View style={styles.divider} />
            </>
          )}

          {receipt.invoiceNumber && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Invoice</Text>
                <Text style={styles.rowValue}>#{receipt.invoiceNumber}</Text>
              </View>
              <View style={styles.divider} />
            </>
          )}

          {receipt.clientName && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Client</Text>
                <Text style={styles.rowValue}>{receipt.clientName}</Text>
              </View>
              <View style={styles.divider} />
            </>
          )}

          {receipt.last4 && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Card</Text>
                <Text style={styles.rowValue}>
                  {capitalize(receipt.brand)} •••• {receipt.last4}
                </Text>
              </View>
              <View style={styles.divider} />
            </>
          )}

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Payment ID</Text>
            <Text style={[styles.rowValue, styles.rowValueMono]} numberOfLines={1} ellipsizeMode="middle">
              {receipt.paymentIntentId}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.anotherBtn}
            onPress={handleAnotherCharge}
            activeOpacity={0.85}
          >
            <Text style={styles.anotherBtnText}>Charge Again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={handleDone}
            activeOpacity={0.85}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F9FC" },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 20,
    paddingTop: 24,
  },
  successBadge: {
    backgroundColor: "#1B3A6B",
    borderRadius: 24,
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
  },
  successEmoji: { fontSize: 48 },
  successTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Inter_600SemiBold",
  },
  successAmount: {
    fontSize: 44,
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1B3A6B",
    fontFamily: "Inter_600SemiBold",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  rowLabel: {
    fontSize: 14,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
  },
  rowValue: {
    fontSize: 14,
    color: "#1B3A6B",
    fontFamily: "Inter_500Medium",
    maxWidth: "60%",
    textAlign: "right",
  },
  rowValueBold: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  rowValueMono: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  actions: {
    gap: 12,
  },
  anotherBtn: {
    backgroundColor: "#E8621A",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  anotherBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },
  doneBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1B3A6B",
    fontFamily: "Inter_600SemiBold",
  },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20 },
  errorText: { fontSize: 16, color: "#64748B", fontFamily: "Inter_400Regular" },
});
