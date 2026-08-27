import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  consumedSlots: 0,
  missingSlots: [] as number[],
  scope: { id: 1, slug: "general_contracting" } as { id: number; slug: string } | null,
  updatePayloads: [] as any[],
}));

vi.mock("@workspace/db", () => {
  function selectChain() {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (value: any) => any, reject: (error: any) => any) {
        const slot = h.consumedSlots++;
        const queued = h.selectQueue.shift();
        if (queued === undefined) {
          h.missingSlots.push(slot);
          return Promise.reject(new Error(`missing queued query slot [${slot}]`)).then(resolve, reject);
        }
        return Promise.resolve(queued).then(resolve, reject);
      },
    };
    return chain;
  }
  return {
    db: {
      select: () => selectChain(),
      update: () => ({
        set: (values: any) => {
          h.updatePayloads.push(values);
          return { where: () => Promise.resolve([]) };
        },
      }),
    },
  };
});

vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async () => h.scope,
  invalidBusinessScope: () => false,
  belongsToBusiness: (record: { businessId?: number | null; businessLine?: string | null }, scope: { id: number; slug: string } | null) =>
    !scope || (record.businessId != null ? record.businessId === scope.id : record.businessLine === scope.slug),
}));

vi.mock("./guards", () => ({ getRequestUser: () => ({ id: "user_1", firstName: "Test", lastName: "User" }) }));
vi.mock("../lib/objectStorage.js", () => ({ ObjectStorageService: class {} }));

const { default: jobChecklistsRouter } = await import("./job-checklists");

const app = express();
app.use(express.json());
app.use("/jobs", jobChecklistsRouter);

beforeEach(() => {
  h.selectQueue.length = 0;
  h.consumedSlots = 0;
  h.missingSlots.length = 0;
  h.updatePayloads.length = 0;
  h.scope = { id: 1, slug: "general_contracting" };
});

afterEach(() => {
  expect(h.missingSlots).toHaveLength(0);
  expect(h.selectQueue).toHaveLength(0);
});

describe("GET /jobs/schedule-overview", () => {
  it("rejects invalid date-only ranges before querying schedule data", async () => {
    const response = await request(app).get("/jobs/schedule-overview?from=2026-02-30&to=2026-03-01");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("valid YYYY-MM-DD");
    expect(h.consumedSlots).toBe(0);
  });

  it("keeps the range day-level, includes unscheduled checklist work, and isolates businesses", async () => {
    h.selectQueue.push([
      {
        id: 1,
        title: "In range",
        status: "scheduled",
        businessId: 1,
        businessLine: "general_contracting",
        startDate: "2026-08-27",
        endDate: "2026-08-29",
      },
      {
        id: 2,
        title: "Other business",
        status: "scheduled",
        businessId: 2,
        businessLine: "general_contracting",
        startDate: "2026-08-27",
        endDate: "2026-08-27",
      },
    ]);
    h.selectQueue.push([{ id: 10, jobId: 1 }]);
    h.selectQueue.push([
      {
        item: {
          id: 100,
          jobChecklistId: 10,
          title: "Set forms",
          completed: false,
          skipped: false,
          scheduledDate: "2026-08-28",
          assignedSubcontractorId: 7,
        },
        sectionName: "Prep",
        sectionActive: true,
        assignedSubcontractorName: "James Willard",
      },
      {
        item: {
          id: 101,
          jobChecklistId: 10,
          title: "Confirm access",
          completed: false,
          skipped: false,
          scheduledDate: null,
          assignedSubcontractorId: null,
        },
        sectionName: "Prep",
        sectionActive: true,
        assignedSubcontractorName: null,
      },
      {
        item: {
          id: 102,
          jobChecklistId: 10,
          title: "Later work",
          completed: false,
          skipped: false,
          scheduledDate: "2026-09-10",
          assignedSubcontractorId: null,
        },
        sectionName: "Closeout",
        sectionActive: true,
        assignedSubcontractorName: null,
      },
    ]);

    const response = await request(app)
      .get("/jobs/schedule-overview?from=2026-08-27&to=2026-08-29");

    expect(response.status).toBe(200);
    expect(response.body.jobs).toHaveLength(1);
    expect(response.body.jobs[0].title).toBe("In range");
    expect(response.body.jobs[0].status).toBe("scheduled");
    expect(response.body.jobs[0].checklistItems.map((item: any) => item.id)).toEqual([100]);
    expect(response.body.jobs[0].checklistItems[0].scheduledDate).toBe("2026-08-28");
    expect(response.body.jobs[0].unscheduledChecklistItems.map((item: any) => item.id)).toEqual([101]);
  });

  it("excludes completed jobs from active planning even when they have no dates", async () => {
    h.selectQueue.push([{
      id: 3,
      title: "Needs a date",
      status: "completed",
      businessId: 1,
      businessLine: "general_contracting",
      startDate: null,
      endDate: null,
    }]);
    const response = await request(app)
      .get("/jobs/schedule-overview?from=2026-08-27&to=2027-08-27");

    expect(response.status).toBe(200);
    expect(response.body.jobs).toHaveLength(0);
  });

  it("excludes completed, skipped, and inactive-section items from planning", async () => {
    h.selectQueue.push([{
      id: 4,
      title: "Active work",
      status: "scheduled",
      closedAt: null,
      businessId: 1,
      businessLine: "general_contracting",
      startDate: "2026-08-27",
      endDate: "2026-08-29",
    }]);
    h.selectQueue.push([{ id: 40, jobId: 4 }]);
    h.selectQueue.push([
      {
        item: { id: 401, jobChecklistId: 40, title: "Done", completed: true, skipped: false, scheduledDate: null, assignedSubcontractorId: null },
        sectionName: "Prep", sectionActive: true, assignedSubcontractorName: null,
      },
      {
        item: { id: 402, jobChecklistId: 40, title: "Not applicable", completed: false, skipped: true, scheduledDate: null, assignedSubcontractorId: null },
        sectionName: "Prep", sectionActive: true, assignedSubcontractorName: null,
      },
      {
        item: { id: 403, jobChecklistId: 40, title: "Inactive section", completed: false, skipped: false, scheduledDate: null, assignedSubcontractorId: null },
        sectionName: "Optional", sectionActive: false, assignedSubcontractorName: null,
      },
      {
        item: { id: 404, jobChecklistId: 40, title: "Actionable", completed: false, skipped: false, scheduledDate: "2026-08-28", assignedSubcontractorId: 7 },
        sectionName: "Prep", sectionActive: true, assignedSubcontractorName: "James Willard",
      },
    ]);

    const response = await request(app).get("/jobs/schedule-overview?from=2026-08-27&to=2026-08-29");

    expect(response.status).toBe(200);
    expect(response.body.jobs).toHaveLength(1);
    expect(response.body.jobs[0].checklistItems.map((item: any) => item.id)).toEqual([404]);
    expect(response.body.jobs[0].unscheduledChecklistItems).toEqual([]);
  });
});

