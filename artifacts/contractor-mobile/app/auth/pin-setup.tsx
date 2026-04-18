import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { PinDots } from "@/components/PinDots";
import { NumPad } from "@/components/NumPad";
import { useAuth } from "@/context/AuthContext";

const PIN_LENGTH = 4;

type Step = "create" | "confirm";

export default function PinSetupScreen() {
  const { setupPin } = useAuth();
  const [step, setStep] = useState<Step>("create");
  const [firstPin, setFirstPin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  async function handleDigit(digit: string) {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setError("");

    if (next.length === PIN_LENGTH) {
      if (step === "create") {
        setFirstPin(next);
        setStep("confirm");
        setTimeout(() => setPin(""), 300);
      } else {
        if (next === firstPin) {
          await setupPin(next);
          router.replace("/");
        } else {
          setError("PINs don't match. Try again.");
          setTimeout(() => {
            setPin("");
            setStep("create");
            setFirstPin("");
          }, 800);
        }
      }
    }
  }

  function handleDelete() {
    setPin((p) => p.slice(0, -1));
    setError("");
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {step === "create" ? "Create PIN" : "Confirm PIN"}
          </Text>
          <Text style={styles.subtitle}>
            {step === "create"
              ? "Choose a 4-digit PIN to protect the app"
              : "Re-enter your PIN to confirm"}
          </Text>
        </View>

        <PinDots length={PIN_LENGTH} filled={pin.length} hasError={!!error} />

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        <NumPad
          onPress={handleDigit}
          onDelete={handleDelete}
          showDecimal={false}
        />

        {step === "confirm" && (
          <TouchableOpacity
            onPress={() => { setStep("create"); setPin(""); setFirstPin(""); setError(""); }}
            style={styles.backBtn}
          >
            <Text style={styles.backText}>← Start over</Text>
          </TouchableOpacity>
        )}
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
  backBtn: {
    alignSelf: "center",
    marginTop: 24,
    padding: 12,
  },
  backText: {
    color: "#64748B",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
