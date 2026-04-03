import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "") as string;
const SCOPES = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/gmail.send";

export interface GoogleTokenInfo {
  token: string;
  email: string;
  expiresAt: number;
}

interface PendingTokenRequest {
  resolve: (token: string) => void;
  reject: (err: Error) => void;
}

interface GoogleAuthContextValue {
  isConfigured: boolean;
  isConnected: boolean;
  userEmail: string | null;
  token: string | null;
  signIn: (onSuccess?: () => void) => void;
  signOut: () => void;
  getToken: () => Promise<string>;
}

const GoogleAuthContext = createContext<GoogleAuthContextValue>({
  isConfigured: false,
  isConnected: false,
  userEmail: null,
  token: null,
  signIn: () => {},
  signOut: () => {},
  getToken: () => Promise.reject(new Error("Google Auth not initialized")),
});

export function useGoogleAuth() {
  return useContext(GoogleAuthContext);
}

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) { resolve(); return; }
    if (document.getElementById("gsi-script")) {
      const wait = setInterval(() => {
        if ((window as any).google?.accounts?.oauth2) { clearInterval(wait); resolve(); }
      }, 50);
      return;
    }
    const script = document.createElement("script");
    script.id = "gsi-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
}

const TOKEN_KEY = "bp_gauth_v1";

function saveToken(info: GoogleTokenInfo) {
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(info)); } catch {}
}

function loadPersistedToken(): GoogleTokenInfo | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const info = JSON.parse(raw) as GoogleTokenInfo;
    if (info.expiresAt < Date.now() + 60_000) { localStorage.removeItem(TOKEN_KEY); return null; }
    return info;
  } catch { return null; }
}

function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [tokenInfo, setTokenInfo] = useState<GoogleTokenInfo | null>(loadPersistedToken);
  const tokenClientRef = useRef<any>(null);
  const pendingTokenRef = useRef<PendingTokenRequest | null>(null);
  const pendingOnSuccessRef = useRef<(() => void) | null>(null);

  const isConfigured = CLIENT_ID.length > 0;

  useEffect(() => {
    if (!isConfigured) return;
    loadGisScript().then(() => {
      tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp: any) => {
          if (resp.error || !resp.access_token) {
            const err = new Error(resp.error_description ?? resp.error ?? "Google sign-in failed or was cancelled");
            if (pendingTokenRef.current) {
              pendingTokenRef.current.reject(err);
              pendingTokenRef.current = null;
            }
            pendingOnSuccessRef.current = null;
            return;
          }

          const expiresAt = Date.now() + parseInt(resp.expires_in ?? "3600") * 1000;
          fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${resp.access_token}`)
            .then(r => r.json())
            .then(info => {
              const ti: GoogleTokenInfo = {
                token: resp.access_token,
                email: info.email ?? "",
                expiresAt,
              };
              setTokenInfo(ti);
              saveToken(ti);
              if (pendingTokenRef.current) {
                pendingTokenRef.current.resolve(resp.access_token);
                pendingTokenRef.current = null;
              }
              if (pendingOnSuccessRef.current) {
                pendingOnSuccessRef.current();
                pendingOnSuccessRef.current = null;
              }
            })
            .catch(() => {
              const ti: GoogleTokenInfo = { token: resp.access_token, email: "", expiresAt };
              setTokenInfo(ti);
              saveToken(ti);
              if (pendingTokenRef.current) {
                pendingTokenRef.current.resolve(resp.access_token);
                pendingTokenRef.current = null;
              }
              if (pendingOnSuccessRef.current) {
                pendingOnSuccessRef.current();
                pendingOnSuccessRef.current = null;
              }
            });
        },
      });
    }).catch(console.error);
  }, [isConfigured]);

  const signIn = useCallback((onSuccess?: () => void) => {
    if (!tokenClientRef.current) return;
    if (onSuccess) pendingOnSuccessRef.current = onSuccess;
    tokenClientRef.current.requestAccessToken({ prompt: "select_account" });
  }, []);

  const signOut = useCallback(() => {
    if (tokenInfo?.token) {
      try { (window as any).google?.accounts?.oauth2?.revoke(tokenInfo.token, () => {}); } catch {}
    }
    clearToken();
    setTokenInfo(null);
  }, [tokenInfo]);

  const getToken = useCallback((): Promise<string> => {
    if (tokenInfo && tokenInfo.expiresAt > Date.now() + 60_000) {
      return Promise.resolve(tokenInfo.token);
    }
    return new Promise((resolve, reject) => {
      if (!tokenClientRef.current) {
        reject(new Error("Google Auth not initialized"));
        return;
      }
      pendingTokenRef.current = { resolve, reject };
      tokenClientRef.current.requestAccessToken({ prompt: "" });
    });
  }, [tokenInfo]);

  return (
    <GoogleAuthContext.Provider value={{
      isConfigured,
      isConnected: !!(tokenInfo && tokenInfo.expiresAt > Date.now()),
      userEmail: tokenInfo?.email ?? null,
      token: tokenInfo?.token ?? null,
      signIn,
      signOut,
      getToken,
    }}>
      {children}
    </GoogleAuthContext.Provider>
  );
}
