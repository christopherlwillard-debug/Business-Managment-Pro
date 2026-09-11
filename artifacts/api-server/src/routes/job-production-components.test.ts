import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

type BusinessScope = { id: number; slug: string };

const h = vi.hoisted(() => ({
  scope: { id: 1, slug: "general_contracting" } as BusinessScope | null,
  jobs: [] as any[],
  services: [] as any[],
  components: [] as any[],
  nextJobId: 100,
  nextComponentId: 1,
  supersedeKey: null as string | null,
  statusTarget: null as string | null,
  updatePayloads: [] as Record<string, unknown>[],
}));

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<any>("@workspace/db");

  function tableName(table: any): string {
    return table?.[Symbol.for("drizzle:Name")] ?? table?._?.name ?? "";
  }

  function currentJob() {
    return h.jobs[0] ?? null;
  }

  function selectResult(table: any, projection: any): any[] {
    const name = tableName(table);
    if (name === "jobs") {
      if (projection && Object.prototype.hasOwnProperty.call(projection, "maxNum")) {
        return [{ maxNum: h.jobs.reduce((max, job) => Math.max(max, Number(job.jobNumber ?? 0)), 0) }];
      }
      const job = currentJob();
      return job ? [{ ...job, subcontractorId: null, subcontractorName: null }] : [];
    }
    if (name === "production_service_types") {
      const job = currentJob();
      const selected = new Set(
        Array.isArray(job?.mhProductionServices) ? job.mhProductionServices.map(Number) : [],
      );
      return h.services.filter(service => selected.has(service.id));
    }
    if (name === "job_production_components") {
      return h.components.slice();
    }
    return [];
  }

  function selectChain(projection: any) {
    let table: any;
    const chain: any = {
      from(value: any) {
        table = value;
        return chain;
      },
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve(selectResult(table, projection)).then(resolve, reject);
      },
    };
    return chain;
  }

  function applyUpdate(table: any, payload: Record<string, unknown>): any[] {
    const name = tableName(table);
    h.updatePayloads.push(payload);

    if (name === "jobs") {
      const job = currentJob();
      if (!job) return [];
      Object.assign(job, payload);
      return [job];
    }

    if (name === "job_production_components") {
      let row = h.components.find(component => {
        if (payload.supersededAt !== undefined) {
          return component.componentInstanceKey === h.supersedeKey && component.supersededAt == null;
        }
        if (payload.status !== undefined) {
          return component.componentInstanceKey === h.statusTarget && component.supersededAt == null;
        }
        return false;
      });
      if (!row) row = h.components.find(component => component.supersededAt == null);
      if (!row) return [];
      Object.assign(row, payload);
      return [row];
    }

    return [];
  }

  function updateChain(table: any) {
    let payload: Record<string, unknown> = {};
    let applied = false;
    const chain: any = {
      set(value: Record<string, unknown>) {
        payload = value;
        return chain;
      },
      where: () => chain,
      returning() {
        applied = true;
        return Promise.resolve(applyUpdate(table, payload));
      },
      then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
        if (!applied) {
          applied = true;
          return Promise.resolve(applyUpdate(table, payload)).then(resolve, reject);
        }
        return Promise.resolve([]).then(resolve, reject);
      },
    };
    return chain;
  }

  function insertChain(table: any) {
    let payload: any;
    let persisted = false;
    let result: any[] = [];

    function persist() {
      if (persisted) return result;
      persisted = true;
      const name = tableName(table);
      if (name === "jobs") {
        const job = {
          id: h.nextJobId++,
          title: payload.title,
          description: payload.description ?? null,
          clientId: payload.clientId ?? null,
          status: payload.status ?? "scheduled",
          jobType: payload.jobType ?? null,
          homeModel: payload.homeModel ?? null,
          address: payload.address ?? null,
          city: payload.city ?? null,
          state: payload.state ?? null,
          locationName: payload.locationName ?? null,
          startDate: payload.startDate ?? null,
          endDate: payload.endDate ?? null,
          closedAt: null,
          notes: payload.notes ?? null,
          businessLine: payload.businessLine ?? null,
          businessId: payload.businessId ?? null,
          workflow: payload.workflow ?? null,
          planningState: payload.planningState ?? "ready",
          priority: payload.priority ?? "normal",
          resourceDemand: payload.resourceDemand ?? "standard",
          queuePosition: payload.queuePosition ?? null,
          subPaid: false,
          sqFt: payload.sqFt ?? null,
          coats: payload.coats ?? null,
          phases: payload.phases ?? null,
          permitChecklist: payload.permitChecklist ?? null,
          serviceBilling: payload.serviceBilling ?? null,
          mfhManufacturerId: payload.mfhManufacturerId ?? null,
          mfhModelId: payload.mfhModelId ?? null,
          mfhModelYear: payload.mfhModelYear ?? null,
          mfhConstructionType: payload.mfhConstructionType ?? null,
          mhProductionServices: payload.mhProductionServices ?? null,
          manHours: payload.manHours ?? null,
          daysOnJob: payload.daysOnJob ?? 1,
          jobNumber: payload.jobNumber ?? h.nextJobId,
          createdAt: new Date("2026-09-11T12:00:00Z"),
        };
        h.jobs.splice(0, h.jobs.length, job);
        result = [job];
        return result;
      }

      if (name === "job_production_components") {
        const row = {
          ...payload,
          id: h.nextComponentId++,
          snapshotVersion: payload.snapshotVersion ?? 1,
          status: payload.status ?? "planned",
          supersededAt: payload.supersededAt ?? null,
          capturedAt: payload.capturedAt ?? new Date("2026-09-11T12:00:00Z"),
          createdAt: payload.createdAt ?? new Date("2026-09-11T12:00:00Z"),
          updatedAt: payload.updatedAt ?? new Date("2026-09-11T12:00:00Z"),
        };
        h.components.push(row);
        result = [row];
        return result;
      }

      return result;
    }

    const chain: any = {
      values(value: any) {
        payload = value;
        return chain;
      },
      onConflictDoUpdate: () => chain,
      returning() {
        return Promise.resolve(persist());
      },
      then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve(persist()).then(resolve, reject);
      },
    };
    return chain;
  }

  const db: any = {
    select: (projection?: any) => selectChain(projection),
    insert: (table: any) => insertChain(table),
    update: (table: any) => updateChain(table),
    delete: () => ({ where: () => Promise.resolve() }),
    transaction: async (callback: (tx: any) => Promise<void>) => callback(db),
  };

  return { ...actual, db };
});

vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async () => h.scope,
  resolveMutationBusiness: async () => h.scope
    ? { ok: true, explicit: true, business: h.scope }
    : { ok: false, error: "Unknown business" },
  canonicalRecordBusiness: async (record: { businessId?: number | null; businessLine?: string | null }) => {
    if (!h.scope) return { state: "blank" };
    if (record.businessId === h.scope.id || record.businessLine === h.scope.slug) {
      return { state: "resolved", business: h.scope };
    }
    return { state: "resolved", business: { id: Number(record.businessId), slug: String(record.businessLine) } };
  },
  invalidBusinessScope: () => false,
  belongsToBusiness: (record: { businessId?: number | null; businessLine?: string | null }, scope: BusinessScope | null) =>
    !scope || (record.businessId != null ? record.businessId === scope.id : record.businessLine === scope.slug),
  generalContractingBusiness: async () => ({ id: 1, slug: "general_contracting" }),
}));

vi.mock("./guards", () => ({
  getRequestUser: () => ({ id: "user_1", firstName: "Authenticated", lastName: "Tester" }),
}));

const { default: jobsRouter } = await import("./jobs");

const app = express();
app.use(express.json());
app.use("/jobs", jobsRouter);

function jobDefaults(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    title: "Production home",
    description: null,
    clientId: null,
    status: "scheduled",
    jobType: "manufactured_home",
    homeModel: null,
    address: "123 Main St",
    city: "Vincennes",
    state: "IN",
    locationName: "Lot 10",
    startDate: null,
    endDate: null,
    closedAt: null,
    notes: null,
    businessLine: "general_contracting",
    businessId: 1,
    workflow: "mh_production",
    planningState: "ready",
    priority: "normal",
    resourceDemand: "standard",
    queuePosition: null,
    subPaid: false,
    sqFt: null,
    coats: null,
    phases: null,
    permitChecklist: null,
    serviceBilling: null,
    mfhManufacturerId: null,
    mfhModelId: null,
    mfhModelYear: null,
    mfhConstructionType: "LOT_VOG",
    mhProductionServices: [101, 102, 103, 104],
    manHours: "12",
    daysOnJob: 4,
    jobNumber: 10,
    createdAt: new Date("2026-09-11T12:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  h.scope = { id: 1, slug: "general_contracting" };
  h.jobs.splice(0, h.jobs.length);
  h.services.splice(0, h.services.length,
    {
      id: 101,
      name: "VOG Interior Finish",
      itemKey: "vog",
      category: "Interior",
      appliesTo: "production",
      businessId: null,
      billingType: "fixed",
      price: "100",
      priceVog: null,
      priceHybrid: null,
      priceDrywall: null,
    },
    {
      id: 102,
      name: "Service Call",
      itemKey: "service_call",
      category: "Service",
      appliesTo: "service",
      businessId: null,
      billingType: "fixed",
      price: "25",
      priceVog: null,
      priceHybrid: null,
      priceDrywall: null,
    },
    {
      id: 103,
      name: "Travel Surcharge",
      itemKey: "travel_surcharge",
      category: "Travel",
      appliesTo: "production",
      businessId: null,
      billingType: "fixed",
      price: "50",
      priceVog: null,
      priceHybrid: null,
      priceDrywall: null,
    },
    {
      id: 104,
      name: "Siding",
      itemKey: "siding",
      category: "Exterior",
      appliesTo: "production",
      businessId: null,
      billingType: "fixed",
      price: "200",
      priceVog: null,
      priceHybrid: null,
      priceDrywall: null,
    },
  );
  h.components.splice(0, h.components.length);
  h.nextJobId = 100;
  h.nextComponentId = 1;
  h.supersedeKey = null;
  h.statusTarget = null;
  h.updatePayloads.length = 0;
});

