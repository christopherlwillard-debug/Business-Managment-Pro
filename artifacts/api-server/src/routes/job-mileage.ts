import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  businessesTable,
  clientsTable,
  expensesTable,
  jobsTable,
  mileageLogsTable,
  settingsTable,
} from "@workspace/db/schema";
import {
  GetJobMileageLegsParams,
  GetJobMileageLegsResponse,
  SyncJobMileageLegsParams,
  SyncJobMileageLegsResponse,
} from "@workspace/api-zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { RoutingEngine, type RouteResult } from "../lib/routing-engine.js";
import { JOB_MILEAGE_SOURCES, type JobMileageSource } from "../lib/mileage-sources.js";
import { wrapAsync } from "./guards";
import { getIrsRateForDate } from "./mileage";

const router = Router();

export { JOB_MILEAGE_SOURCES };

type GeneratedSource = JobMileageSource;
type LegKind = "client_to_jobsite" | "business_to_jobsite";
type LegStatus =
  | "saved"
  | "ready"
  | "outdated"
  | "missing_origin"
  | "missing_destination"
  | "route_unavailable";
type LegAction = "none" | "created" | "updated" | "unchanged";

type JobMileageContext = {
  jobId: number;
  jobTitle: string;
  date: string;
  businessId: number | null;
  businessLine: string | null;
  destination: string;
  clientOrigin: string;
  clientName: string | null;
  hasClient: boolean;
  businessOrigin: string;
};

type ExistingLog = typeof mileageLogsTable.$inferSelect;

type LegCandidate = {
  kind: LegKind;
  source: GeneratedSource;
  label: string;
  purpose: string;
  origin: string;
  destination: string;
  route: RouteResult | null;
  status: LegStatus;
  message: string | null;
  existing: ExistingLog | null;
};

function joinAddress(parts: Array<string | null | undefined>): string {
  return parts.map(part => part?.trim()).filter(Boolean).join(", ");
}

function formatMileage(log: ExistingLog, jobTitle: string) {
  return {
    ...log,
    jobTitle,
    miles: parseFloat(log.miles ?? "0"),
    ratePerMile: parseFloat(log.ratePerMile ?? "0"),
    deductionAmount: parseFloat(log.deductionAmount ?? "0"),
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
  };
}

function sameMoney(left: string | null, right: number): boolean {
  return Math.abs(parseFloat(left ?? "0") - right) < 0.005;
}

export function generatedMileageMatches(
  log: Pick<ExistingLog, "date" | "startLocation" | "endLocation" | "miles" | "businessId" | "classification">,
  expected: {
    date: string;
    origin: string;
    destination: string;
    miles: number;
    businessId: number | null;
  },
): boolean {
  return (
    log.date === expected.date &&
    log.startLocation === expected.origin &&
    log.endLocation === expected.destination &&
    sameMoney(log.miles, expected.miles) &&
    log.businessId === expected.businessId &&
    log.classification === "business"
  );
}