describe("PATCH /jobs/:jobId/checklist/items/:itemId", () => {
  it("rejects a subcontractor who is not assigned to the job", async () => {
    h.selectQueue.push(
      [{ id: 1, businessId: 1, businessLine: "general_contracting" }],
      [{ id: 10, jobId: 1 }],
      [{ id: 100, jobChecklistId: 10, jobChecklistSectionId: 20, completed: false, skipped: false }],
      [],
    );

    const response = await request(app)
      .patch("/jobs/1/checklist/items/100?businessId=1")
      .send({ assignedSubcontractorId: 999 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("assigned to this job");
    expect(h.updatePayloads).toHaveLength(0);
  });

  it("updates checklist completion without mutating job status or Route Planner state", async () => {
    const item = {
      id: 100,
      jobChecklistId: 10,
      jobChecklistSectionId: 20,
      title: "Set forms",
      completed: false,
      completedAt: null,
      completedByUserId: null,
      completedByName: null,
      skipped: false,
      skippedAt: null,
      notes: null,
      sortOrder: 0,
      scheduledDate: "2026-08-28",
      assignedSubcontractorId: null,
    };
    const section = {
      id: 20,
      jobChecklistId: 10,
      name: "Prep",
      active: true,
      notes: null,
      sortOrder: 0,
      percentComplete: "0",
      completedAt: null,
    };
    h.selectQueue.push(
      [{ id: 1, businessId: 1, businessLine: "general_contracting", status: "scheduled", closedAt: null }],
      [{ id: 10, jobId: 1, templateName: "Prep", shareToken: "token", shareEnabled: true, statusOverride: null }],
      [item],
      [],
      [item],
      [],
      [{ id: 10, jobId: 1, templateName: "Prep", shareToken: "token", shareEnabled: true, statusOverride: null }],
      [section],
      [{ ...item, completed: true }],
      [],
      [],
      [],
      [],
      [],
      [],
    );

    const response = await request(app)
      .patch("/jobs/1/checklist/items/100?businessId=1")
      .send({ completed: true });

    expect(response.status).toBe(200);
    expect(response.body.sections[0].items[0].completed).toBe(true);
    expect(h.updatePayloads.every(payload => !("status" in payload) && !("closedAt" in payload))).toBe(true);
  });
});