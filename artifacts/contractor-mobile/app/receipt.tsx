import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { usePaymentSession } from "@/context/PaymentSession";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

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

function isEmailLike(s: string): boolean {
  return s.includes("@");
}

function isPhoneLike(s: string): boolean {
  return /^\+?[0-9\s\-().]{7,}$/.test(s);
}

export default function ReceiptScreen() {
  const { session, clearSession } = usePaymentSession();
  const { sessionToken } = useAuth();
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const receipt = session.receipt;

  function handleDone() {
    clearSession();
    router.replace("/");
  }

  function handleAnotherCharge() {
    clearSession();
    router.replace("/collect");
  }

  async function handleSendReceipt() {
    const value = contact.trim();
    if (!value) return;
    const isEmail = isEmailLike(value);
    const isPhone = !isEmail && isPhoneLike(value);
    if (!isEmail && !isPhone) {
      Alert.alert("Invalid contact", "Enter a valid email address or phone number.");
      return;
    }
    if (!receipt) return;

    if (isPhone) {
      const amountStr = formatCents(receipt.amountCents);
      const dateStr = formatDate(receipt.paidAt);
      const body = [
        `Receipt from Willard's General Contracting`,
        `Amount: ${amountStr}`,
        receipt.description ? `Description: ${receipt.description}` : null,
        receipt.invoiceNumber ? `Invoice: #${receipt.invoiceNumber}` : null,
        `Date: ${dateStr}`,
        `Payment ID: ${receipt.paymentIntentId}`,
      ]
        .filter(Boolean)
        .join("\n");
      const encoded = encodeURIComponent(body);
      const url = `sms:${value}${Platform.OS === "ios" ? "&" : "?"}body=${encoded}`;
      try {
        await Linking.openURL(url);
        setSent(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        Alert.alert("Could not open SMS", "Please open the Messages app manually.");
      }
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${BASE_URL}/api/terminal/send-receipt`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentIntentId: receipt.paymentIntentId,
          contact: value,
          type: "email",
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Could not send receipt");
      }
      setSent(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not send receipt";
      Alert.alert("Send failed", msg);
    } finally {
      setSending(false);
    }
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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

            {receipt.description ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Description</Text>
                  <Text style={styles.rowValue}>{receipt.description}</Text>
                </View>
                <View style={styles.divider} />
              </>
            ) : null}

            {receipt.invoiceNumber ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Invoice</Text>
                  <Text style={styles.rowValue}>#{receipt.invoiceNumber}</Text>
                </View>
                <View style={styles.divider} />
              </>
            ) : null}

            {receipt.clientName ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Client</Text>
                  <Text style={styles.rowValue}>{receipt.clientName}</Text>
                </View>
                <View style={styles.divider} />
              </>
            ) : null}

            {receipt.last4 ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Card</Text>
                  <Text style={styles.rowValue}>
                    {capitalize(receipt.brand)} •••• {receipt.last4}
                  </Text>
                </View>
                <View style={styles.divider} />
              </>
            ) : null}

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Payment ID</Text>
              <Text
                style={[styles.rowValue, styles.rowValueMono]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {receipt.paymentIntentId}
              </Text>
            </View>
          </View>

          <View style={styles.sendCard}>
            <Text style={styles.sendTitle}>Send Receipt</Text>
            <Text style={styles.sendHint}>
              Enter the customer's email or phone number to send a receipt.
            </Text>
            {sent ? (
              <View style={styles.sentBanner}>
                <Text style={styles.sentText}>✓ Receipt sent to {contact.trim()}</Text>
              </View>
            ) : (
              <View style={styles.sendRow}>
                <TextInput
                  style={styles.contactInput}
                  placeholder="Email or phone number"
                  placeholderTextColor="#94A3B8"
                  value={contact}
                  onChangeText={setContact}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!sending}
                />
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    (!contact.trim() || sending) && styles.sendBtnDisabled,
                  ]}
                  onPress={handleSendReceipt}
                  disabled={!contact.trim() || sending}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sendBtnText}>
                    {sending ? "…" : "Send"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
      </KeyboardAvoidingView>
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
  sendCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sendTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1B3A6B",
    fontFamily: "Inter_600SemiBold",
  },
  sendHint: {
    fontSize: 13,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
  },
  sendRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  contactInput: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1B3A6B",
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sendBtn: {
    backgroundColor: "#1B3A6B",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: "#CBD5E1" },
  sendBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
  },
  sentBanner: {
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  sentText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#166534",
    fontFamily: "Inter_600SemiBold",
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
  actions: { gap: 12 },
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
