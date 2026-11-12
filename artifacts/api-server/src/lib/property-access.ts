export type PropertyPermission = "view" | "measure" | "estimate" | "manage";

const grantedCapabilities: Record<PropertyPermission, readonly PropertyPermission[]> = {
  view: ["view"],
  measure: ["view", "measure"],
  estimate: ["view", "estimate"],
  manage: ["view", "measure", "estimate", "manage"],
};

export function hasPropertyPermission(
  granted: string | null | undefined,
  required: PropertyPermission,
): boolean {
  return granted != null
    && granted in grantedCapabilities
    && grantedCapabilities[granted as PropertyPermission].includes(required);
}
