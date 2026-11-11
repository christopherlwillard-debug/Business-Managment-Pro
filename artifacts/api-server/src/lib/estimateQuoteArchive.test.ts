import { describe, expect, it, vi } from "vitest";
import { stageEstimateQuoteArchive } from "./estimateQuoteArchive.js";

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
});
