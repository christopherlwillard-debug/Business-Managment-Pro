import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const f = vi.hoisted(() => ({
  dbSelect: [] as unknown[][],
  txSelect: [] as unknown[][],
  insertedRows: [] as Record<string, unknown>[],
  updatedOrders: [] as Record<string, unknown>[],
  txCount: 0,
}));

vi.mock("@workspace/db", () => {
  function chain(queue: unknown[][]) {
    const result: any = {
      from: () => result, innerJoin: () => result, leftJoin: () => result,
      where: () => result, orderBy: () => result, limit: () => result,
      for: () => result,
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        const next = queue.shift();
        if (!next) return Promise.reject(new Error("Unexpected database select")).then(resolve, reject);
        return Promise.resolve(next).then(resolve, reject);
      },
    };
    return result;
  }
  return {
    db: {
      select: () => chain(f.dbSelect),
      insert: () => ({
        values: (value: Record<string, unknown>) => {
          f.insertedRows.push(value);
          return { returning: async () => [{ id: 900 + f.insertedRows.length, ...value }] };
        },
      }),
      transaction: async (work: (tx: any) => Promise<unknown>) => {
        f.txCount += 1;
        return work({
          select: () => chain(f.txSelect),
          insert: () => ({
            values: (value: Record<string, unknown>) => {
              f.insertedRows.push(value);
              return { returning: async () => [{ id: 900 + f.insertedRows.length }] };
            },
          }),
          update: () => ({
            set: (value: Record<string, unknown>) => ({
              where: async () => { f.updatedOrders.push(value); },
            }),
          }),
        });
      },
    },
  };
});

vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async () => ({ id: 7, slug: "general_contracting" }),
  resolveMutationBusiness: async () => ({ ok: true, explicit: true, business: { id: 7, slug: "general_contracting" } }),
  sameLegalBusiness: async () => true,
}));
vi.mock("../lib/property-access.js", () => ({ hasPropertyPermission: () => true }));
vi.mock("./guards", () => ({ getRequestUserId: () => "user_test" }));

const { default: router } = await import("./contract-work-orders");
const app = express();
app.use(express.json());
app.use("/jobs", router);

const orderBase = {
  id: 44, businessId: 7, programId: 6, externalOrderNumber: "SH-100",
  title: "Install entry door", scope: null, homeownerContactId: null,
  propertyId: null, agreedPrice: null, status: "pending_review", jobId: null,
};

