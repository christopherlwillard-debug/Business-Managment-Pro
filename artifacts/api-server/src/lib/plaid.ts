import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

let _client: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (!_client) {
    const clientId = process.env["PLAID_CLIENT_ID"];
    const secret = process.env["PLAID_SECRET"];
    const env = (process.env["PLAID_ENV"] ?? "production") as keyof typeof PlaidEnvironments;

    if (!clientId || !secret) {
      throw new Error("PLAID_CLIENT_ID and PLAID_SECRET environment variables are required");
    }

    const configuration = new Configuration({
      basePath: PlaidEnvironments[env] ?? PlaidEnvironments.production,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
        },
      },
    });

    _client = new PlaidApi(configuration);
  }
  return _client;
}

export function isPlaidConfigured(): boolean {
  return !!(process.env["PLAID_CLIENT_ID"] && process.env["PLAID_SECRET"]);
}

export interface PlaidErrorDetail {
  error_type: string;
  error_code: string;
  error_message: string;
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
        error_type: String(data.error_type ?? "UNKNOWN"),
        error_code: String(data.error_code),
        error_message: String(data.error_message ?? ""),
        display_message: data.display_message != null ? String(data.display_message) : null,
      };
    }
  }
  return null;
}
