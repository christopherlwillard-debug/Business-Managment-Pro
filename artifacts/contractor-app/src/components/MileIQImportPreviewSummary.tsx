interface MileIQImportPreviewSummaryProps {
  tripCount: number;
  totalMiles: number;
}

export function MileIQImportPreviewSummary({
  tripCount,
  totalMiles,
}: MileIQImportPreviewSummaryProps) {
  return (
    <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
      <p>
        This CSV contains{" "}
        <span className="font-semibold">{tripCount.toLocaleString()} detailed trips</span>
        {" "}totaling{" "}
        <span className="font-semibold">
          {totalMiles.toLocaleString(undefined, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })} miles
        </span>.
      </p>
      <p className="text-blue-800">
        If MileIQ shows more drives, classify any outstanding drives in MileIQ and export the
        report again. Unclassified drives may be left out of the CSV.
      </p>
    </div>
  );
}