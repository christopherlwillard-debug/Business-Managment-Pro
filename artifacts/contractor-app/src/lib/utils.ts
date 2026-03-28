import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [y, m, d] = dateString.split("-").map(Number);
      return format(new Date(y, m - 1, d), "MMM d, yyyy");
    }
    const dt = new Date(dateString);
    if (isNaN(dt.getTime())) return dateString;
    return format(dt, "MMM d, yyyy");
  } catch (e) {
    return dateString;
  }
}

export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const APP_FEATURES = [
  "Dashboard",
  "Jobs",
  "Invoices",
  "Expenses",
  "Mileage",
  "Estimates",
  "Subcontractors",
  "Daily Logs",
  "Compliance",
  "Clients"
];