afterEach(() => {
  expect(h.updatePayloads).not.toContainEqual(expect.objectContaining({ businessId: 2 }));
});

describe("authenticated production component Jobs API", () => {
  it("creates and updates a job while preserving legacy service selections and versioning changed snapshots", async () => {
    const created = await request(app)
      .post("/jobs")
      .send({
        title: "Versioned production home",
        workflow: "mh_production",
        mhProductionServices: [101, 102, 103, 104],
        businessId: 1,
      });

    expect(created.status).toBe(201);
    expect(created.body.mhProductionServices).toEqual([101, 102, 103, 104]);
    expect(created.body.productionComponents.map((component: any) => component.componentInstanceKey))
      .toEqual(["interior_finish:vog", "siding:unspecified"]);
    expect(created.body.productionComponents.every((component: any) => component.persisted)).toBe(true);

    const initialRows = h.components.map(row => ({ ...row }));
    expect(initialRows).toHaveLength(2);
    expect(initialRows.every(row => row.snapshotVersion === 1 && row.supersededAt == null)).toBe(true);
    expect(initialRows.flatMap(row => row.sourceServiceIds)).not.toContain(102);
    expect(initialRows.flatMap(row => row.sourceServiceIds)).not.toContain(103);

    h.services.find(service => service.id === 101).name = "VOG Interior Finish — catalog label revised";
    h.supersedeKey = "interior_finish:vog";

    const updated = await request(app)
      .put("/jobs/100")
      .send({
        title: "Versioned production home",
        workflow: "mh_production",
        mhProductionServices: [101, 102, 103, 104],
        businessId: 1,
      });

    expect(updated.status).toBe(200);
    expect(updated.body.mhProductionServices).toEqual([101, 102, 103, 104]);

    const interiorRows = h.components.filter(row => row.componentInstanceKey === "interior_finish:vog");
    expect(interiorRows).toHaveLength(2);
    expect(interiorRows.map(row => row.snapshotVersion).sort()).toEqual([1, 2]);
    expect(interiorRows.find(row => row.snapshotVersion === 1)?.supersededAt).not.toBeNull();
    expect(interiorRows.find(row => row.snapshotVersion === 2)?.supersededAt).toBeNull();
    expect(interiorRows.find(row => row.snapshotVersion === 1)?.sourceServices[0].name)
      .toBe("VOG Interior Finish");
    expect(interiorRows.find(row => row.snapshotVersion === 2)?.sourceServices[0].name)
      .toContain("catalog label revised");
  });

  it("changes only the selected current component status", async () => {
    h.jobs.push(jobDefaults());
    const snapshot = await request(app)
      .post("/jobs/10/production-components/snapshot")
      .send({ businessId: 1 });

    expect(snapshot.status).toBe(201);
    h.statusTarget = "siding:unspecified";

    const response = await request(app)
      .patch("/jobs/10/production-components/status")
      .send({ businessId: 1, componentInstanceKey: "siding:unspecified", status: "completed" });

    expect(response.status).toBe(200);
    expect(response.body.componentInstanceKey).toBe("siding:unspecified");
    expect(response.body.status).toBe("completed");
    expect(h.components.find(row => row.componentInstanceKey === "siding:unspecified")?.status).toBe("completed");
    expect(h.components.find(row => row.componentInstanceKey === "interior_finish:vog")?.status).toBe("planned");
  });

  it("denies reads, snapshots, and status mutations for a job owned by another business", async () => {
    h.jobs.push(jobDefaults({
      id: 20,
      businessId: 2,
      businessLine: "asphalt_sealing",
      mhProductionServices: [101, 104],
    }));
    h.scope = { id: 1, slug: "general_contracting" };

    const read = await request(app).get("/jobs/20/production-components?businessId=1");
    const snapshot = await request(app)
      .post("/jobs/20/production-components/snapshot?businessId=1")
      .send({});
    const status = await request(app)
      .patch("/jobs/20/production-components/status?businessId=1")
      .send({ componentInstanceKey: "siding:siding", status: "completed" });

    expect(read.status).toBe(404);
    expect(snapshot.status).toBe(404);
    expect(status.status).toBe(404);
    expect(h.components).toHaveLength(0);
    expect(h.updatePayloads).toHaveLength(0);
  });

  it("returns current and superseded snapshots with source services and denies cross-business history reads", async () => {
    h.jobs.push(jobDefaults({ id: 40 }));
    h.components.push(
      {
        id: 1,
        jobId: 40,
        businessId: 1,
        componentKey: "interior_finish",
        componentInstanceKey: "interior_finish:vog",
        componentLabel: "Interior Finish",
        variant: "vog",
        sourceServiceIds: [101],
        sourceServices: [h.services[0]],
        snapshotVersion: 1,
        status: "planned",
        expectedLaborHours: "12",
        expectedDurationDays: 2,
        expectedCrewSize: 2,
        checklistContext: null,
        materialContext: null,
        pricingContext: null,
        knowledgeContext: null,
        capturedAt: new Date("2026-09-10T12:00:00Z"),
        supersededAt: new Date("2026-09-11T12:00:00Z"),
      },
      {
        id: 2,
        jobId: 40,
        businessId: 1,
        componentKey: "interior_finish",
        componentInstanceKey: "interior_finish:vog",
        componentLabel: "Interior Finish",
        variant: "vog",
        sourceServiceIds: [101],
        sourceServices: [{ ...h.services[0], name: "VOG Interior Finish — revised" }],
        snapshotVersion: 2,
        status: "in_progress",
        expectedLaborHours: "14",
        expectedDurationDays: 3,
        expectedCrewSize: 2,
        checklistContext: null,
        materialContext: null,
        pricingContext: null,
        knowledgeContext: null,
        capturedAt: new Date("2026-09-11T12:00:00Z"),
        supersededAt: null,
      },
    );

    const response = await request(app).get("/jobs/40/production-components/history?businessId=1");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    const current = response.body.find((component: any) => component.snapshotVersion === 2);
    const superseded = response.body.find((component: any) => component.snapshotVersion === 1);
    expect(current).toEqual(expect.objectContaining({
      snapshotVersion: 2,
      supersededAt: null,
      capturedAt: "2026-09-11T12:00:00.000Z",
      sourceServices: [expect.objectContaining({ name: "VOG Interior Finish — revised" })],
    }));
    expect(superseded).toEqual(expect.objectContaining({
      snapshotVersion: 1,
      supersededAt: "2026-09-11T12:00:00.000Z",
      sourceServices: [expect.objectContaining({ name: "VOG Interior Finish" })],
    }));

    h.jobs[0].businessId = 2;
    const denied = await request(app).get("/jobs/40/production-components/history?businessId=1");
    expect(denied.status).toBe(404);
  });

  it("keeps legacy service selections readable after the persisted component projection is queried", async () => {
    h.jobs.push(jobDefaults({ id: 30, mhProductionServices: [101, 102, 103, 104] }));

    const snapshot = await request(app)
      .post("/jobs/30/production-components/snapshot")
      .send({ businessId: 1 });
    expect(snapshot.status).toBe(201);

    const job = await request(app).get("/jobs/30?businessId=1");
    expect(job.status).toBe(200);
    expect(job.body.mhProductionServices).toEqual([101, 102, 103, 104]);
    expect(job.body.productionComponents).toEqual(expect.arrayContaining([
      expect.objectContaining({ componentInstanceKey: "interior_finish:vog", persisted: true }),
      expect.objectContaining({ componentInstanceKey: "siding:unspecified", persisted: true }),
    ]));
  });
});