async function loadContext(jobId: number): Promise<JobMileageContext | null> {
  const [[row], [settings]] = await Promise.all([
    db
      .select({
        jobId: jobsTable.id,
        jobTitle: jobsTable.title,
        clientId: jobsTable.clientId,
        businessLine: jobsTable.businessLine,
        jobAddress: jobsTable.address,
        jobCity: jobsTable.city,
        jobState: jobsTable.state,
        startDate: jobsTable.startDate,
        clientName: clientsTable.name,
        clientAddress: clientsTable.address,
        clientCity: clientsTable.city,
        clientState: clientsTable.state,
        clientZip: clientsTable.zip,
      })
      .from(jobsTable)
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .where(eq(jobsTable.id, jobId))
      .limit(1),
    db
      .select({
        companyAddress: settingsTable.companyAddress,
        companyCity: settingsTable.companyCity,
        companyState: settingsTable.companyState,
        companyZip: settingsTable.companyZip,
      })
      .from(settingsTable)
      .limit(1),
  ]);

  if (!row) return null;

  let business: {
    id: number;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null = null;
  if (row.businessLine) {
    const [matchedBusiness] = await db
      .select({
        id: businessesTable.id,
        address: businessesTable.address,
        city: businessesTable.city,
        state: businessesTable.state,
        zip: businessesTable.zip,
      })
      .from(businessesTable)
      .where(eq(businessesTable.slug, row.businessLine))
      .limit(1);
    business = matchedBusiness ?? null;
  }
  if (business == null) {
    const [primaryBusiness] = await db
      .select({
        id: businessesTable.id,
        address: businessesTable.address,
        city: businessesTable.city,
        state: businessesTable.state,
        zip: businessesTable.zip,
      })
      .from(businessesTable)
      .orderBy(asc(businessesTable.sortOrder), asc(businessesTable.id))
      .limit(1);
    business = primaryBusiness ?? null;
  }

  const rawDate = row.startDate?.slice(0, 10) ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : new Date().toISOString().slice(0, 10);

  const businessAddress = joinAddress([
    business?.address,
    business?.city,
    business?.state,
    business?.zip,
  ]);

  return {
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    date,
    businessId: business?.id ?? null,
    businessLine: row.businessLine,
    destination: joinAddress([row.jobAddress, row.jobCity, row.jobState]),
    clientOrigin: joinAddress([row.clientAddress, row.clientCity, row.clientState, row.clientZip]),
    clientName: row.clientName,
    hasClient: row.clientId != null,
    businessOrigin: businessAddress || joinAddress([
        settings?.companyAddress,
        settings?.companyCity,
        settings?.companyState,
        settings?.companyZip,
      ]),
  };
}

function routeFailureMessage(route: RouteResult): string {
  if (route.routeStatus === "geocoding_failed") {
    return "Couldn’t map this route. Check both street addresses, cities, and states.";
  }
  return "Couldn’t calculate this driving route. Try refreshing it again.";
}

async function buildCandidates(context: JobMileageContext): Promise<LegCandidate[]> {
  const existingLogs = await db
    .select()
    .from(mileageLogsTable)
    .where(
      and(
        eq(mileageLogsTable.jobId, context.jobId),
        inArray(mileageLogsTable.source, Object.values(JOB_MILEAGE_SOURCES)),
      ),
    );
  const existingBySource = new Map(existingLogs.map(log => [log.source, log]));

  const definitions: Array<{
    kind: LegKind;
    source: GeneratedSource;
    label: string;
    purpose: string;
    origin: string;
    missingOriginMessage: string;
  }> = [
    {
      kind: "client_to_jobsite",
      source: JOB_MILEAGE_SOURCES.client,
      label: "Client → Jobsite",
      purpose: `Client location to jobsite — ${context.jobTitle}`,
      origin: context.clientOrigin,
      missingOriginMessage: context.hasClient
        ? `Add a complete address to ${context.clientName ?? "the linked client"}.`
        : "Link this job to a client with an address.",
    },
    {
      kind: "business_to_jobsite",
      source: JOB_MILEAGE_SOURCES.business,
      label: "Business → Jobsite",
      purpose: `Business address to jobsite — ${context.jobTitle}`,
      origin: context.businessOrigin,
      missingOriginMessage: "Add an address to this business or set the company address in Settings.",
    },
  ];

  const routes = await Promise.all(
    definitions.map(definition =>
      definition.origin && context.destination
        ? RoutingEngine.calculate({
            origin: definition.origin,
            destination: context.destination,
          })
        : Promise.resolve(null),
    ),
  );

  return definitions.map((definition, index) => {
    const existing = existingBySource.get(definition.source) ?? null;
    const route = routes[index];

    if (!context.destination) {
      return {
        ...definition,
        destination: context.destination,
        route,
        existing,
        status: "missing_destination",
        message: "Add a jobsite address to this job.",
      };
    }
    if (!definition.origin) {
      return {
        ...definition,
        destination: context.destination,
        route,
        existing,
        status: "missing_origin",
        message: definition.missingOriginMessage,
      };
    }
    if (!route || route.routeStatus !== "ok" || route.miles == null) {
      return {
        ...definition,
        destination: context.destination,
        route,
        existing,
        status: "route_unavailable",
        message: route ? routeFailureMessage(route) : "Couldn’t calculate this driving route.",
      };
    }

    const matches =
      existing != null &&
      generatedMileageMatches(existing, {
        date: context.date,
        origin: definition.origin,
        destination: context.destination,
        miles: route.miles,
        businessId: context.businessId,
      });

    return {
      ...definition,
      destination: context.destination,
      route,
      existing,
      status: existing ? (matches ? "saved" : "outdated") : "ready",
      message: existing && !matches
        ? "The saved mileage is based on older job or address details."
        : null,
    };
  });
}

function presentLeg(context: JobMileageContext, candidate: LegCandidate, action: LegAction = "none") {
  return {
    kind: candidate.kind,
    label: candidate.label,
    status: candidate.status,
    action,
    origin: candidate.origin || null,
    destination: candidate.destination || null,
    miles: candidate.route?.miles ?? (
      candidate.existing ? parseFloat(candidate.existing.miles ?? "0") : null
    ),
    message: candidate.message,
    log: candidate.existing ? formatMileage(candidate.existing, context.jobTitle) : null,
  };
}

async function getLegResponse(jobId: number) {
  const context = await loadContext(jobId);
  if (!context) return null;
  const candidates = await buildCandidates(context);
  return {
    jobId: context.jobId,
    date: context.date,
    legs: candidates.map(candidate => presentLeg(context, candidate)),
  };
}

router.get(
  "/jobs/:jobId/legs",
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = GetJobMileageLegsParams.safeParse({ jobId: req.params.jobId });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid job ID" });
      return;
    }

    const response = await getLegResponse(parsed.data.jobId);
    if (!response) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(GetJobMileageLegsResponse.parse(response));
  }),
);

