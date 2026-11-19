import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const fixture = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  insertQueue: [] as unknown[][],
  updateQueue: [] as unknown[][],
  insertedValues: [] as Record<string, unknown>[],
  updatedValues: [] as Record<string, unknown>[],
  consumed: 0,
  missing: [] as number[],
  whereClauses: [] as unknown[],
  sameLegalBusiness: true,
}));

vi.mock("@workspace/db", () => {
  function selectChain() {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      where: (condition: unknown) => {
        fixture.whereClauses.push(condition);
        return chain;
      },
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const slot = fixture.consumed++;
        const result = fixture.selectQueue.shift();
        if (!result) {
          fixture.missing.push(slot);
          return Promise.reject(new Error(`missing queued query slot [${slot}]`)).then(resolve, reject);
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  }
  return {
    db: {
      select: () => selectChain(),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          fixture.insertedValues.push(values);
          return { returning: async () => fixture.insertQueue.shift() ?? [] };
        },
      }),
      update: () => {
        let values: Record<string, unknown> = {};
        const chain: any = {
          set: (nextValues: Record<string, unknown>) => {
            values = nextValues;
            fixture.updatedValues.push(nextValues);
            return chain;
          },
          where: () => chain,
          returning: async () => fixture.updateQueue.shift() ?? [],
        };
        return chain;
      },
    },
  };
});

vi.mock("../lib/business-scope.js", async () => {
  const { sql } = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    hasRequestedBusiness: () => false,
    requestedBusiness: async () => ({ id: 1, slug: "asphalt_sealing" }),
    requestedBusinessReadScope: async () => ({
      id: 1, slug: "general_contracting", legalBusinessId: 1,
      memberIds: [1, 2], memberSlugs: ["general_contracting", "asphalt_sealing"],
    }),
    businessReadPredicate: () => sql.raw("business_id IN (...) OR (business_id IS NULL AND business_line IN (...))"),
    belongsToBusinessReadScope: () => true,
    resolveMutationBusiness: async (req: { body?: { businessId?: number } }) => ({
      ok: true,
      explicit: req.body?.businessId != null,
      business: { id: 1, slug: "asphalt_sealing" },
    }),
    invalidBusinessScope: () => false,
    belongsToBusiness: () => true,
    canonicalRecordBusiness: async (record: { businessId: number; businessLine: string }) => ({
      state: "resolved",
      business: { id: record.businessId, slug: record.businessLine },
    }),
    sameLegalBusiness: async () => fixture.sameLegalBusiness,
  };
});

vi.mock("./guards", () => ({ getRequestUser: () => null }));
vi.mock("../lib/job-production-components.js", () => ({
  getJobProductionComponents: async () => [],
  getJobProductionComponentHistory: async () => [],
  isProductionComponentStatus: () => true,
  setJobProductionComponentStatus: async () => ({}),
  syncJobProductionComponents: async () => [],
}));

const { default: jobsRouter, canLinkPropertyToJob } = await import("./jobs");
const app = express();
app.use(express.json());
app.use("/jobs", jobsRouter);

beforeEach(() => {
  fixture.selectQueue.length = 0;
  fixture.insertQueue.length = 0;
  fixture.updateQueue.length = 0;
  fixture.insertedValues.length = 0;
  fixture.updatedValues.length = 0;
  fixture.consumed = 0;
  fixture.missing.length = 0;
  fixture.whereClauses.length = 0;
  fixture.sameLegalBusiness = true;
});

afterEach(() => {
  expect(fixture.missing).toHaveLength(0);
  expect(fixture.selectQueue).toHaveLength(0);
  expect(fixture.insertQueue).toHaveLength(0);
  expect(fixture.updateQueue).toHaveLength(0);
});

