import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");

const h = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  logoBuffer: null as Buffer | null,
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
        const result = fixedResult ?? h.selectQueue.shift();
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
        return makeChain();
      },
    },
  };
});

vi.mock("./objectStorage.js", () => ({
  ObjectStorageService: class {
    async getObjectEntityFile() {
      return {
        download: async () => [h.logoBuffer],
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

function queueFixture(settings: { companyName: string; logoUrl: string | null }) {
  h.selectQueue.length = 0;
  h.settings = {
    companyName: settings.companyName,
    signatureImage: null,
    logoUrl: settings.logoUrl,
  };
  h.selectQueue.push(
    [checklistRow],
    [sectionRow],
    [itemRow],
    [],
    [],
    [],
    [],
  );
}

function countEmbeddedImages(buffer: Buffer) {
  return (buffer.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
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

async function createLogo(width: number, height: number) {
  const sharp = require("sharp") as typeof import("sharp");
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 22, g: 163, b: 74 },
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

describe("generateChecklistPdfBuffer", () => {
  it.each([
    { name: "wide", width: 800, height: 100, expectedWidth: 110, expectedHeight: 13.75 },
    { name: "tall", width: 100, height: 800, expectedWidth: 6, expectedHeight: 48 },
  ])("embeds a $name logo within the 110x48pt header box", async ({ width, height, expectedWidth, expectedHeight }) => {
    h.logoBuffer = await createLogo(width, height);
    queueFixture({ companyName: "Acme Contractor", logoUrl: "/objects/checklist-logo" });

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
    h.logoBuffer = null;
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
});