import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const fixture = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  missingSelects: [] as number[],
  selectCount: 0,
  updatePayloads: [] as Record<string, unknown>[],
  updateQueue: [] as unknown[][],
  fetchBidDocument: vi.fn(),
  openAiCreate: vi.fn(),
  computeRecommendation: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) => ({ name });

  function selectChain() {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      orderBy: () => chain,
      leftJoin: () => chain,
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const slot = fixture.selectCount++;
        const result = fixture.selectQueue.shift();
        if (!result) {
          fixture.missingSelects.push(slot);
          return Promise.reject(new Error(`missing queued select slot [${slot}]`)).then(resolve, reject);
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  }

  function updateChain() {
    const chain: any = {
      set: (payload: Record<string, unknown>) => {
        fixture.updatePayloads.push(payload);
        return chain;
      },
      where: () => chain,
      returning: () => chain,
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve(fixture.updateQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    db: {
      select: () => selectChain(),
      update: () => updateChain(),
    },
    bidOpportunitiesTable: table("bidOpportunities"),
    bidCapabilityProfilesTable: table("bidCapabilityProfiles"),
    bidBusinessSettingsTable: table("bidBusinessSettings"),
    bidSourceCatalogTable: table("bidSourceCatalog"),
    bidSourceConnectionsTable: table("bidSourceConnections"),
    businessesTable: table("businesses"),
    crewMembersTable: table("crewMembers"),
    crewCertificationsTable: table("crewCertifications"),
    equipmentInventoryTable: table("equipmentInventory"),
    jobsTable: table("jobs"),
  };
});

vi.mock("drizzle-orm", () => {
  const expression = (...args: unknown[]) => ({ args });
  const sql = Object.assign(expression, { raw: expression });
  return {
    and: expression,
    desc: expression,
    eq: expression,
    inArray: expression,
    isNotNull: expression,
    isNull: expression,
    not: expression,
    or: expression,
    sql,
  };
});

vi.mock("../lib/bidCategories.js", () => ({
  deriveCapabilityCategories: vi.fn(() => []),
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: fixture.openAiCreate,
      },
    },
  },
}));
vi.mock("../lib/bidDocumentFetcher.js", () => ({
  fetchBidDocument: fixture.fetchBidDocument,
}));
vi.mock("../jobs/bidSync.js", () => ({
  runBidSync: vi.fn(),
}));
vi.mock("../lib/bidRecommendation.js", () => ({
  computeRecommendation: fixture.computeRecommendation,
}));
vi.mock("../lib/officialSourceFinder.js", () => ({
  findOfficialSource: vi.fn(),
  classifySourceHeuristic: vi.fn(),
  makeStatusLabel: vi.fn(),
  makeStatusDetail: vi.fn(),
}));
vi.mock("../lib/credentialManager.js", () => ({
  getCredential: vi.fn(),
}));
vi.mock("../lib/bidCapabilitySeeds.js", () => ({
  getCapabilitiesForBusinessType: vi.fn(() => []),
}));
vi.mock("../lib/bid-ownership.js", () => ({
  getExistingBusiness: vi.fn(async () => true),
}));
vi.mock("../lib/bidLifecycle.js", () => ({
  getBidLifecycleState: vi.fn(),
  isDefaultActiveBid: vi.fn(),
}));
vi.mock("../lib/bidHiddenFeed.js", () => ({
  buildBidFilterReason: vi.fn(),
  selectUnifiedCandidateGroup: vi.fn(),
}));

const { default: bidsRouter } = await import("./bids");
const app = express();
app.use(express.json());
app.use("/bids", bidsRouter);

const baseBid = {
  id: 17,
  businessId: 9,
  noticeId: "NOTICE-17",
  title: "Roof repair solicitation",
  agency: "Test agency",
  source: "sam",
  url: "https://example.com/solicitation",
  description: "Repair work",
  responseDeadline: null,
  aiSummary: null,
  opportunityScore: 80,
  capabilityMatches: [],
  setAsideType: "open",
  naicsCode: "238160",
  opportunityType: "solicitation",
  dataCompleteness: "complete",
};

