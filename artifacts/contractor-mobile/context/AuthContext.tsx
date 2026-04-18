import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

WebBrowser.maybeCompleteAuthSession();

const SESSION_KEY = "buildpro_session";
const PIN_KEY = "buildpro_pin";
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface AuthContextType {
  sessionToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPinSet: boolean;
  isPinVerified: boolean;
  login: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setupPin: (pin: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPinVerified: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPinSet, setIsPinSet] = useState(false);
  const [isPinVerified, setIsPinVerified] = useState(false);
  const loginInProgress = useRef(false);

  useEffect(() => {
    async function hydrate() {
      try {
        const [token, pin] = await Promise.all([
          SecureStore.getItemAsync(SESSION_KEY),
          SecureStore.getItemAsync(PIN_KEY),
        ]);
        setSessionToken(token);
        setIsPinSet(!!pin);
      } catch (e) {
        console.error("Auth hydrate error:", e);
      } finally {
        setIsLoading(false);
      }
    }
    hydrate();
  }, []);

  const login = useCallback(async () => {
    if (loginInProgress.current) return;
    loginInProgress.current = true;
    try {
      const startUrl = `${BASE_URL}/api/mobile-auth/start`;
      const result = await WebBrowser.openAuthSessionAsync(
        startUrl,
        "contractor-mobile://",
      );

      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const token = url.searchParams.get("token");
        if (token) {
          await SecureStore.setItemAsync(SESSION_KEY, token);
          setSessionToken(token);
        }
      }
    } catch (err) {
      console.error("Login error:", err);
    } finally {
      loginInProgress.current = false;
    }
  }, []);

  const verifyPin = useCallback(
    async (pin: string): Promise<boolean> => {
      const stored = await SecureStore.getItemAsync(PIN_KEY);
      if (stored === pin) {
        setIsPinVerified(true);
        return true;
      }
      return false;
    },
    [],
  );

  const setupPin = useCallback(async (pin: string) => {
    await SecureStore.setItemAsync(PIN_KEY, pin);
    setIsPinSet(true);
    setIsPinVerified(true);
  }, []);

  const logout = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(SESSION_KEY),
      SecureStore.deleteItemAsync(PIN_KEY),
    ]);
    setSessionToken(null);
    setIsPinSet(false);
    setIsPinVerified(false);
  }, []);

  const resetPinVerified = useCallback(() => {
    setIsPinVerified(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        sessionToken,
        isLoading,
        isAuthenticated: !!sessionToken,
        isPinSet,
        isPinVerified,
        login,
        verifyPin,
        setupPin,
        logout,
        resetPinVerified,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
