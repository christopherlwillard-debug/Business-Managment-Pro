import { describe, expect, it, vi } from "vitest";
import { removeStagedEstimateQuoteArchive, stageEstimateQuoteArchive } from "./estimateQuoteArchive.js";

describe("stageEstimateQuoteArchive", () => {
  it("removes the private logo copy if PDF staging fails", async () => {
    const storage = {
      uploadBuffer: vi.fn()
        .mockResolvedValueOnce("private/quote-archives/estimates/12/revision-1/logo")
        .mockRejectedValueOnce(new Error("storage unavailable")),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };

    await expect(stageEstimateQuoteArchive({
      estimateId: 12,
      revision: 1,
      pdf: Buffer.from("pdf-bytes"),
      logo: { buffer: Buffer.from("logo-bytes"), mimeType: "image/png" },
      storage: storage as never,
    })).rejects.toThrow("storage unavailable");

    expect(storage.uploadBuffer).toHaveBeenNthCalledWith(
      1,
      expect.any(Buffer),
      "image/png",
      "quote-archives/estimates/12/revision-1/logo",
    );
    expect(storage.deleteObject).toHaveBeenCalledWith(
      "private/quote-archives/estimates/12/revision-1/logo",
    );
  });

  it("returns both private archive paths after successful PDF and logo staging", async () => {
    const storage = {
      uploadBuffer: vi.fn()
        .mockResolvedValueOnce("private/logo")
        .mockResolvedValueOnce("private/pdf"),
      deleteObject: vi.fn(),
    };
    const archived = await stageEstimateQuoteArchive({
      estimateId: 4,
      revision: 2,
      pdf: Buffer.from("exact-pdf"),
      logo: { buffer: Buffer.from("logo"), mimeType: "image/png" },
      storage: storage as never,
    });
    expect(archived).toEqual({ pdfObjectPath: "private/pdf", logoObjectPath: "private/logo" });
  });

  it("attempts cleanup of every staged object and tolerates storage deletion failures", async () => {
    const storage = {
      uploadBuffer: vi.fn(),
      deleteObject: vi.fn().mockRejectedValue(new Error("mock delete failure")),
    };
    await expect(removeStagedEstimateQuoteArchive({
      pdfObjectPath: "private/pdf",
      logoObjectPath: "private/logo",
    }, storage as never)).resolves.toBeUndefined();
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
  });
});