const deepRead = {
  submissionDeadline: { date: "September 30, 2026", time: "5:00 PM", timezone: "CT", raw: "September 30, 2026 at 5:00 PM CT" },
  siteVisit: null,
  insuranceRequirements: {
    generalLiability: "$1,000,000",
    workersCompensation: "Required",
    auto: null,
    other: ["Umbrella coverage"],
  },
  bonding: { required: true, amounts: "$25,000 bid bond", details: null },
  prevailingWage: { required: false, wageDeterminationNumber: null, details: null },
  smallBusinessSubcontracting: { required: false, details: null },
  evaluationCriteria: ["Price"],
  pointOfContact: { name: "Alex Smith", email: "alex@example.com", phone: null },
  awardSlots: 1,
  redFlags: ["Liquidated damages"],
  evidence: {
    submissionDeadline: { status: "confirmed", source: "Section L", excerpt: "Offers are due September 30, 2026 at 5:00 PM CT." },
    siteVisit: { status: "missing", source: null, excerpt: null },
    insuranceRequirements: {
      generalLiability: { status: "confirmed", source: "Section H", excerpt: "Commercial general liability of $1,000,000 is required." },
      workersCompensation: { status: "confirmed", source: "Section H", excerpt: "Workers' compensation coverage is required." },
      auto: { status: "missing", source: null, excerpt: null },
      other: [{ status: "ambiguous", source: "Section H", excerpt: "Umbrella coverage may be required." }],
    },
    bonding: { status: "confirmed", source: "Section L", excerpt: "A $25,000 bid bond is required." },
    prevailingWage: { status: "missing", source: null, excerpt: null },
    smallBusinessSubcontracting: { status: "missing", source: null, excerpt: null },
    evaluationCriteria: [{ status: "confirmed", source: "Section M", excerpt: "Award will be based on price." }],
    pointOfContact: { status: "confirmed", source: "Section B", excerpt: "Alex Smith, alex@example.com." },
    awardSlots: { status: "missing", source: null, excerpt: null },
    redFlags: [{ status: "confirmed", source: "Section H", excerpt: "Liquidated damages apply." }],
  },
};

function aiCompletion(value: unknown) {
  return { choices: [{ message: { content: JSON.stringify(value) } }] };
}

beforeEach(() => {
  fixture.selectQueue.length = 0;
  fixture.missingSelects.length = 0;
  fixture.selectCount = 0;
  fixture.updatePayloads.length = 0;
  fixture.updateQueue.length = 0;
  fixture.fetchBidDocument.mockReset();
  fixture.openAiCreate.mockReset();
  fixture.computeRecommendation.mockReset();
  fixture.computeRecommendation.mockReturnValue({
    recommendation: "review",
    factors: [],
    confidence: "low",
  });
});

afterEach(() => {
  expect(fixture.missingSelects).toHaveLength(0);
  expect(fixture.selectQueue).toHaveLength(0);
  expect(fixture.updateQueue).toHaveLength(0);
});

describe("bid pipeline stage updates", () => {
  it("updates the stage and keeps the legacy status column synchronized", async () => {
    fixture.updateQueue.push([{ ...baseBid, stage: "submitted", status: "interested" }]);

    const response = await request(app)
      .patch("/bids/17")
      .send({ businessId: 9, stage: "submitted", notes: "Submitted through the portal." });

    expect(response.status).toBe(200);
    expect(response.body.stage).toBe("submitted");
    expect(fixture.updatePayloads).toHaveLength(1);
    expect(fixture.updatePayloads[0]).toMatchObject({
      stage: "submitted",
      status: "interested",
      notes: "Submitted through the portal.",
    });
  });

  it("rejects an unknown stage without writing to the database", async () => {
    const response = await request(app)
      .patch("/bids/17")
      .send({ businessId: 9, stage: "approved" });

    expect(response.status).toBe(400);
    expect(fixture.updatePayloads).toHaveLength(0);
  });

  it("returns not found when the bid does not belong to the selected business", async () => {
    const response = await request(app)
      .patch("/bids/17")
      .send({ businessId: 99, stage: "submitted" });

    expect(response.status).toBe(404);
    expect(fixture.updatePayloads).toHaveLength(1);
  });
});