function sageHomeRequirementFixture(type: "shower" | "standard_tub" | "walk_in_tub" | "tub_to_shower_conversion") {
  const required = (title: string, evidenceType: string | null = null) => ({ title, evidenceType, requirementStatus: "required", conditionKey: null });
  const photo = (title: string) => required(title, "image");
  const document = (title: string) => required(title, "document");
  const showerPhotos = [
    "Before shot of entire bathroom", "Tear out area — wide view", "Valve installed / mounted properly",
    "P-trap installed", "Drain hook up", "Mortar bed", "Pan secured, screwed / shimmed",
    "Backerboard / bracing", "All three walls where they meet the shower base / caulk joint",
    "Accessories (Hydrorail / window trim, etc.)", "Before & After Photos of any additional",
    "Both walls where it meets customer's wall", "Shower pan where it meets customer's floor",
    "After shot of entire bathroom",
  ];
  const tubPhotos = [
    "Before shot of entire bathroom", "Before & after of additional work / doorways / toilets / vanity, etc.",
    "Electrical panel completed and labeled", "Outlets properly mounted under tub",
    "Screws mounting the tub to floor", "Drain hook up / P-trap installed", "Proper mounting for gap panel",
    "All three walls where tub meets the wall", "Both walls where panels meet customer's",
    "After shot of entire bathroom work / doorways / toilets / vanity, etc.",
  ];
  return [
    required("Review the job, products, and accessory locations with the homeowner"),
    photo("Photograph the entry-to-work-area path and work area before work starts"),
    { title: "Photograph pre-existing damage (highly recommended; optional)", evidenceType: null, requirementStatus: "recommended", conditionKey: null },
    required("Test plumbing and electrical function, including water flow and drain times; record issues in notes"),
    required("Review the inspection and photographs with the homeowner"),
    required("Protect floors from entrance to work area; close doors or cover openings to control dust"),
    required("Notify homeowner and provide return ETA when leaving; call homeowner and notify coordinator/manager of delays"),
    photo("Take installation-stage photos for verification and invoicing"),
    required("Submit a list of all job photos at completion (photo policy reference)"),
    required("At each day's end, clean debris, review progress with homeowner, and agree next-day ETA"),
    required("If extra-scope work occurs, photograph the issue and obtain Company approval"),
    ...["before", "after"].map(side => ({
      title: `Conditional additional-work: ${side} photo (complete only when extra work occurs)`,
      evidenceType: "image", requirementStatus: "conditional", conditionKey: "additional_work",
    })),
    ...(type === "shower" || type === "tub_to_shower_conversion" ? showerPhotos : tubPhotos).map(photo),
    required("Review completed work with homeowner before putting tools away and address requested adjustments"),
    required("Demonstrate product features and confirm homeowner is comfortable operating the shower or tub"),
    required("Remove tools and debris and thoroughly clean the home"),
    document("Upload signed-off homeowner paperwork"), document("Collect and upload completed referral form"),
    required("Collect any balance due as indicated on the paperwork; contact coordinator/manager if unable to collect"),
    ...(["standard_tub", "walk_in_tub"].includes(type) ? [required("Record serial number on all tub paperwork in the proper location")] : []),
    ...(type === "walk_in_tub" ? [
      required("Walk-in tub: verify faucet does not drip"),
      required("Walk-in tub: verify shower wand does not leak while filling"),
      required("Walk-in tub: verify efficient drainage"),
      required("Walk-in tub: verify jets operate where applicable"),
      required("Walk-in tub: verify controls operate properly before leaving"),
    ] : []),
    document("Upload reimbursable or Company-payable receipts, when applicable"),
    required("Confirm homeowner name appears on receipts and paperwork"),
    required("Staff-confirm all job photos uploaded to Lead Perfection before invoice submission"),
    required("Submit invoice to installers@sagehome.com within 24 hours after completion"),
    required("Include job name and job number in email subject and on invoice"),
    required("Include signed homeowner paperwork and applicable receipts with invoice submission"),
  ].map((item, index) => ({
    ...item,
    requirementKey: item.title.includes("highly recommended; optional") ? "preexisting_damage_photo"
      : item.title.includes("Conditional additional-work: before") ? "additional_work_before_photo"
      : item.title.includes("Conditional additional-work: after") ? "additional_work_after_photo"
      : item.title === "Remove tools and debris and thoroughly clean the home" ? "installation_cleanup_complete"
      : item.title === "Upload signed-off homeowner paperwork" ? "homeowner_signed_paperwork"
      : item.title === "Collect and upload completed referral form" ? "referral_form"
      : item.title.includes("Lead Perfection") ? "lead_perfection_upload"
      : item.title.startsWith("Submit invoice to") ? "invoice_submission"
      : item.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") + `_${index}`,
  }));
}

beforeEach(() => {
  f.dbSelect.length = 0;
  f.txSelect.length = 0;
  f.insertedRows.length = 0;
  f.updatedOrders.length = 0;
  f.txCount = 0;
});
afterEach(() => {
  expect(f.dbSelect).toHaveLength(0);
  expect(f.txSelect).toHaveLength(0);
});

