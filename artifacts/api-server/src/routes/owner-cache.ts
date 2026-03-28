let cachedOwnerId: string | null | undefined = undefined;

export function getOwnerCache(): string | null | undefined {
  return cachedOwnerId;
}

export function setOwnerCache(id: string | null): void {
  cachedOwnerId = id;
}

export function invalidateOwnerCache(): void {
  cachedOwnerId = undefined;
}
