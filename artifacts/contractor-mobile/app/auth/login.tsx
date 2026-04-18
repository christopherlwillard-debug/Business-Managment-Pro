import React from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";

export default function LoginScreen() {
  const { login, isLoading } = useAuth();
  const [busy, setBusy] = React.useState(false);

  async function handleLogin() {
    setBusy(true);
    try {
      await login();
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1B3A6B" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoIcon}>⚡</Text>
          </View>
          <Text style={styles.appName}>BuildPro</Text>
          <Text style={styles.subtitle}>Tap to Pay</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome, Willard</Text>
          <Text style={styles.cardText}>
            Sign in with your Replit account to access the Tap to Pay
            terminal for Willard's General Contracting.
          </Text>

          <TouchableOpacity
            style={[styles.btn, busy && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Sign in with Replit</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, backgroundColor: "#0F2444" },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 32,
  },
  logoWrap: { alignItems: "center", gap: 8 },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: "#1B3A6B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  logoIcon: { fontSize: 40 },
  appName: {
    fontSize: 32,
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#94A3B8",
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 28,
    gap: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1B3A6B",
    fontFamily: "Inter_700Bold",
  },
  cardText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
    fontFamily: "Inter_400Regular",
  },
  btn: {
    backgroundColor: "#1B3A6B",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
  },
});