describe("contract work-order acceptance", () => {
  it.each([
    ["shower", "Valve installed / mounted properly", false],
    ["standard_tub", "Electrical panel completed and labeled", false],
    ["walk_in_tub", "Electrical panel completed and labeled", true],
    ["tub_to_shower_conversion", "Valve installed / mounted properly", false],
  ])("snapshots SageHome %s-specific evidence requirements", async (installationType, expectedPhoto, isWalkIn) => {
    const order = { ...orderBase, installationType };
    f.txSelect.push(
      [order],
      [{
        id: 6, businessId: 7, payerClientId: 12, name: "SageHome Brands",
        active: true, requiresInstallationPhotos: true, requiresCompletionDocumentation: true,
      }],
      [{ maxNum: 510 }],
      [],
      ...Array.from({ length: 5 }, () => []),
    );
    f.dbSelect.push([{
      ...orderBase, programName: "SageHome Brands", payerClientId: 12, payerName: "SageHome Brands",
      homeownerName: null, propertyLabel: null, propertyAddress: null, status: "accepted", jobId: 901,
      acceptedAt: new Date().toISOString(), declineReason: null, cancellationReason: null,
    }]);

    await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(200);

    const items = f.insertedRows.filter(row => Object.hasOwn(row, "requiredEvidenceType"));
    const titles = items.map(row => row.title);
    const parityFixture = sageHomeRequirementFixture(installationType as "shower" | "standard_tub" | "walk_in_tub" | "tub_to_shower_conversion");
    expect(titles).toEqual(parityFixture.map(item => item.title));
    expect(items.map(row => row.requiredEvidenceType)).toEqual(parityFixture.map(item =>
      item.requirementStatus === "conditional" ? null : item.evidenceType
    ));
    expect(titles).toContain(expectedPhoto);
    expect(titles).toContain("Upload signed-off homeowner paperwork");
    expect(titles).toContain("Staff-confirm all job photos uploaded to Lead Perfection before invoice submission");
    expect(items.find(row => String(row.title).includes("highly recommended; optional"))?.requiredEvidenceType).toBeNull();
    expect(items.filter(row => String(row.title).startsWith("Conditional additional-work:"))
      .every(row => row.requiredEvidenceType === null)).toBe(true);
    expect(titles.some(title => String(title).startsWith("Walk-in tub:"))).toBe(isWalkIn);
  });

  it("creates one payer-linked job and returns the same job on retry", async () => {
    const acceptedOrder = { ...orderBase, status: "accepted", jobId: 901 };
    f.txSelect.push(
      [orderBase],
      [{
        id: 6, businessId: 7, payerClientId: 12, active: true,
        requiresInstallationPhotos: true, requiresCompletionDocumentation: true,
      }],
      [{ maxNum: 510 }],
      [],
      [],
    );
    f.dbSelect.push([{
      id: 44, businessId: 7, programId: 6, programName: "SageHome install",
      payerClientId: 12, payerName: "SageHome Brands", externalOrderNumber: "SH-100",
      title: "Install entry door", scope: null, homeownerContactId: null,
      homeownerName: null, propertyId: null, propertyLabel: null, propertyAddress: null,
      agreedPrice: null, status: "accepted", jobId: 901, acceptedAt: new Date().toISOString(),
      declineReason: null, cancellationReason: null,
    }]);
    const first = await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(200);
    expect(first.body.jobId).toBe(901);
    expect(first.body.payerName).toBe("SageHome Brands");
    expect(f.insertedRows).toHaveLength(5);
    expect(f.insertedRows[0]).toMatchObject({ clientId: 12, businessId: 7, title: "Install entry door" });
    expect(f.insertedRows[1]).toMatchObject({
      templateName: "Contract Work Order Completion",
      shareEnabled: false,
    });
    expect(f.insertedRows[2]).toMatchObject({ name: "Contract completion — SH-100" });
    expect(f.insertedRows.slice(3).map(row => row.title)).toEqual([
      "Capture installation photos",
      "Upload required completion documentation",
    ]);

    f.txSelect.push([acceptedOrder]);
    f.dbSelect.push([{ ...first.body, status: "accepted", jobId: 901 }]);
    const retry = await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(200);
    expect(retry.body.jobId).toBe(901);
    expect(f.insertedRows).toHaveLength(5);
    expect(f.txCount).toBe(2);
  });

  it("adds the contract completion section without replacing an existing job checklist", async () => {
    f.txSelect.push(
      [orderBase],
      [{
        id: 6, businessId: 7, payerClientId: 12, active: true,
        requiresInstallationPhotos: true, requiresCompletionDocumentation: true,
      }],
      [{ maxNum: 510 }],
      [{ id: 733 }],
      [],
    );
    f.dbSelect.push([{
      id: 44, businessId: 7, programId: 6, programName: "SageHome install",
      payerClientId: 12, payerName: "SageHome Brands", externalOrderNumber: "SH-100",
      title: "Install entry door", scope: null, homeownerContactId: null,
      homeownerName: null, propertyId: null, propertyLabel: null, propertyAddress: null,
      agreedPrice: null, status: "accepted", jobId: 901, acceptedAt: new Date().toISOString(),
      declineReason: null, cancellationReason: null,
    }]);

    await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(200);

    expect(f.insertedRows).toHaveLength(4);
    expect(f.insertedRows[1]).toMatchObject({
      jobChecklistId: 733,
      name: "Contract completion — SH-100",
    });
    expect(f.insertedRows.slice(2).map(row => row.title)).toEqual([
      "Capture installation photos",
      "Upload required completion documentation",
    ]);
  });

  it("does not infer completion requirements for an unconfigured client program", async () => {
    f.txSelect.push(
      [orderBase],
      [{
        id: 6, businessId: 7, payerClientId: 12, active: true,
        requiresInstallationPhotos: false, requiresCompletionDocumentation: false,
      }],
      [{ maxNum: 510 }],
    );
    f.dbSelect.push([{
      id: 44, businessId: 7, programId: 6, programName: "Other client",
      payerClientId: 12, payerName: "Other client", externalOrderNumber: "OC-200",
      title: "Install entry door", scope: null, homeownerContactId: null,
      homeownerName: null, propertyId: null, propertyLabel: null, propertyAddress: null,
      agreedPrice: null, status: "accepted", jobId: 901, acceptedAt: new Date().toISOString(),
      declineReason: null, cancellationReason: null,
    }]);

    await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(200);

    expect(f.insertedRows).toHaveLength(1);
    expect(f.insertedRows[0]).toMatchObject({ title: "Install entry door", clientId: 12 });
  });

  it("declines without creating a job", async () => {
    f.txSelect.push([orderBase]);
    f.dbSelect.push([{
      id: 44, businessId: 7, programId: 6, programName: "SageHome install",
      payerClientId: 12, payerName: "SageHome Brands", externalOrderNumber: "SH-100",
      title: "Install entry door", scope: null, homeownerContactId: null, homeownerName: null,
      propertyId: null, propertyLabel: null, propertyAddress: null, agreedPrice: null,
      status: "declined", jobId: null, acceptedAt: null, declineReason: "Outside area",
      cancellationReason: null,
    }]);
    const response = await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "decline", reason: "Outside area" }).expect(200);
    expect(response.body.status).toBe("declined");
    expect(f.insertedRows).toHaveLength(0);
    expect(f.updatedOrders[0]).toMatchObject({ status: "declined", declineReason: "Outside area" });
  });

  it("requires a reason and records cancellation without deleting the job", async () => {
    const acceptedOrder = { ...orderBase, status: "accepted", jobId: 901 };
    await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "cancel" }).expect(400);
    f.txSelect.push([acceptedOrder]);
    f.dbSelect.push([{
      id: 44, businessId: 7, programId: 6, programName: "SageHome install",
      payerClientId: 12, payerName: "SageHome Brands", externalOrderNumber: "SH-100",
      title: "Install entry door", scope: null, homeownerContactId: null, homeownerName: null,
      propertyId: null, propertyLabel: null, propertyAddress: null, agreedPrice: null,
      status: "cancelled", jobId: 901, acceptedAt: new Date().toISOString(),
      declineReason: null, cancellationReason: "Customer rescheduled",
    }]);
    const response = await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "cancel", reason: "Customer rescheduled" }).expect(200);
    expect(response.body.status).toBe("cancelled");
    expect(response.body.jobId).toBe(901);
    expect(f.insertedRows).toHaveLength(0);
    expect(f.updatedOrders[0]).toMatchObject({ status: "cancelled", cancellationReason: "Customer rescheduled" });
  });

  it("does not expose a work order outside the selected business", async () => {
    f.txSelect.push([]);
    await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(404);
    expect(f.insertedRows).toHaveLength(0);
    expect(f.dbSelect).toHaveLength(0);
  });
});

