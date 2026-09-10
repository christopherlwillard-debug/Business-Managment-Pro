import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  businessLookup: [] as Array<{ id: number; slug: string }>,
  auditRows: [] as any[],
  auditQueries: 0,
  auditSql: "",
  auditParams: [] as unknown[],
}));

vi.mock("@workspace/db", () => {
  function chain(projection: Record<string, unknown> | undefined) {
    let whereClause: any;
    const c: any = {
      from: () => c,
      leftJoin: () => c,
      innerJoin: () => c,
      where: (condition: unknown) => {
        whereClause = condition;
        return c;
      },
      orderBy: () => c,
      groupBy: () => c,
      limit: () => c,
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        const keys = Object.keys(projection ?? {});
        if (keys.length === 2 && keys.includes("id") && keys.includes("slug")) {
          return Promise.resolve(h.businessLookup).then(resolve, reject);
        }
        if (keys.includes("invoiceNumber") && keys.includes("verifiedSentAt")) {
          h.auditQueries += 1;
          const query = new PgDialect().sqlToQuery(whereClause.getSQL());
          h.auditSql = query.sql;
          h.auditParams = query.params;
          const [scope] = h.businessLookup;
          const rows = scope
            ? h.auditRows.filter(row =>
                row.status === "paid"
                && (
                  row.businessId === scope.id
                  || (row.businessId == null && row.businessLine === scope.slug)
                )
              )
            : h.auditRows;
          return Promise.resolve(rows).then(resolve, reject);
        }
        return Promise.resolve([]).then(resolve, reject);
      },
    };
    return c;
  }

  return {
    db: {
      select: (projection?: Record<string, unknown>) => chain(projection),
      insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
      delete: () => ({ where: () => Promise.resolve() }),
    },
    accessRequestsTable: {},
    settingsTable: {},
    plaidConnectionsTable: {},
  };
});

vi.mock("./owner-cache", () => ({
  getOwnerCache: () => "owner-1",
  setOwnerCache: vi.fn(),
}));
vi.mock("./subcontractors", () => ({ computeYtd: vi.fn().mockResolvedValue(0) }));
vi.mock("../lib/allocation.js", () => ({
  computeAllocationSplitPools: vi.fn().mockResolvedValue([]),
  computeSubOwed: vi.fn(),
}));
vi.mock("../lib/job-profit-reports.js", () => ({ calculateOwnerPayFromJobProfit: vi.fn() }));
vi.mock("../lib/job-profit-loader.js", () => ({ loadJobProfitByJob: vi.fn() }));
vi.mock("./invoices.js", () => ({ calcInvoiceFromStored: vi.fn() }));

const { default: reportsRouter } = await import("./reports.js");

function createApp(authenticated: boolean) {
  const app = express();
  app.use(express.json());
  if (authenticated) {
    app.use((req, _res, next) => {
      (req as any).user = { id: "owner-1" };
      next();
    });
  }
  app.use("/reports", reportsRouter);
  return app;
}

const authenticatedApp = createApp(true);
const unauthenticatedApp = createApp(false);

