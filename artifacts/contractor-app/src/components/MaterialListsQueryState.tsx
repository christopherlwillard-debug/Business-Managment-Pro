import type { ReactNode } from "react";

type MaterialListsQueryStateProps = {
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  isFetching: boolean;
  hasLists: boolean;
  onRetry: () => void;
  emptyState: ReactNode;
  children: ReactNode;
};

export function MaterialListsQueryState({
  isLoading,
  isError,
  isSuccess,
  isFetching,
  hasLists,
  onRetry,
  emptyState,
  children,
}: MaterialListsQueryStateProps) {
  return (
    <div className="space-y-3">
      {isError && (
        <div
          role="alert"
          data-testid="material-lists-load-error"
          className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
        >
          <span>Couldn’t load material lists. No changes were made.</span>
          <button
            type="button"
            onClick={onRetry}
            disabled={isFetching}
            className="shrink-0 rounded-lg border border-red-300 px-3 py-1 font-semibold hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFetching ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {isLoading && !hasLists && (
        <div className="flex justify-center py-6" role="status" aria-label="Loading material lists">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      )}

      {isSuccess && !hasLists && emptyState}
      {hasLists && children}
    </div>
  );
}
