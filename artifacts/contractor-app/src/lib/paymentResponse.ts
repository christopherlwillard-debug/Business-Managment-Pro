export async function requireSuccessfulPaymentResponse(response: Response): Promise<void> {
  if (response.ok) return;

  const body = await response.json().catch(() => null) as { error?: string } | null;
  throw new Error(body?.error?.trim() || "Failed to record payment");
}