describe("GET /jobs business ownership scope", () => {
  it("queries canonical ownership with legacy fallback only for null-owned rows and never returns another business", async () => {
    // These are the rows the database returns after evaluating the route's WHERE:
    // canonical ownership and an unbackfilled legacy row are visible; the
    // conflicting canonical business_id row is intentionally absent.
    fixture.selectQueue.push(
      [
        { id: 11, title: "Canonical asphalt", businessId: 1, businessLine: "contracting", createdAt: new Date("2026-01-01") },
        { id: 12, title: "Legacy asphalt", businessId: null, businessLine: "asphalt_sealing", createdAt: new Date("2026-01-02") },
      ],
      [],
    );

    const response = await request(app).get("/jobs?businessId=1");

    expect(response.status).toBe(200);
    expect(response.body.map((job: { id: number }) => job.id)).toEqual([11, 12]);
    expect(response.body.some((job: { businessId: number | null }) => job.businessId === 2)).toBe(false);

    // The SQL condition contains an OR branch for canonical business_id and a
    // legacy business_line branch guarded by business_id IS NULL.
    const sql = (fixture.whereClauses[0] as { getSQL: () => unknown }).getSQL();
    const fragments: string[] = [];
    const seen = new Set<unknown>();
    const collectSqlFragments = (value: unknown): void => {
      if (typeof value === "string") {
        fragments.push(value);
        return;
      }
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      for (const nested of Object.values(value)) collectSqlFragments(nested);
    };
    collectSqlFragments(sql);
    const conditionText = fragments.join(" ").toLowerCase();
    expect(conditionText).toContain("business_id");
    expect(conditionText).toContain("business_line");
    expect(conditionText).toContain("is null");
  });
});


