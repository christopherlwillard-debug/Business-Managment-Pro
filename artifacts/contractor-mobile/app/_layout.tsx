import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { Alert, Linking } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { PaymentSessionProvider, usePaymentSession } from "@/context/PaymentSession";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function SquareCallbackHandler({ children }: { children: React.ReactNode }) {
  const { setPaymentDetails } = usePaymentSession();
  const handledRef = useRef<string | null>(null);

  function handleUrl(url: string) {
    if (!url.includes("square-callback")) return;
    if (handledRef.current === url) return;
    handledRef.current = url;

    try {
      const urlObj = new URL(url);
      const status = urlObj.searchParams.get("status");
      const transactionId =
        urlObj.searchParams.get("transaction_id") ??
        urlObj.searchParams.get("com.squareup.pos.SERVER_TRANSACTION_ID");

      if (status === "ok" && transactionId) {
        setPaymentDetails({ squarePaymentId: transactionId });
        router.push("/receipt");
      } else {
        const errorDesc =
          urlObj.searchParams.get("error_description") ??
          urlObj.searchParams.get("com.squareup.pos.ERROR_DESCRIPTION");
        const errorCode =
          urlObj.searchParams.get("error_code") ??
          urlObj.searchParams.get("com.squareup.pos.ERROR_CODE");
        Alert.alert(
          "Payment not completed",
          errorDesc ?? errorCode ?? "The payment was cancelled or failed.",
        );
      }
    } catch {
      // malformed URL — ignore
    }
  }

  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    return () => sub.remove();
  }, []);

  return <>{children}</>;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, isPinSet, isPinVerified } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/auth/login");
    } else if (!isPinSet) {
      router.replace("/auth/pin-setup");
    } else if (!isPinVerified) {
      router.replace("/auth/pin-entry");
    }
  }, [isLoading, isAuthenticated, isPinSet, isPinVerified]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth/login" options={{ headerShown: false }} />
      <Stack.Screen name="auth/pin-entry" options={{ headerShown: false }} />
      <Stack.Screen name="auth/pin-setup" options={{ headerShown: false }} />
      <Stack.Screen
        name="collect"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="invoices"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="receipt"
        options={{
          headerShown: false,
          animation: "fade",
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <AuthProvider>
              <PaymentSessionProvider>
                <SquareCallbackHandler>
                  <AuthGate>
                    <RootLayoutNav />
                  </AuthGate>
                </SquareCallbackHandler>
              </PaymentSessionProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
