import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

let _client: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (!_client) {
    const clientId = process.env["PLAID_CLIENT_ID"];
    const secret = process.env["PLAID_SECRET"];
    const env = (process.env["PLAID_ENV"] ?? "sandbox") as keyof typeof PlaidEnvironments;

    if (!clientId || !secret) {
      throw new Error("PLAID_CLIENT_ID and PLAID_SECRET environment variables are required");
    }

    const configuration = new Configuration({
      basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
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
