export type AerialQuoteLaunchParams = {
  propertyId: number | null;
  prospectId: number | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  name: string;
};

function positiveInteger(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseAerialQuoteLaunch(search: string): AerialQuoteLaunchParams {
  const params = new URLSearchParams(search);
  return {
    propertyId: positiveInteger(params.get("propertyId")),
    prospectId: positiveInteger(params.get("prospectId")),
    address: params.get("address") ?? "",
    city: params.get("city") ?? "",
    state: params.get("state") ?? "",
    zip: params.get("zip") ?? "",
    name: params.get("name") ?? "",
  };
}

export function shouldShowNewPropertyForm(params: AerialQuoteLaunchParams): boolean {
  return params.propertyId == null;
}

export function latestMeasurementRevision<T extends { id: number; revision: number }>(revisions: T[]): T | null {
  return revisions.reduce<T | null>((latest, revision) =>
    !latest || revision.revision > latest.revision ? revision : latest, null);
}
