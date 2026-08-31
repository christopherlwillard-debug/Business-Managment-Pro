export interface ChecklistSharePreviewInput {
  locationName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  templateName?: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildChecklistShareTitle(input: ChecklistSharePreviewInput): string {
  const locationName = clean(input.locationName);
  const cityState = [clean(input.city), clean(input.state)].filter(Boolean).join(" ");
  const address = [clean(input.address), cityState || null].filter(Boolean).join(", ");
  const locationTitle = [locationName, address].filter(Boolean).join(" — ");
  return locationTitle || clean(input.templateName) || "Checklist";
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}