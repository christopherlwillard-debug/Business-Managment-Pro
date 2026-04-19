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
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { usePaymentSession } from "@/context/PaymentSession";

export default function HomeScreen() {
  const { logout } = useAuth();
  const { clearSession } = usePaymentSession();

  function handleCollect() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearSession();
    router.push("/collect");
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Willard's General</Text>
          <Text style={styles.subGreeting}>Contracting LLC</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.chargeBtn}
          onPress={handleCollect}
          activeOpacity={0.85}
        >
          <View style={styles.chargeBtnIcon}>
            <Text style={styles.chargeBtnIconText}>⚡</Text>
          </View>
          <Text style={styles.chargeBtnTitle}>Collect Payment</Text>
          <Text style={styles.chargeBtnSub}>Opens Square POS to collect</Text>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>About Square POS Payments</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoEmoji}>📱</Text>
            <Text style={styles.infoText}>
              Opens the Square POS app to accept card, tap, or manual entry
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoEmoji}>🔒</Text>
            <Text style={styles.infoText}>
              Payments are processed securely by Square
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoEmoji}>🧾</Text>
            <Text style={styles.infoText}>
              Optionally link a payment to an existing invoice
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoEmoji}>📋</Text>
            <Text style={styles.infoText}>
              Requires the Square Point of Sale app installed on your device
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F9FC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1B3A6B",
    fontFamily: "Inter_700Bold",
  },
  subGreeting: {
    fontSize: 13,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
  },
  signOutBtn: { padding: 8 },
  signOutText: {
    color: "#94A3B8",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 20,
  },
  chargeBtn: {
    backgroundColor: "#1B3A6B",
    borderRadius: 24,
    paddingVertical: 40,
    alignItems: "center",
    gap: 8,
    shadowColor: "#1B3A6B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  chargeBtnIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  chargeBtnIconText: { fontSize: 32 },
  chargeBtnTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },
  chargeBtnSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_400Regular",
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1B3A6B",
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  infoEmoji: { fontSize: 18, marginTop: 1 },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
    fontFamily: "Inter_400Regular",
  },
});
