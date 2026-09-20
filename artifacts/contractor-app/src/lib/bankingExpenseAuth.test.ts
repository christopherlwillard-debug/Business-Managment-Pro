import { describe, expect, it, vi } from "vitest";
import {
  loadFileExpenseDrafts,
  recoverFileExpenseAuthentication,
  removeFileExpenseDraft,
  type PendingFileExpenseDraft,
} from "./bankingExpenseAuth";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: key => data.get(key) ?? null,
    key: index => [...data.keys()][index] ?? null,
    removeItem: key => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
}

function draft(txnId = 41): PendingFileExpenseDraft {
  return {
    txnId,
    form: {
      description: "Electrical Tape",
      vendor: "Menards",
      category: "Tools/Equipment",
      jobId: "",
      businessLine: "general_contracting",
      notes: "",
    },
    countsTowardJobProfit: true,
    savedAt: 1_789_875_780_281,
  };
}

describe("recoverFileExpenseAuthentication", () => {
  it("saves the draft and redirects through the artifact base path without replaying a financial request", async () => {
    const storage = memoryStorage();
    const navigate = vi.fn();
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("/contractor-app/api/auth/user");
      expect(init).toEqual(expect.objectContaining({ credentials: "include", cache: "no-store" }));
      return new Response(JSON.stringify({ user: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await recoverFileExpenseAuthentication({
      base: "/contractor-app",
      returnTo: "/contractor-app/banking?month=2026-08",
      draft: draft(),
      fetchImpl: fetchImpl as typeof fetch,
      navigate,
      storage,
    });

    expect(result).toBe("redirected");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(
      "/contractor-app/api/login?returnTo=%2Fcontractor-app%2Fbanking%3Fmonth%3D2026-08",
    );
    expect(loadFileExpenseDrafts(storage)).toEqual([draft()]);
  });

  it("keeps the draft and does not redirect when auth and Banking disagree", async () => {
    const storage = memoryStorage();
    const navigate = vi.fn();

    const result = await recoverFileExpenseAuthentication({
      base: "",
      returnTo: "/banking",
      draft: draft(),
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ user: { id: "owner" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
      navigate,
      storage,
    });

    expect(result).toBe("authenticated-mismatch");
    expect(navigate).not.toHaveBeenCalled();
    expect(loadFileExpenseDrafts(storage)).toHaveLength(1);
  });

  it("distinguishes an auth-check failure from an expired session", async () => {
    const storage = memoryStorage();
    const navigate = vi.fn();

    const result = await recoverFileExpenseAuthentication({
      base: "",
      returnTo: "/banking",
      draft: draft(),
      fetchImpl: vi.fn(async () => { throw new Error("offline"); }) as typeof fetch,
      navigate,
      storage,
    });

    expect(result).toBe("auth-check-failed");
    expect(navigate).not.toHaveBeenCalled();
    expect(loadFileExpenseDrafts(storage)).toHaveLength(1);
  });

  it("restores only the current keyed draft and removes it explicitly", () => {
    const storage = memoryStorage();
    storage.setItem("banking-file-expense-draft:41", JSON.stringify(draft(41)));

    expect(loadFileExpenseDrafts(storage).map(item => item.txnId)).toEqual([41]);
    removeFileExpenseDraft(41, storage);
    expect(loadFileExpenseDrafts(storage)).toEqual([]);
  });
});