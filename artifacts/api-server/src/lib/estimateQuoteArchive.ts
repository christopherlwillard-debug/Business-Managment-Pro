import { ObjectStorageService } from "./objectStorage.js";

export interface StagedEstimateQuoteArchive {
  pdfObjectPath: string;
  logoObjectPath: string | null;
}

export async function stageEstimateQuoteArchive(input: {
  estimateId: number;
  revision: number;
  pdf: Buffer;
  logo?: { buffer: Buffer; mimeType: string } | null;
  storage?: ObjectStorageService;
}): Promise<StagedEstimateQuoteArchive> {
  const storage = input.storage ?? new ObjectStorageService();
  const subPath = `quote-archives/estimates/${input.estimateId}/revision-${input.revision}`;
  let logoObjectPath: string | null = null;
  try {
    if (input.logo) {
      logoObjectPath = await storage.uploadBuffer(input.logo.buffer, input.logo.mimeType, `${subPath}/logo`);
    }
    const pdfObjectPath = await storage.uploadBuffer(input.pdf, "application/pdf", `${subPath}/quote`);
    return { pdfObjectPath, logoObjectPath };
  } catch (error) {
    await removeStagedEstimateQuoteArchive({ pdfObjectPath: null, logoObjectPath }, storage);
    throw error;
  }
}

export async function removeStagedEstimateQuoteArchive(
  paths: { pdfObjectPath: string | null; logoObjectPath: string | null },
  storage = new ObjectStorageService(),
): Promise<void> {
  await Promise.all(
    [paths.pdfObjectPath, paths.logoObjectPath]
      .filter((value): value is string => Boolean(value))
      .map(path => storage.deleteObject(path).catch(() => undefined)),
  );
}
