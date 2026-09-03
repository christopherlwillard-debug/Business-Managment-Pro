import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  selectQueue: [] as Array<any[] | ((query: {
    selection: Record<string, unknown> | undefined;
    whereClause: unknown;
  }) => any[])>,
  consumedSelectSlots: 0,
  missingSelectSlots: [] as number[],
  scenario: "no request",
}));

vi.mock("@workspace/db", () => {
  function makeSelectChain(selection?: Record<string, unknown>) {
    let whereClause: unknown;
    const chain: any = {
      from: () => chain,
      where: (condition: unknown) => {
        whereClause = condition;
        return chain;
      },
      innerJoin: () => chain,
      leftJoin: () => chain,
      groupBy: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: any, reject: any) {
        const slot = h.consumedSelectSlots++;
        const queued = h.selectQueue.shift();
        if (queued === undefined) {
          h.missingSelectSlots.push(slot);
          return Promise.reject(
            new Error(`[${h.scenario}] missing queued select slot [${slot}]`),
          ).then(resolve, reject);
        }
        const rows = typeof queued === "function"
          ? queued({ selection, whereClause })
          : queued;
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    db: {
      select: (selection?: Record<string, unknown>) => makeSelectChain(selection),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
      delete: () => ({ where: () => Promise.resolve() }),
    },
  };
});

vi.mock("./subcontractors", () => ({
  computeYtd: vi.fn().mockResolvedValue(0),
}));

const { default: portalRouter } = await import("./portal");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/portal", portalRouter);

const portalSub = {
  id: 7,
  name: "Portal Sub",
  email: "portal@example.com",
  phone: null,
  trade: "Roofing",
  portalToken: "portal-sub-token",
  portalPinHash: null,
  portalApproved: true,
  portalFeatures: ["payments"],
  w9OnFile: false,
  w9LegalName: null,
  w9BusinessName: null,
  w9TaxClassification: null,
  w9LlcType: null,
  w9Address: null,
  w9City: null,
  w9State: null,
  w9Zip: null,
  w9TaxIdType: null,
  w9TaxId: null,
  w9Signature: null,
  w9SignedAt: null,
};

const pinnedPortalSub = { ...portalSub, portalPinHash: "hash" };
const otherSub = {
  id: 8,
  name: "Other Sub",
  portalToken: "other-sub-token",
  portalPinHash: "other-hash",
  portalApproved: true,
};

const sharedJob = {
  id: 101,
  title: "Shared Roof Replacement",
  status: "scheduled",
  city: "Columbus",
  state: "OH",
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  description: "The same job has assignments for both subcontractors.",
};

const otherOnlyJob = {
  id: 202,
  title: "Other Sub's Private Job",
  status: "scheduled",
  city: "Dayton",
  state: "OH",
  startDate: "2026-09-04",
  endDate: "2026-09-05",
  description: "This job belongs only to the other subcontractor.",
};

const assignments = [
  {
    jobId: sharedJob.id,
    subcontractorId: portalSub.id,
    compensationType: "fixed",
    amountOwed: null,
    amountPaid: "100.00",
    fixedAmount: "125.00",
    allocationPct: null,
    paymentStatus: "partial",
    computedOwed: "0",
    ledgerPaid: "100.00",
  },
  {
    jobId: sharedJob.id,
    subcontractorId: otherSub.id,
    compensationType: "hourly",
    amountOwed: "900.00",
    amountPaid: "900.00",
    fixedAmount: null,
    allocationPct: null,
    paymentStatus: "paid",
    computedOwed: "900.00",
    ledgerPaid: "900.00",
  },
  {
    jobId: otherOnlyJob.id,
    subcontractorId: otherSub.id,
    compensationType: "allocation",
    amountOwed: "750.00",
    amountPaid: "0.00",
    fixedAmount: null,
    allocationPct: "25.00",
    paymentStatus: "unpaid",
    computedOwed: "750.00",
    ledgerPaid: "0.00",
  },
];

const junctionAssignments = assignments.map(({ jobId, subcontractorId }) => ({
  jobId,
  subcontractorId,
}));
const allJobs = [
  { ...sharedJob, subcontractorId: otherSub.id },
  { ...otherOnlyJob, subcontractorId: otherSub.id },
];

function containsSqlPart(
  node: unknown,
  predicate: (value: Record<string, unknown>) => boolean,
  seen = new Set<unknown>(),
): boolean {
  if (node === null || typeof node !== "object" || seen.has(node)) return false;
  seen.add(node);

  const record = node as Record<string, unknown>;
  if (predicate(record)) return true;
  return Object.values(record).some(value => containsSqlPart(value, predicate, seen));
}

function hasSubcontractorScope(whereClause: unknown, subcontractorId: number): boolean {
  const namesSubcontractorColumn = containsSqlPart(
    whereClause,
    value => value.name === "subcontractor_id",
  );
  const bindsSubcontractorId = containsSqlPart(
    whereClause,
    value => value.value === subcontractorId,
  );
  return namesSubcontractorColumn && bindsSubcontractorId;
}

function includesJobId(whereClause: unknown, jobId: number): boolean {
  return containsSqlPart(
    whereClause,
    value =>
      value.value === jobId ||
      (Array.isArray(value.value) && value.value.includes(jobId)),
  );
}

async function authenticatedAgent() {
  h.selectQueue.push([portalSub]);
  const agent = request.agent(app);
  const response = await agent
    .post("/portal/set-pin")
    .send({ token: portalSub.portalToken, pin: "1234" });
  expect(response.status).toBe(200);
  return agent;
}

beforeEach(() => {
  h.selectQueue.length = 0;
  h.consumedSelectSlots = 0;
  h.missingSelectSlots.length = 0;
  h.scenario = "no request";
});

afterEach(() => {
  expect(h.missingSelectSlots, `[${h.scenario}] missing queued select slot(s)`).toHaveLength(0);
  expect(h.selectQueue, `[${h.scenario}] unconsumed queued select slot(s)`).toHaveLength(0);
});

describe("GET /portal/:token — payment history privacy", () => {
  it("returns only the authenticated subcontractor's assignment and payment totals", async () => {
    const agent = await authenticatedAgent();

    // The authenticated sub has the shared job; the other sub has two
    // assignments, including a different payment on that same shared job.
    // These are the rows the scoped SQL queries should return for this token.
    h.selectQueue.push(
      [pinnedPortalSub], // requirePinSession: token lookup
      [pinnedPortalSub], // route: token lookup
      ({ whereClause }) => {
        const rows = hasSubcontractorScope(whereClause, portalSub.id)
          ? junctionAssignments.filter(row => row.subcontractorId === portalSub.id)
          : junctionAssignments;
        return rows.map(({ jobId }) => ({ jobId }));
      },
      ({ whereClause }) => {
        if (whereClause === undefined) return allJobs;
        return allJobs.filter(job =>
          (hasSubcontractorScope(whereClause, portalSub.id) &&
            job.subcontractorId === portalSub.id) ||
          includesJobId(whereClause, job.id),
        );
      },
      [], // this sub's expenses
      [], // this sub's mileage
      [], // allocation pool: invoices
      [], // allocation pool: expenses
      [], // allocation pool: allocated expenses
      [], // allocation pool: hourly labor
      [], // allocation pool: fixed payments
      [], // allocation pool: accrued bonuses
      [], // allocation pool: settings
      ({ whereClause }) => assignments.filter(row =>
        includesJobId(whereClause, row.jobId) &&
        (
          !hasSubcontractorScope(whereClause, portalSub.id) ||
          row.subcontractorId === portalSub.id
        ),
      ),
      [], // this sub's hourly totals
      [], // YTD payment count
    );

    h.scenario = "GET /portal/:token";
    const response = await agent.get(`/portal/${portalSub.portalToken}`);

    expect(response.status).toBe(200);
    expect(response.body.paymentHistory).toEqual([
      {
        jobId: sharedJob.id,
        jobTitle: sharedJob.title,
        compensationType: "fixed",
        amountOwed: 125,
        amountPaid: 100,
        paymentStatus: "partial",
      },
    ]);
    expect(response.body.paymentHistory).not.toContainEqual(
      expect.objectContaining({
        jobId: otherOnlyJob.id,
        compensationType: "allocation",
        amountOwed: 750,
        amountPaid: 0,
        paymentStatus: "unpaid",
      }),
    );
    expect(response.body.paymentHistory).not.toContainEqual(
      expect.objectContaining({
        jobId: sharedJob.id,
        compensationType: "hourly",
        amountOwed: 900,
        amountPaid: 900,
        paymentStatus: "paid",
      }),
    );
    expect(response.body.jobs).toEqual([
      expect.objectContaining({ id: sharedJob.id, title: sharedJob.title }),
    ]);
    expect(response.body.jobs).not.toContainEqual(
      expect.objectContaining({ id: otherOnlyJob.id }),
    );
  });
});