export interface LogoDims { h: number; w: number; }

export const INVOICE_LOGO_DIMS: Record<string, LogoDims> = {
  small:  { h: 50,  w: 120 },
  medium: { h: 75,  w: 200 },
  large:  { h: 110, w: 280 },
};

export function getLogoDims(size: string | null | undefined): LogoDims {
  return INVOICE_LOGO_DIMS[size ?? "medium"] ?? INVOICE_LOGO_DIMS.medium;
}
