export interface FileExpenseDraftForm {
  description: string;
  vendor: string;
  category: string;
  jobId: string;
  businessLine: string;
  notes: string;
}

export interface PendingFileExpenseDraft {
  txnId: number;
  form: FileExpenseDraftForm;
  countsTowardJobProfit: boolean;
  savedAt: number;
}

export type FileExpenseAuthRecoveryResult =
  | "redirected"
  | "authenticated-mismatch"
  | "auth-check-failed";

const FILE_EXPENSE_DRAFT_PREFIX = "banking-file-expense-draft:";

function draftKey(txnId: number): string {
  return `${FILE_EXPENSE_DRAFT_PREFIX}${txnId}`;
}

export function removeFileExpenseDraft(txnId: number, storage: Storage = sessionStorage): void {
  try {
    storage.removeItem(draftKey(txnId));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export function saveFileExpenseDraft(draft: PendingFileExpenseDraft, storage: Storage = sessionStorage): void {
  try {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key?.startsWith(FILE_EXPENSE_DRAFT_PREFIX)) storage.removeItem(key);
    }
    storage.setItem(draftKey(draft.txnId), JSON.stringify(draft));
  } catch {
    // Authentication recovery still works if draft persistence is unavailable.
  }
}

export function loadFileExpenseDrafts(storage: Storage = sessionStorage): PendingFileExpenseDraft[] {
  const drafts: PendingFileExpenseDraft[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key?.startsWith(FILE_EXPENSE_DRAFT_PREFIX)) continue;
      const parsed = JSON.parse(storage.getItem(key) ?? "null") as PendingFileExpenseDraft | null;
      if (
        parsed &&
        Number.isInteger(parsed.txnId) &&
        parsed.form &&
        typeof parsed.form.description === "string" &&
        typeof parsed.savedAt === "number"
      ) {
        drafts.push(parsed);
      } else {
        storage.removeItem(key);
      }
    }
  } catch {
    return [];
  }
  return drafts.sort((a, b) => b.savedAt - a.savedAt);
}

export async function recoverFileExpenseAuthentication(options: {
  base: string;
  returnTo: string;
  draft: PendingFileExpenseDraft;
  fetchImpl?: typeof fetch;
  navigate?: (url: string) => void;
  storage?: Storage;
}): Promise<FileExpenseAuthRecoveryResult> {
  const {
    base,
    returnTo,
    draft,
    fetchImpl = fetch,
    navigate = url => window.location.assign(url),
    storage = sessionStorage,
  } = options;

  saveFileExpenseDraft(draft, storage);

  try {
    const response = await fetchImpl(`${base}/api/auth/user`, {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return "auth-check-failed";
    const data = await response.json() as { user: unknown | null };
    if (data.user != null) return "authenticated-mismatch";

    navigate(`${base}/api/login?returnTo=${encodeURIComponent(returnTo)}`);
    return "redirected";
  } catch {
    return "auth-check-failed";
  }
}