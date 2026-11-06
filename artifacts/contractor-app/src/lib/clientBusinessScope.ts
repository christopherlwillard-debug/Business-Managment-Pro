export interface ClientBusinessIdentity {
  businessId?: unknown;
  businessLine?: unknown;
}

/** Canonical selector fields for a client's existing business owner. */
export function getClientSourceBusinessFields(client: ClientBusinessIdentity): {
  sourceBusinessId?: number;
  sourceBusinessLine?: string;
} {
  const id = client.businessId == null || String(client.businessId).trim() === ""
    ? NaN
    : Number(client.businessId);
  if (Number.isSafeInteger(id) && id > 0) {
    return { sourceBusinessId: id };
  }

  const rawLine = typeof client.businessLine === "string" ? client.businessLine.trim() : "";
  if (!rawLine) return {};
  const sourceBusinessLine = rawLine === "asphalt" ? "asphalt_sealing"
    : rawLine === "contracting" ? "general_contracting"
    : rawLine;
  return { sourceBusinessLine };
}

/** Query selector used by ID-based client deletes and source-scoped lookups. */
export function getClientBusinessScopeQuery(client: ClientBusinessIdentity): string {
  const fields = getClientSourceBusinessFields(client);
  if (fields.sourceBusinessId != null) {
    return `?businessId=${encodeURIComponent(String(fields.sourceBusinessId))}`;
  }
  if (fields.sourceBusinessLine) {
    return `?businessLine=${encodeURIComponent(fields.sourceBusinessLine)}`;
  }
  return "";
}