describe("contract program work-type configuration", () => {
  const templateItems = [
    { id: 1, sectionId: 21, requirementKey: "homeowner_walkthrough", requirementStatus: "required", conditionKey: null },
    { id: 2, sectionId: 21, requirementKey: "optional_damage_photo", requirementStatus: "recommended", conditionKey: null },
    { id: 3, sectionId: 21, requirementKey: "extra_work_before_photo", requirementStatus: "conditional", conditionKey: "additional_work" },
  ];
  const queueValidTemplate = (templateBusinessId = 7) => {
    f.dbSelect.push(
      [{ id: 6, businessId: 7, active: true }],
      [{ id: 21, businessId: templateBusinessId, active: true }],
      [{ id: 21 }],
      templateItems,
    );
  };

  it("activates only a complete checklist owned by the program business", async () => {
    queueValidTemplate();
    const response = await request(app).post("/jobs/contract-client-programs/6/work-types")
      .send({ businessId: 7, key: "shower", displayName: "Shower", checklistTemplateId: 21, active: true })
      .expect(201);
    expect(response.body).toMatchObject({ id: 901, programId: 6, key: "shower", active: true });
    expect(f.insertedRows.at(-1)).toMatchObject({ programId: 6, checklistTemplateId: 21, active: true });
  });

  it("rejects a different business context", async () => {
    await request(app).post("/jobs/contract-client-programs/6/work-types")
      .send({ businessId: 8, key: "shower", displayName: "Shower", checklistTemplateId: 21 })
      .expect(400);
  });

  it("rejects a template owned by another business", async () => {
    f.dbSelect.push(
      [{ id: 6, businessId: 7, active: true }],
      [],
    );
    const response = await request(app).post("/jobs/contract-client-programs/6/work-types")
      .send({ businessId: 7, key: "shower", displayName: "Shower", checklistTemplateId: 21 })
    expect(response.status, JSON.stringify({ body: response.body, remaining: f.dbSelect.length })).toBe(404);
  });

  it("does not activate incomplete or unstable requirements", async () => {
    f.dbSelect.push(
      [{ id: 6, businessId: 7, active: true }],
      [{ id: 21, businessId: 7, active: true }],
      [{ id: 21 }],
      [{ id: 1, sectionId: 21, requirementKey: null, requirementStatus: "required" }],
    );
    await request(app).post("/jobs/contract-client-programs/6/work-types")
      .send({ businessId: 7, key: "shower", displayName: "Shower", checklistTemplateId: 21, active: true })
      .expect(409);
    expect(f.insertedRows).toHaveLength(0);
  });
});