describe("deep-read route", () => {
  it("rejects a bid that is not owned by the requested business before fetching or calling AI", async () => {
    fixture.selectQueue.push([]);

    const response = await request(app)
      .post("/bids/17/deep-read")
      .send({ businessId: 99 });

    expect(response.status).toBe(404);
    expect(fixture.fetchBidDocument).not.toHaveBeenCalled();
    expect(fixture.openAiCreate).not.toHaveBeenCalled();
    expect(fixture.updatePayloads).toHaveLength(0);
  });

  it("performs and persists the first deep read while retaining existing summary fields", async () => {
    fixture.selectQueue.push([{ ...baseBid, aiSummary: { legacyScore: "keep me" } }]);
    fixture.fetchBidDocument.mockResolvedValue({ text: "Solicitation body" });
    fixture.openAiCreate.mockResolvedValue(aiCompletion(deepRead));

    const response = await request(app)
      .post("/bids/17/deep-read")
      .send({ businessId: 9 });

    expect(response.status).toBe(200);
    expect(response.body.cached).toBe(false);
    expect(response.body.deepRead).toEqual(deepRead);
    expect(response.body.summary).toMatchObject({ legacyScore: "keep me", deepRead });
    expect(fixture.fetchBidDocument).toHaveBeenCalledWith(expect.objectContaining({
      noticeId: "NOTICE-17",
      maxChars: 100000,
    }));
    expect(fixture.openAiCreate).toHaveBeenCalledTimes(1);
    expect(fixture.updatePayloads).toHaveLength(1);
    expect(fixture.updatePayloads[0].aiSummary).toMatchObject({
      legacyScore: "keep me",
      deepRead,
    });
  });

  it("serves a cached deep read without fetching the document or calling AI", async () => {
    fixture.selectQueue.push([{ ...baseBid, aiSummary: { legacyScore: "keep me", deepRead } }]);

    const response = await request(app)
      .post("/bids/17/deep-read")
      .send({ businessId: 9 });

    expect(response.status).toBe(200);
    expect(response.body.cached).toBe(true);
    expect(response.body.deepRead).toEqual(deepRead);
    expect(response.body.summary).toMatchObject({ legacyScore: "keep me", deepRead });
    expect(fixture.fetchBidDocument).not.toHaveBeenCalled();
    expect(fixture.openAiCreate).not.toHaveBeenCalled();
    expect(fixture.updatePayloads).toHaveLength(0);
  });

  it("refreshes and persists a replacement deep read when force is true", async () => {
    const replacement = { ...deepRead, awardSlots: 2 };
    fixture.selectQueue.push([{ ...baseBid, aiSummary: { legacyScore: "keep me", deepRead } }]);
    fixture.fetchBidDocument.mockResolvedValue({ text: "Amended solicitation body" });
    fixture.openAiCreate.mockResolvedValue(aiCompletion(replacement));

    const response = await request(app)
      .post("/bids/17/deep-read")
      .send({ businessId: 9, force: true });

    expect(response.status).toBe(200);
    expect(response.body.cached).toBe(false);
    expect(response.body.deepRead.awardSlots).toBe(2);
    expect(fixture.fetchBidDocument).toHaveBeenCalledTimes(1);
    expect(fixture.openAiCreate).toHaveBeenCalledTimes(1);
    expect(fixture.updatePayloads[0].aiSummary).toMatchObject({
      legacyScore: "keep me",
      deepRead: replacement,
    });
  });
});

describe("summary regeneration", () => {
  it("preserves an existing deep read while replacing the ordinary summary", async () => {
    fixture.selectQueue.push(
      [{ ...baseBid, aiSummary: { legacyScore: "keep me", deepRead } }],
      [{ type: "general_contracting" }],
      [],
      [{ isSdvosb: false, isVosb: false, isSmallBusiness: true }],
      [{ isSdvosb: false, isVosb: false, isSmallBusiness: true }],
    );
    fixture.fetchBidDocument.mockResolvedValue({ text: "Summary source" });
    fixture.openAiCreate.mockResolvedValue(aiCompletion({
      description: "Fresh ordinary summary",
      requirements: ["Submit a price"],
      setAsideType: "open",
    }));

    const response = await request(app)
      .post("/bids/17/summarize")
      .send({ businessId: 9, force: true });

    expect(response.status).toBe(200);
    expect(response.body.cached).toBe(false);
    expect(response.body.summary.description).toBe("Fresh ordinary summary");
    expect(response.body.summary.deepRead).toEqual(deepRead);
    expect(fixture.updatePayloads[0].aiSummary).toMatchObject({ deepRead });
    expect(fixture.openAiCreate).toHaveBeenCalledTimes(1);
  });
});