beforeEach(() => {
  h.businessLookup = [{ id: 2, slug: "asphalt" }];
  h.auditQueries = 0;
  h.auditSql = "";
  h.auditParams = [];
  h.auditRows = [
    {
      id: 201,
      invoiceNumber: "ASPHALT-CANONICAL",
      status: "paid",
      issueDate: "2026-07-01",
      total: "500.00",
      amountPaid: "450.00",
      businessId: 2,
      businessLine: "asphalt",
      clientName: "Canonical Client",
      jobTitle: "Canonical Job",
      verifiedSentAt: null,
    },
    {
      id: 202,
      invoiceNumber: "ASPHALT-LEGACY",
      status: "paid",
      issueDate: "2026-07-02",
      total: "250.00",
      amountPaid: null,
      businessId: null,
      businessLine: "asphalt",
      clientName: "Legacy Client",
      jobTitle: "Legacy Job",
      verifiedSentAt: null,
    },
    {
      id: 203,
      invoiceNumber: "CONFLICTING-CANONICAL-OWNER",
      status: "paid",
      issueDate: "2026-07-03",
      total: "300.00",
      amountPaid: null,
      businessId: 1,
      businessLine: "asphalt",
      clientName: "Wrong Business",
      jobTitle: "Wrong Business Job",
      verifiedSentAt: null,
    },
    {
      id: 204,
      invoiceNumber: "OTHER-LEGACY",
      status: "paid",
      issueDate: "2026-07-04",
      total: "100.00",
      amountPaid: null,
      businessId: null,
      businessLine: "general_contracting",
      clientName: "Other Legacy Client",
      jobTitle: null,
      verifiedSentAt: null,
    },
    {
      id: 205,
      invoiceNumber: "VERIFIED-DELIVERY",
      status: "paid",
      issueDate: "2026-07-05",
      total: "600.00",
      amountPaid: null,
      businessId: 2,
      businessLine: "asphalt",
      clientName: "Verified Client",
      jobTitle: null,
      verifiedSentAt: new Date("2026-07-06T12:00:00.000Z"),
    },
    {
      id: 206,
      invoiceNumber: "UNPAID-FALLBACK",
      status: "sent",
      issueDate: "2026-07-06",
      total: "700.00",
      amountPaid: null,
      businessId: 2,
      businessLine: "asphalt",
      clientName: "Unpaid Client",
      jobTitle: null,
      verifiedSentAt: null,
    },
  ];
});

describe("GET /reports/invoice-send-date-audit business isolation", () => {
  it("returns only paid fallback invoices canonically or historically owned by the selected business", async () => {
    const response = await request(authenticatedApp)
      .get("/reports/invoice-send-date-audit?businessId=2");

    expect(response.status).toBe(200);
    expect(response.body.estimatedSendDateInvoices.map((row: any) => row.id)).toEqual([201, 202]);
    expect(response.body.estimatedSendDateInvoices.map((row: any) => row.amount)).toEqual([450, 250]);
    expect(response.body.totalCount).toBe(2);
    expect(h.auditQueries).toBe(1);
    expect(h.auditSql).toContain('"invoices"."business_id" = $2');
    expect(h.auditSql).toContain('"invoices"."business_id" is null');
    expect(h.auditSql).toContain('"invoices"."business_line" = $3');
    expect(h.auditParams).toEqual(["paid", 2, "asphalt"]);
  });

  it("rejects an unknown business selector before the audit query runs", async () => {
    h.businessLookup = [];

    const response = await request(authenticatedApp)
      .get("/reports/invoice-send-date-audit?businessId=999999");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Unknown business" });
    expect(h.auditQueries).toBe(0);
  });

  it("keeps the CSV export inside the selected business-line scope", async () => {
    const response = await request(authenticatedApp)
      .get("/reports/invoice-send-date-audit.csv?businessLine=asphalt");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/csv/);
    expect(response.headers["content-disposition"]).toContain("revenue-date-audit.csv");
    expect(response.text).toContain("ASPHALT-CANONICAL");
    expect(response.text).toContain("ASPHALT-LEGACY");
    expect(response.text).not.toContain("CONFLICTING-CANONICAL-OWNER");
    expect(response.text).not.toContain("OTHER-LEGACY");
    expect(response.text).not.toContain("VERIFIED-DELIVERY");
    expect(response.text).not.toContain("UNPAID-FALLBACK");
    expect(h.auditParams).toEqual(["paid", 2, "asphalt"]);
  });

  it("requires an authenticated user", async () => {
    const response = await request(unauthenticatedApp)
      .get("/reports/invoice-send-date-audit?businessId=2");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
    expect(h.auditQueries).toBe(0);
  });
});