describe("configured contract acceptance snapshots", () => {
  it.each(["shower", "standard_tub", "walk_in_tub", "tub_to_shower_conversion"] as const)(
    "copies exact %s requirements and submission settings into a job snapshot", async type => {
    const order = { ...orderBase, workTypeId: 73, installationType: null };
    const program = {
      id: 6, businessId: 7, payerClientId: 12, active: true,
      requiresInstallationPhotos: false, requiresCompletionDocumentation: false,
      invoiceSubmissionEmail: "installers@sagehome.com",
      invoiceSubmissionDeadlineHours: 24,
      invoiceSubmissionInstructions: "Email invoice and signed paperwork.",
    };
    const template = { id: 21, businessId: 7, name: "Shower requirements", active: true };
    const sourceItems = sageHomeRequirementFixture(type).map((item, index) => ({
      ...item, id: index + 1, sectionId: 31, sortOrder: index + 1,
    }));
    f.txSelect.push(
      [order], [program], [{ maxNum: 510 }], [{ id: 73, programId: 6, checklistTemplateId: 21, active: true }],
      [template], [{ id: 31, templateId: 21, name: "Evidence", sortOrder: 1 }], sourceItems, [],
    );
    f.dbSelect.push([{
      ...orderBase, workTypeId: 73, programName: "SageHome Brands", payerClientId: 12, payerName: "SageHome Brands",
      homeownerName: null, propertyLabel: null, propertyAddress: null, status: "accepted", jobId: 901,
      acceptedAt: new Date().toISOString(), declineReason: null, cancellationReason: null,
    }]);

    await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(200);

    expect(f.insertedRows[0]).toMatchObject({ clientId: 12, businessId: 7 });
    expect(f.insertedRows[1]).toMatchObject({
      contractInvoiceSubmissionEmail: "installers@sagehome.com",
      contractInvoiceSubmissionDeadlineHours: 24,
      contractInvoiceSubmissionInstructions: "Email invoice and signed paperwork.",
    });
    const snapshots = f.insertedRows.slice(3);
    expect(snapshots.map(row => row.title)).toEqual(sourceItems.map(item => item.title));
    expect(snapshots.map(row => row.requiredEvidenceType)).toEqual(sourceItems.map(item => item.evidenceType));
    expect(snapshots.map(row => row.requirementStatus)).toEqual(sourceItems.map(item => item.requirementStatus));
    expect(snapshots.filter(row => row.conditionKey === "additional_work")
      .every(row => row.requiredEvidenceType === "image" && row.requirementStatus === "conditional")).toBe(true);
    expect(snapshots.find(row => String(row.title).includes("highly recommended; optional")))
      .toMatchObject({ requirementStatus: "recommended", requiredEvidenceType: null });
    expect(snapshots.map(row => row.title)).toContain("Upload signed-off homeowner paperwork");
    expect(snapshots.map(row => row.title)).toContain("Staff-confirm all job photos uploaded to Lead Perfection before invoice submission");
    expect(snapshots.map(row => row.title)).toContain("Submit invoice to installers@sagehome.com within 24 hours after completion");
    const acceptedTitle = snapshots[0].title;

    program.invoiceSubmissionEmail = "changed@example.com";
    sourceItems[0].title = "Source template changed after acceptance";
    expect(f.insertedRows[1].contractInvoiceSubmissionEmail).toBe("installers@sagehome.com");
    expect(f.insertedRows[3].title).toBe(acceptedTitle);
  });
});