router.post(
  "/jobs/:jobId/legs/sync",
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = SyncJobMileageLegsParams.safeParse({ jobId: req.params.jobId });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid job ID" });
      return;
    }

    const context = await loadContext(parsed.data.jobId);
    if (!context) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const candidates = await buildCandidates(context);
    const actions = new Map<GeneratedSource, LegAction>();

    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${context.jobId}, 1959)`);

      const lockedExisting = await tx
        .select()
        .from(mileageLogsTable)
        .where(
          and(
            eq(mileageLogsTable.jobId, context.jobId),
            inArray(mileageLogsTable.source, Object.values(JOB_MILEAGE_SOURCES)),
          ),
        );
      const existingBySource = new Map(lockedExisting.map(log => [log.source, log]));

      for (const candidate of candidates) {
        const miles = candidate.route?.miles;
        if (candidate.route?.routeStatus !== "ok" || miles == null) {
          actions.set(candidate.source, "unchanged");
          continue;
        }

        const rate = getIrsRateForDate(context.date);
        const deductionAmount = miles * rate;
        const existing = existingBySource.get(candidate.source) ?? null;
        const matches =
          existing != null &&
          generatedMileageMatches(existing, {
            date: context.date,
            origin: candidate.origin,
            destination: candidate.destination,
            miles,
            businessId: context.businessId,
          }) &&
          sameMoney(existing.ratePerMile, rate) &&
          sameMoney(existing.deductionAmount, deductionAmount);

        if (matches && existing.expenseId) {
          actions.set(candidate.source, "unchanged");
          continue;
        }

        const expenseValues = {
          date: context.date,
          description: `Mileage: ${candidate.purpose} (${miles.toFixed(2)} mi)`,
          vendor: "IRS Mileage",
          category: "mileage",
          amount: deductionAmount.toFixed(2),
          jobId: context.jobId,
          businessLine: context.businessLine,
          businessId: context.businessId,
          notes: `Auto-created from job mileage. ${miles.toFixed(2)} mi × $${rate}/mi`,
          sourceType: candidate.source,
          sourceId: context.jobId,
        };

        let expenseId = existing?.expenseId ?? null;
        if (expenseId) {
          await tx.update(expensesTable).set(expenseValues).where(eq(expensesTable.id, expenseId));
        } else {
          const [expense] = await tx.insert(expensesTable).values(expenseValues).returning({ id: expensesTable.id });
          expenseId = expense.id;
        }

        const logValues = {
          date: context.date,
          startLocation: candidate.origin,
          endLocation: candidate.destination,
          miles: miles.toFixed(2),
          purpose: candidate.purpose,
          jobId: context.jobId,
          businessId: context.businessId,
          classification: "business",
          ratePerMile: rate.toFixed(3),
          deductionAmount: deductionAmount.toFixed(2),
          notes: "Generated from the job card. Refresh from the job after an address changes.",
          source: candidate.source,
          expenseId,
        };

        if (existing) {
          await tx.update(mileageLogsTable).set(logValues).where(eq(mileageLogsTable.id, existing.id));
          actions.set(candidate.source, "updated");
        } else {
          await tx.insert(mileageLogsTable).values(logValues);
          actions.set(candidate.source, "created");
        }
      }
    });

    const refreshed = await buildCandidates(context);
    const response = {
      jobId: context.jobId,
      date: context.date,
      legs: refreshed.map(candidate =>
        presentLeg(context, candidate, actions.get(candidate.source) ?? "unchanged"),
      ),
    };
    res.json(SyncJobMileageLegsResponse.parse(response));
  }),
);

export default router;