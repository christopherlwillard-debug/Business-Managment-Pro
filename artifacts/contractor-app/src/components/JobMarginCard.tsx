import * as React from "react";
import { TrendingUp } from "lucide-react";

export function JobMarginCard({ margin }: { margin: number | null }) {
  if (margin === null) return null;

  const isPositive = margin > 0;
  return (
    <div className={`rounded-xl border p-3 flex items-center justify-between ${isPositive ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
      <div>
        <p className={`text-xs font-bold uppercase tracking-wide ${isPositive ? "text-emerald-700" : "text-red-700"}`}>Margin</p>
        <p className={`text-2xl font-bold mt-0.5 ${isPositive ? "text-emerald-700" : "text-red-600"}`}>
          {margin}%
        </p>
      </div>
      <TrendingUp className={`w-8 h-8 ${isPositive ? "text-emerald-300" : "text-red-300"}`} />
    </div>
  );
}