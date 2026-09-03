import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");

const h = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  objectBuffers: new Map<string, Buffer>(),
  settings: {
    companyName: "Acme Contractor",
    signatureImage: null as string | null,
    logoUrl: null as string | null,
  },
}));

vi.mock("@workspace/db", () => {
  function makeChain(fixedResult?: unknown[]) {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (
        resolve: (value: unknown[]) => unknown,
        reject: (reason: unknown) => unknown,
      ) => {
        const result = fixedResult;
        if (!result) {
          return Promise.reject(new Error("Checklist PDF test query queue exhausted")).then(resolve, reject);
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    db: {
      select: (selection?: Record<string, unknown>) => {
        if (selection?.title && selection?.clientName) {
          return makeChain([{
            id: 7,
            title: "Trim-Out Job",
            address: "123 Main Street",
            city: "Evansville",
            state: "IN",
            locationName: "Riverside Estates",
            clientName: "Jane Customer",
          }]);
        }
        if (selection?.companyName) {
          return makeChain([h.settings]);
        }
        if (selection && Object.keys(selection).length === 1 && selection.name) {
          return makeChain([{ name: "Manufactured Home Trim-Out" }]);
        }
        const result = h.selectQueue.shift();
        return makeChain(result);
      },
    },
  };
});

vi.mock("./objectStorage.js", () => ({
  ObjectStorageService: class {
    async getObjectEntityFile(objectPath: string) {
      return {
        download: async () => {
          const buffer = h.objectBuffers.get(objectPath);
          if (!buffer) throw new Error(`Missing test object: ${objectPath}`);
          return [buffer];
        },
      };
    }
  },
}));

const { generateChecklistPdfBuffer } = await import("./generateChecklistPdf.js");

const checklistRow = {
  id: 8,
  jobId: 7,
  templateId: 9,
  templateName: "Manufactured Home Trim-Out",
  publicNotes: null,
  finishedNotes: null,
  startNotes: null,
};

const sectionRow = {
  id: 10,
  jobChecklistId: 8,
  name: "Exterior",
  active: true,
  notes: null,
  sortOrder: 0,
};

const itemRow = {
  id: 11,
  jobChecklistId: 8,
  jobChecklistSectionId: 10,
  title: "Complete exterior inspection",
  completed: false,
  skipped: false,
  completedAt: null,
  completedByName: null,
  notes: null,
  sortOrder: 0,
};

function queueFixture(options: {
  companyName?: string;
  logoUrl?: string | null;
  signatureImage?: string | null;
  checklist?: Omit<Partial<typeof checklistRow>, "startNotes" | "finishedNotes"> & {
    startNotes?: string | null;
    finishedNotes?: string | null;
  };
  sections?: unknown[];
  items?: unknown[];
  itemPhotos?: unknown[];
  parts?: unknown[];
  finishedPhotos?: unknown[];
  startPhotos?: unknown[];
} = {}) {
  h.selectQueue.length = 0;
  h.objectBuffers.clear();
  h.settings = {
    companyName: options.companyName ?? "Acme Contractor",
    signatureImage: options.signatureImage ?? null,
    logoUrl: options.logoUrl ?? null,
  };
  h.selectQueue.push(
    [checklistRow],
    [{ ...checklistRow, ...options.checklist }],
    options.sections ?? [sectionRow],
    options.items ?? [itemRow],
    options.itemPhotos ?? [],
    options.parts ?? [],
    options.finishedPhotos ?? [],
    options.startPhotos ?? [],
  );
}

function setObjectBuffer(objectPath: string, buffer: Buffer) {
  h.objectBuffers.set(objectPath, buffer);
}

function countEmbeddedImages(buffer: Buffer) {
  return (buffer.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
}

function countPages(buffer: Buffer) {
  return (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}

function extractImagePlacements(buffer: Buffer) {
  const placements: Array<{ width: number; height: number }> = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;

  for (const match of buffer.toString("latin1").matchAll(streamPattern)) {
    let stream: string;
    try {
      stream = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      continue;
    }

    for (const imageMatch of stream.matchAll(
      /([-\d.]+)\s+0\s+0\s+([-\d.]+)\s+[-\d.]+\s+[-\d.]+\s+cm\s*\/I\d+\s+Do/g,
    )) {
      placements.push({
        width: Math.abs(Number(imageMatch[1])),
        height: Math.abs(Number(imageMatch[2])),
      });
    }
  }

  return placements;
}

async function createImage(width: number, height: number, background = { r: 22, g: 163, b: 74 }) {
  const sharp = require("sharp") as typeof import("sharp");
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background,
    },
  }).png().toBuffer();
}

async function extractText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

function containsPdfText(text: string, expected: string) {
  return text.replace(/\s+/g, "").toLowerCase()
    .includes(expected.replace(/\s+/g, "").toLowerCase());
}

describe("generateChecklistPdfBuffer", () => {
  it.each([
    { name: "wide", width: 800, height: 100, expectedWidth: 110, expectedHeight: 13.75 },
    { name: "tall", width: 100, height: 800, expectedWidth: 6, expectedHeight: 48 },
  ])("embeds a $name logo within the 110x48pt header box", async ({ width, height, expectedWidth, expectedHeight }) => {
    const logoPath = "/objects/checklist-logo";
    queueFixture({ companyName: "Acme Contractor", logoUrl: "/objects/checklist-logo" });
    setObjectBuffer(logoPath, await createImage(width, height));

    const result = await generateChecklistPdfBuffer(7);

    expect(result).not.toBeNull();
    const pdf = result!.buffer;
    expect(countEmbeddedImages(pdf)).toBe(1);
    expect(extractImagePlacements(pdf)).toEqual([
      { width: expectedWidth, height: expectedHeight },
    ]);
    const text = await extractText(pdf);
    expect(text).toEqual(expect.stringContaining("Trim-Out Job"));
    expect(text).toEqual(expect.stringContaining("Jane Customer"));
    expect(text).toEqual(expect.stringContaining("Riverside Estates, Evansville, IN"));
  });

  it("generates a text-only header when no logo is configured", async () => {
    queueFixture({ companyName: "Acme Contractor", logoUrl: null });

    const result = await generateChecklistPdfBuffer(7);

    expect(result).not.toBeNull();
    const pdf = result!.buffer;
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(countEmbeddedImages(pdf)).toBe(0);
    const text = await extractText(pdf);
    expect(text).toEqual(expect.stringContaining("ACME CONTRACTOR"));
    expect(text).toEqual(expect.stringContaining("Trim-Out Job"));
    expect(text).toEqual(expect.stringContaining("Jane Customer"));
    expect(text).toEqual(expect.stringContaining("Riverside Estates, Evansville, IN"));
  });

  it("embeds an item photo and keeps its caption with the checklist item", async () => {
    const itemPhotoPath = "/objects/item-photo";
    queueFixture({
      itemPhotos: [{
        id: 21,
        jobChecklistItemId: itemRow.id,
        objectPath: itemPhotoPath,
        caption: "Before sealing the exterior trim",
      }],
    });
    setObjectBuffer(itemPhotoPath, await createImage(640, 480, { r: 37, g: 99, b: 235 }));

    const result = await generateChecklistPdfBuffer(7);

    expect(result).not.toBeNull();
    const pdf = result!.buffer;
    expect(countEmbeddedImages(pdf)).toBe(1);
    const text = await extractText(pdf);
    expect(text).toEqual(expect.stringContaining("Complete exterior inspection"));
    expect(text).toEqual(expect.stringContaining("Before sealing the exterior trim"));
    expect(text).toEqual(expect.stringContaining("EXTERIOR"));
  });

  it("embeds start and finished photos with their surrounding section labels", async () => {
    const startPath = "/objects/start-photo";
    const finishedPath = "/objects/finished-photo";
    queueFixture({
      checklist: {
        startNotes: "Existing condition recorded before work.",
        finishedNotes: "Final condition recorded after work.",
      },
      startPhotos: [{
        id: 31,
        jobChecklistId: checklistRow.id,
        objectPath: startPath,
      }],
      finishedPhotos: [{
        id: 41,
        jobChecklistId: checklistRow.id,
        objectPath: finishedPath,
      }],
    });
    setObjectBuffer(startPath, await createImage(800, 600, { r: 245, g: 158, b: 11 }));
    setObjectBuffer(finishedPath, await createImage(600, 800, { r: 220, g: 38, b: 38 }));

    const result = await generateChecklistPdfBuffer(7);

    expect(result).not.toBeNull();
    const pdf = result!.buffer;
    expect(countEmbeddedImages(pdf)).toBe(2);
    const text = await extractText(pdf);
    expect(text).toEqual(expect.stringContaining("START-OF-JOB PHOTOS"));
    expect(text).toEqual(expect.stringContaining("Existing condition recorded before work."));
    expect(text).toEqual(expect.stringContaining("FINISHED PHOTOS"));
    expect(text).toEqual(expect.stringContaining("Final condition recorded after work."));
  });

  it("embeds the configured signature image and keeps the sign-off labels", async () => {
    const signaturePath = "/objects/signature";
    queueFixture({ signatureImage: signaturePath });
    setObjectBuffer(signaturePath, await createImage(900, 220, { r: 17, g: 24, b: 39 }));

    const result = await generateChecklistPdfBuffer(7);

    expect(result).not.toBeNull();
    const pdf = result!.buffer;
    expect(countEmbeddedImages(pdf)).toBe(1);
    const text = await extractText(pdf);
    expect(containsPdfText(text, "COMPLETION SIGN-OFF")).toBe(true);
    expect(containsPdfText(text, "Authorized Signature")).toBe(true);
    expect(containsPdfText(text, "Date:")).toBe(true);
  });

  it("moves a near-bottom captioned image grid to a new page without dropping images", async () => {
    const fillerItems = Array.from({ length: 22 }, (_, index) => ({
      ...itemRow,
      id: 100 + index,
      title: `Inspection item ${index + 1} with additional detail that makes this line wrap before the photo grid`,
    }));
    const photoPaths = Array.from({ length: 6 }, (_, index) => `/objects/grid-photo-${index + 1}`);
    const itemPhotos = photoPaths.map((objectPath, index) => ({
      id: 200 + index,
      jobChecklistItemId: itemRow.id,
      objectPath,
      caption: `Grid photo ${index + 1}`,
    }));

    queueFixture({
      items: [...fillerItems, itemRow],
      itemPhotos,
    });
    for (const [index, objectPath] of photoPaths.entries()) {
      setObjectBuffer(objectPath, await createImage(
        640 + index * 10,
        480 + index * 10,
        { r: 20 + index * 20, g: 60 + index * 15, b: 180 - index * 15 },
      ));
    }
    const withGrid = await generateChecklistPdfBuffer(7);
    expect(withGrid).not.toBeNull();

    queueFixture({ items: [...fillerItems, itemRow] });
    const withoutGrid = await generateChecklistPdfBuffer(7);
    expect(withoutGrid).not.toBeNull();

    const gridPdf = withGrid!.buffer;
    const noGridPdf = withoutGrid!.buffer;
    expect(countEmbeddedImages(gridPdf)).toBe(6);
    expect(countPages(gridPdf)).toBeGreaterThan(countPages(noGridPdf));
    const text = await extractText(gridPdf);
    expect(text).toEqual(expect.stringContaining("Grid photo 1"));
    expect(text).toEqual(expect.stringContaining("Grid photo 6"));
    expect(containsPdfText(text, "COMPLETION SIGN-OFF")).toBe(true);
  });
});