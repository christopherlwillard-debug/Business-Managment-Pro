import React, { useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { PinDots } from "@/components/PinDots";
import { NumPad } from "@/components/NumPad";
import { useAuth } from "@/context/AuthContext";

const PIN_LENGTH = 4;

export default function PinEntryScreen() {
  const { verifyPin, logout } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const shakeAnim = React.useRef(new Animated.Value(0)).current;

  function shake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }

  async function handleDigit(digit: string) {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setError(false);

    if (next.length === PIN_LENGTH) {
      const ok = await verifyPin(next);
      if (ok) {
        router.replace("/");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(true);
        shake();
        setTimeout(() => setPin(""), 600);
      }
    }
  }

  function handleDelete() {
    setPin((p) => p.slice(0, -1));
    setError(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>Enter PIN</Text>
          <Text style={styles.subtitle}>Enter your 4-digit PIN to continue</Text>
        </View>

        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <PinDots length={PIN_LENGTH} filled={pin.length} hasError={error} />
        </Animated.View>

        {error && (
          <Text style={styles.errorText}>Incorrect PIN. Try again.</Text>
        )}

        <NumPad
          onPress={handleDigit}
          onDelete={handleDelete}
          showDecimal={false}
        />

        <TouchableOpacity onPress={logout} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F9FC" },
  inner: {
    flex: 1,
    paddingTop: 48,
    paddingBottom: 24,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1B3A6B",
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  errorText: {
    textAlign: "center",
    color: "#EF4444",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
  },
  signOutBtn: {
    alignSelf: "center",
    marginTop: 24,
    padding: 12,
  },
  signOutText: {
    color: "#94A3B8",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
