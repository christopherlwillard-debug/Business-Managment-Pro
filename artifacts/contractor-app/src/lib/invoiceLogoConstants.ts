import {
  getInvoiceLogoDimensions,
  normalizeInvoiceLogoLayout,
  type InvoiceLogoLayout,
} from "@workspace/api-zod";

export interface LogoDims { h: number; w: number; }

export function getLogoDims(size: string | null | undefined): LogoDims {
  const { width, height } = getInvoiceLogoDimensions(size);
  return { h: height, w: width };
}

export function getLogoLayout(
  layout: InvoiceLogoLayout | null | undefined,
  position?: string | null,
  size?: string | null,
): InvoiceLogoLayout {
  return normalizeInvoiceLogoLayout(layout, position, size);
}

export function moveInvoiceLogoLayout(
  layout: InvoiceLogoLayout,
  deltaX: number,
  safeWidth: number,
): InvoiceLogoLayout {
  return {
    ...layout,
    x: Math.max(0, Math.min(1, layout.x + deltaX / Math.max(1, safeWidth))),
  };
}

export function resizeInvoiceLogoLayout(
  layout: InvoiceLogoLayout,
  deltaX: number,
  deltaY: number,
): InvoiceLogoLayout {
  const ratio = layout.width / layout.height;
  const requestedScale = 1 + Math.max(deltaX / layout.width, deltaY / layout.height);
  const minScale = Math.max(80 / layout.width, 32 / layout.height);
  const maxScale = Math.min(320 / layout.width, 140 / layout.height);
  const scale = Math.max(minScale, Math.min(maxScale, requestedScale));
  return {
    ...layout,
    width: layout.width * scale,
    height: layout.height * scale,
  };
}

export function shouldEnterInvoiceLogoLayoutMode(isEditing: boolean): boolean {
  return !isEditing;
}
