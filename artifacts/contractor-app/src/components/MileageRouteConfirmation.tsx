import * as React from "react";
import { CheckCircle2 } from "lucide-react";

export function MileageRouteConfirmation({ miles }: { miles: number | null }) {
  if (miles === null) return null;

  return (
    <div data-testid="mileage-route-confirmation" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-xs text-sky-700">
      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{miles.toFixed(1)} mi via driving route · from address lookup</span>
    </div>
  );
}