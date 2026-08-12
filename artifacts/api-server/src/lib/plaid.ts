import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { getCredential } from "./credentialManager.js";

let _client: PlaidApi | null = null;

/** Reset the Plaid client singleton — call after credential update so the next
 *  getPlaidClient() call rebuilds with the new credentials. */
export function resetPlaidClient(): void {
  _client = null;
}

function resolvePlaidCredentials(): { clientId: string; secret: string } | null {
  // 1. Try DB-managed credential (stored as JSON: { clientId, secret })
  const stored = getCredential("plaid");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { clientId?: string; secret?: string };
      if (parsed.clientId && parsed.secret) {
        return { clientId: parsed.clientId, secret: parsed.secret };
      }
    } catch {
      // Malformed — fall through to env
    }
  }

  // 2. Env-var fallback (backward-compatible with existing deployments)
  const clientId = process.env["PLAID_CLIENT_ID"];
  const secret   = process.env["PLAID_SECRET"];
  if (clientId && secret) return { clientId, secret };

  return null;
}

export function getPlaidClient(): PlaidApi {
  if (!_client) {
    const creds = resolvePlaidCredentials();
    if (!creds) {
      throw new Error("Plaid credentials not configured. Add them via Integrations & APIs or set PLAID_CLIENT_ID and PLAID_SECRET environment variables.");
    }

    const env = (process.env["PLAID_ENV"] ?? "production") as keyof typeof PlaidEnvironments;

    const configuration = new Configuration({
      basePath: PlaidEnvironments[env] ?? PlaidEnvironments.production,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": creds.clientId,
          "PLAID-SECRET":    creds.secret,
        },
      },
    });

    _client = new PlaidApi(configuration);
  }
  return _client;
}

export function isPlaidConfigured(): boolean {
  return resolvePlaidCredentials() !== null;
}

export interface PlaidErrorDetail {
  error_type:      string;
  error_code:      string;
  error_message:   string;
  display_message: string | null;
}

export function extractPlaidError(err: unknown): PlaidErrorDetail | null {
  if (
    err != null &&
    typeof err === "object" &&
    "response" in err &&
    (err as { response?: unknown }).response != null
  ) {
    const response = (err as { response: { data?: unknown } }).response;
    const data = response.data as Record<string, unknown> | undefined;
    if (data && typeof data.error_code === "string") {
      return {
        error_type:      String(data.error_type ?? "UNKNOWN"),
        error_code:      String(data.error_code),
        error_message:   String(data.error_message ?? ""),
        display_message: data.display_message != null ? String(data.display_message) : null,
      };
    }
  }
  return null;
}