describe("job business assignment", () => {
  it("returns account-wide business choices for job assignment", async () => {
    fixture.selectQueue.push([
      { id: 1, name: "General Contracting", slug: "general_contracting", legalBusinessId: 1, isActive: true },
      { id: 2, name: "Asphalt Sealing", slug: "asphalt_sealing", legalBusinessId: 1, isActive: false },
    ]);

    const response = await request(app).get("/jobs/business-options");

    expect(response.status).toBe(200);
    expect(response.body.map((business: { id: number }) => business.id)).toEqual([1, 2]);
    expect(response.body[1].legalBusinessId).toBe(1);
    expect(response.body[1].isActive).toBe(false);
  });

  it("rejects creation when the requested business is inactive", async () => {
    fixture.selectQueue.push([{ isActive: false }]);

    const response = await request(app)
      .post("/jobs")
      .send({ title: "Inactive division job", businessId: 1 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/inactive business/i);
    expect(fixture.insertedValues).toHaveLength(0);
  });

  it("rejects job creation without an explicit business ID", async () => {
    const response = await request(app)
      .post("/jobs")
      .send({ title: "No business selected", businessLine: "asphalt_sealing" });

    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(response.body.error).toContain("businessId is required");
  });

  it("rejects a business ID that does not match the resolved account business", async () => {
    const response = await request(app)
      .post("/jobs")
      .send({ title: "Mismatched business", businessId: 2 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("businessId must identify");
  });
});

describe("retired job scheduling start", () => {
  it("rejects calendar start requests without changing a job", async () => {
    fixture.selectQueue.push([{ id: 11, businessId: 1, businessLine: "asphalt_sealing" }]);
    const response = await request(app)
      .post("/jobs/11/start")
      .send({ startDate: "2026-09-04" });

    expect(response.status).toBe(410);
    expect(response.body.code).toBe("JOB_SCHEDULING_RETIRED");
    expect(fixture.consumed).toBe(1);
    expect(fixture.updatedValues).toHaveLength(0);
  });
});

describe("job property link eligibility", () => {
  it("rejects properties assigned to another client", async () => {
    fixture.selectQueue.push([{ businessId: 1, clientId: 22 }]);

    await expect(canLinkPropertyToJob(5, 21, 1)).resolves.toBe(false);
  });

  it("allows a same-client property shared with view access inside the legal business", async () => {
    fixture.selectQueue.push(
      [{ businessId: 2, clientId: 21 }],
      [{ permission: "view" }],
    );

    await expect(canLinkPropertyToJob(5, 21, 1)).resolves.toBe(true);
  });

  it("rejects a same-legal-business property when the access grant is missing", async () => {
    fixture.selectQueue.push(
      [{ businessId: 2, clientId: 21 }],
      [],
    );

    await expect(canLinkPropertyToJob(5, 21, 1)).resolves.toBe(false);
  });
});

describe("job routes preserve authorized property links", () => {
  const queueClientAndJobBusiness = () => {
    fixture.selectQueue.push(
      [{ isActive: true }],
      [{ businessId: 1, businessLine: "general_contracting" }],
      [{ id: 1, legalBusinessId: 1 }],
      [{ id: 1, legalBusinessId: 1 }],
    );
  };

  const createdJob = (propertyId: number | null, clientId = 21) => ({
    id: 101,
    title: "Property-linked job",
    clientId,
    propertyId,
    businessId: 1,
    businessLine: "asphalt_sealing",
    status: "scheduled",
    planningState: "ready",
    priority: "normal",
    resourceDemand: "standard",
    subcontractorId: null,
    subcontractorName: null,
  });

  const queueJobResponse = (job: ReturnType<typeof createdJob>) => {
    fixture.selectQueue.push([job], [job]);
  };

  it("creates a job and persists a valid same-client property link", async () => {
    queueClientAndJobBusiness();
    fixture.selectQueue.push(
      [{ businessId: 1, clientId: 21 }],
      [{ maxNum: 100 }],
    );
    const job = createdJob(5);
    fixture.insertQueue.push([job]);
    queueJobResponse(job);

    const response = await request(app)
      .post("/jobs")
      .send({ title: "Property-linked job", businessId: 1, clientId: 21, propertyId: 5 });

    expect(response.status).toBe(201);
    expect(fixture.insertedValues[0]).toMatchObject({ clientId: 21, propertyId: 5, businessId: 1 });
  });

  it.each([
    ["missing", [], true],
    ["cross-legal-business", [{ businessId: 99, clientId: 21 }], false],
    ["inaccessible", [{ businessId: 2, clientId: 21 }], true],
  ] as const)("rejects a %s property during job creation", async (_label, propertyRows, sameLegalBusiness) => {
    fixture.sameLegalBusiness = sameLegalBusiness;
    queueClientAndJobBusiness();
    fixture.selectQueue.push([...propertyRows]);
    if (propertyRows[0]?.businessId === 2) fixture.selectQueue.push([]);

    const response = await request(app)
      .post("/jobs")
      .send({ title: "Invalid property link", businessId: 1, clientId: 21, propertyId: 5 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Property must belong");
    expect(fixture.insertedValues).toHaveLength(0);
  });

  it("rejects a client change that would retain the previous client's property", async () => {
    fixture.selectQueue.push(
      [{ id: -1 }],
      [{ businessId: 1, businessLine: "general_contracting", clientId: 21, propertyId: 5, status: "scheduled", closedAt: null }],
      [{ businessId: 1, clientId: 21 }],
    );

    const response = await request(app)
      .put("/jobs/101")
      .send({ clientId: 22 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Property must belong");
    expect(fixture.updatedValues).toHaveLength(0);
  });

  it("persists a valid same-client property link when updating a job", async () => {
    fixture.selectQueue.push(
      [{ id: -1 }],
      [{ businessId: 1, businessLine: "general_contracting", clientId: 21, propertyId: null, status: "scheduled", closedAt: null }],
      [{ businessId: 1, businessLine: "general_contracting", clientId: 21 }],
      [{ id: 1, legalBusinessId: 1 }],
      [{ id: 1, legalBusinessId: 1 }],
      [{ businessId: 1, clientId: 21 }],
    );
    const job = createdJob(5);
    fixture.updateQueue.push([job]);
    queueJobResponse(job);

    const response = await request(app)
      .put("/jobs/101")
      .send({ propertyId: 5 });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(fixture.updatedValues[0]).toMatchObject({ propertyId: 5 });
  });

  it("explicitly unlinks a property when propertyId is null", async () => {
    fixture.selectQueue.push(
      [{ id: -1 }],
      [{ businessId: 1, businessLine: "general_contracting", clientId: 21, propertyId: 5, status: "scheduled", closedAt: null }],
      [{ businessId: 1, businessLine: "general_contracting", clientId: 21 }],
      [{ id: 1, legalBusinessId: 1 }],
      [{ id: 1, legalBusinessId: 1 }],
    );
    const job = createdJob(null);
    fixture.updateQueue.push([job]);
    queueJobResponse(job);

    const response = await request(app)
      .put("/jobs/101")
      .send({ propertyId: null });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(fixture.updatedValues[0]).toMatchObject({ propertyId: null });
  });
});

describe("job business reassignment protects linked financial records", () => {
  const currentOwnership = {
    businessId: 2,
    businessLine: "general_contracting",
    clientId: null,
    propertyId: null,
    status: "scheduled",
    closedAt: null,
  };

  const reassignedJob = {
    id: 101,
    title: "Reassigned job",
    clientId: null,
    propertyId: null,
    businessId: 1,
    businessLine: "asphalt_sealing",
    status: "scheduled",
    planningState: "ready",
    priority: "normal",
    resourceDemand: "standard",
    subcontractorId: null,
    subcontractorName: null,
  };

  const protectedRecordCases = [
    ["draft invoice", 0, { id: 501, status: "draft" }],
    ["voided invoice", 0, { id: 501, status: "voided", voidedAt: new Date() }],
    ["active other income", 1, { id: 502, voidedAt: null }],
    ["voided other income", 1, { id: 502, voidedAt: new Date() }],
    ["active expense", 2, { id: 503, voidedAt: null }],
    ["voided expense", 2, { id: 503, voidedAt: new Date() }],
    ["expense allocation", 3, { id: 504 }],
    ["subcontractor assignment", 4, { id: 505 }],
    ["subcontractor hours", 5, { id: 506 }],
    ["subcontractor payment", 6, { id: 507, isReversal: false }],
    ["reversed subcontractor payment", 6, { id: 507, isReversal: true }],
    ["unapplied subcontractor advance", 7, { id: 508, appliedAt: null }],
    ["applied subcontractor advance", 7, { id: 508, appliedAt: new Date() }],
    ["active mileage log", 8, { id: 509, voidedAt: null }],
    ["voided mileage log", 8, { id: 509, voidedAt: new Date() }],
    ["owed mileage reimbursement", 9, { id: 510, status: "owed" }],
    ["paid mileage reimbursement", 9, { id: 510, status: "paid" }],
    ["active owner capital entry", 10, { id: 511, voidedAt: null }],
    ["voided owner capital entry", 10, { id: 511, voidedAt: new Date() }],
    ["active recurring expense", 11, { id: 512, active: true }],
    ["inactive recurring expense", 11, { id: 512, active: false }],
  ] as const;

  const queueReassignmentChecks = (recordIndex?: number, record?: Record<string, unknown>) => {
    fixture.selectQueue.push(
      [{ id: -1 }],
      [currentOwnership],
      [{ isActive: true }],
      ...Array.from({ length: 12 }, (_, index) => index === recordIndex ? [record] : []),
    );
  };

  it.each(protectedRecordCases)("rejects reassignment when a %s is linked", async (_label, recordIndex, record) => {
    queueReassignmentChecks(recordIndex, record);

    const response = await request(app)
      .put("/jobs/101")
      .send({ businessId: 1 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("financial or cost records are linked");
    expect(fixture.updatedValues).toHaveLength(0);
  });

  it("allows reassignment when no protected financial or cost-source rows exist", async () => {
    queueReassignmentChecks();
    fixture.updateQueue.push([reassignedJob]);
    fixture.selectQueue.push([reassignedJob], [reassignedJob]);

    const response = await request(app)
      .put("/jobs/101")
      .send({ businessId: 1 });

    expect(response.status).toBe(200);
    expect(fixture.updatedValues[0]).toMatchObject({ businessId: 1, businessLine: "asphalt_sealing" });
  });

  it("rejects reassignment to an inactive division before checking linked records or updating", async () => {
    fixture.selectQueue.push([{ id: -1 }], [currentOwnership], [{ isActive: false }]);

    const response = await request(app)
      .put("/jobs/101")
      .send({ businessId: 1 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/reassigned to an inactive business/i);
    expect(fixture.updatedValues).toHaveLength(0);
  });

  it("allows an ordinary edit when the requested owner is unchanged", async () => {
    const sameOwner = { ...currentOwnership, businessId: 1, businessLine: "asphalt_sealing" };
    fixture.selectQueue.push(
      [{ id: -1 }],
      [sameOwner],
    );
    fixture.updateQueue.push([{
      ...reassignedJob,
      title: "Updated title",
    }]);
    fixture.selectQueue.push(
      [{ ...reassignedJob, title: "Updated title" }],
      [{ ...reassignedJob, title: "Updated title" }],
    );

    const response = await request(app)
      .put("/jobs/101")
      .send({ businessId: 1, title: "Updated title" });

    expect(response.status).toBe(200);
    expect(fixture.updatedValues[0]).toMatchObject({ businessId: 1, title: "Updated title" });
  });

  it("allows editing an existing job in an inactive division without changing its owner", async () => {
    const currentInactiveJob = { ...currentOwnership, businessId: 1, businessLine: "asphalt_sealing" };
    const updatedJob = { ...reassignedJob, businessId: 1, businessLine: "asphalt_sealing", title: "Updated inactive-division job" };
    fixture.selectQueue.push([{ id: -1 }], [currentInactiveJob], [updatedJob], [updatedJob]);
    fixture.updateQueue.push([updatedJob]);

    const response = await request(app)
      .put("/jobs/101")
      .send({ title: "Updated inactive-division job" });

    expect(response.status).toBe(200);
    expect(fixture.updatedValues[0]).toMatchObject({
      title: "Updated inactive-division job",
      businessId: 1,
      businessLine: "asphalt_sealing",
    });
    expect(fixture.consumed).toBe(4);
  });
});