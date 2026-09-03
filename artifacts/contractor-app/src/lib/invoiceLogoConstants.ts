import { getInvoiceLogoDimensions } from "@workspace/api-zod";

export interface LogoDims { h: number; w: number; }

export function getLogoDims(size: string | null | undefined): LogoDims {
  const { width, height } = getInvoiceLogoDimensions(size);
  return { h: height, w: width };
}
