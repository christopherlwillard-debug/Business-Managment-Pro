export type MileageSurchargeLine = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export function isMileageSurchargeLine(line: unknown): line is MileageSurchargeLine {
  return typeof line === "object" &&
    line !== null &&
    typeof (line as { description?: unknown }).description === "string" &&
    (line as { description: string }).description.toLowerCase().startsWith("mileage surcharge");
}

export function calculateSurchargeDays(startDate?: string | null, endDate?: string | null): number {
  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T00:00:00`) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

export function mergeMileageSurchargeLine<T>(lines: T[], surchargeLine: T | null): T[] {
  if (!surchargeLine || lines.some(isMileageSurchargeLine)) return lines;
  return [...lines, surchargeLine];
}