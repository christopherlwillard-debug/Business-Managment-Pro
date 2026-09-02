import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import {
  bidBusinessSettingsTable,
  bidCapabilityProfilesTable,
  businessesTable,
  crewCertificationsTable,
  crewMembersTable,
  jobsTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";

const NAVY = "#17324d";
const BLUE = "#2563eb";
const TEAL = "#0f766e";
const DARK = "#1f2937";
const GRAY = "#667085";
const LIGHT = "#e5e7eb";
const PALE_BLUE = "#eff6ff";
const PAGE_WIDTH = 612;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type CapabilityStatementResult = {
  buffer: Buffer;
  filename: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "business";
}

function compactDescription(value: unknown): string {
  const description = cleanText(value).replace(/\s+/g, " ");
  if (!description) return "";
  const firstSentence = description.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? description;
  if (firstSentence.length <= 220) return firstSentence;
  return `${firstSentence.slice(0, 217).trimEnd()}…`;
}

function formatLocation(city: string | null, state: string | null): string {
  return [cleanText(city), cleanText(state)].filter(Boolean).join(", ");
}

export async function generateCapabilityStatementPdfBuffer(
  businessId: number,
): Promise<CapabilityStatementResult | null> {
  const today = new Date().toISOString().slice(0, 10);
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId))
    .limit(1);

  if (!business) return null;

  const [bidSettings] = await db
    .select()
    .from(bidBusinessSettingsTable)
    .where(eq(bidBusinessSettingsTable.businessId, businessId))
    .limit(1);

  const [capabilityProfiles, certifications, pastProjects] = await Promise.all([
    db
      .select()
      .from(bidCapabilityProfilesTable)
      .where(and(
        eq(bidCapabilityProfilesTable.businessId, businessId),
        eq(bidCapabilityProfilesTable.active, true),
      ))
      .orderBy(
        asc(bidCapabilityProfilesTable.sortOrder),
        asc(bidCapabilityProfilesTable.id),
      ),
    db
      .select({
        certificationName: crewCertificationsTable.certificationName,
        issuingBody: crewCertificationsTable.issuingBody,
        certNumber: crewCertificationsTable.certNumber,
      })
      .from(crewCertificationsTable)
      .innerJoin(
        crewMembersTable,
        eq(crewCertificationsTable.crewMemberId, crewMembersTable.id),
      )
      .where(and(
        eq(crewMembersTable.businessId, businessId),
        eq(crewMembersTable.active, true),
        inArray(crewCertificationsTable.status, ["active", "expiring_soon"]),
        or(
          isNull(crewCertificationsTable.expiresAt),
          gte(crewCertificationsTable.expiresAt, today),
        ),
      )),
    db
      .select({
        title: jobsTable.title,
        description: jobsTable.description,
        jobType: jobsTable.jobType,
        city: jobsTable.city,
        state: jobsTable.state,
        closedAt: jobsTable.closedAt,
        endDate: jobsTable.endDate,
        createdAt: jobsTable.createdAt,
      })
      .from(jobsTable)
      .where(and(
        or(
          eq(jobsTable.businessId, businessId),
          and(
            isNull(jobsTable.businessId),
            eq(jobsTable.businessLine, business.slug),
          ),
        ),
        inArray(jobsTable.status, ["completed", "invoiced", "closed"]),
      ))
      .orderBy(desc(jobsTable.closedAt), desc(jobsTable.createdAt))
      .limit(8),
  ]);

  const doc = new PDFDocument({
    size: "Letter",
    margins: { top: 42, bottom: 44, left: MARGIN, right: MARGIN },
    info: {
      Title: `Capability Statement — ${business.name}`,
      Author: business.name,
      Subject: "Government contracting capability statement",
    },
  }) as any;

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  function drawFooter() {
    const previousY = doc.y;
    const previousBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .save()
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(GRAY)
      .text(
        `${business.name}  •  Capability Statement  •  Generated ${new Date().toLocaleDateString("en-US")}`,
        MARGIN,
        doc.page.height - 28,
        { width: CONTENT_WIDTH, align: "center", lineBreak: false },
      )
      .restore();
    doc.page.margins.bottom = previousBottomMargin;
    doc.y = previousY;
  }

  doc.on("pageAdded", drawFooter);

  function ensureSpace(height: number) {
    if (doc.y + height > doc.page.height - 58) doc.addPage();
  }

  function sectionHeading(label: string) {
    ensureSpace(30);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(NAVY)
      .text(label.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.7 });
    doc
      .moveTo(MARGIN, doc.y + 5)
      .lineTo(MARGIN + 48, doc.y + 5)
      .lineWidth(2)
      .strokeColor(TEAL)
      .stroke();
    doc.moveDown(0.7);
  }

  function bullet(text: string, options: { color?: string; width?: number } = {}) {
    const width = options.width ?? CONTENT_WIDTH - 14;
    const height = doc.heightOfString(text, { width, lineGap: 2 });
    ensureSpace(height + 8);
    const y = doc.y;
    doc.circle(MARGIN + 3, y + 5, 2).fillColor(options.color ?? BLUE).fill();
    doc
      .font("Helvetica")
      .fontSize(9.2)
      .fillColor(DARK)
      .text(text, MARGIN + 14, y, { width, lineGap: 2 });
    doc.moveDown(0.35);
  }

  function wrapped(text: string, size = 9.2, color = DARK) {
    const height = doc.heightOfString(text, { width: CONTENT_WIDTH, lineGap: 2 });
    ensureSpace(height + 5);
    doc.font("Helvetica").fontSize(size).fillColor(color).text(text, {
      width: CONTENT_WIDTH,
      lineGap: 2,
    });
    doc.moveDown(0.45);
  }

  // Branded header.
  doc.rect(0, 0, PAGE_WIDTH, 124).fill(NAVY);
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor("#ffffff")
    .text(business.name, MARGIN, 32, { width: 390 });
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#cbd5e1")
    .text("CAPABILITY STATEMENT", MARGIN, 67, { characterSpacing: 1.5 });

  if (bidSettings?.isSdvosb) {
    doc.roundedRect(PAGE_WIDTH - MARGIN - 126, 35, 126, 36, 6).fill(TEAL);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#ffffff")
      .text("SDVOSB", PAGE_WIDTH - MARGIN - 126, 46, { width: 126, align: "center" });
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#d1fae5")
      .text("SERVICE-DISABLED VETERAN-OWNED", PAGE_WIDTH - MARGIN - 126, 59, {
        width: 126,
        align: "center",
      });
  }

  const contactLine = [
    business.address,
    formatLocation(business.city, business.state),
    business.zip,
  ].map(cleanText).filter(Boolean).join("  •  ");
  const contactDetails = [contactLine, business.phone, business.email]
    .map(cleanText)
    .filter(Boolean)
    .join("  •  ");
  if (contactDetails) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#e2e8f0")
      .text(contactDetails, MARGIN, 99, { width: CONTENT_WIDTH });
  }

  doc.y = 148;
  sectionHeading("Core Competencies");

  const uniqueCapabilities = new Set<string>();
  for (const profile of capabilityProfiles) {
    const name = cleanText(profile.name);
    if (!name || uniqueCapabilities.has(name.toLowerCase())) continue;
    uniqueCapabilities.add(name.toLowerCase());
    const description = compactDescription(profile.description);
    bullet(description ? `${name} — ${description}` : name);
  }
  if (uniqueCapabilities.size === 0) {
    wrapped("Add active capability profiles in Bid Settings to feature your services here.", 9, GRAY);
  }

  const naicsCodes = [...new Set(
    capabilityProfiles.flatMap((profile) => asStringArray(profile.naicsCodes)),
  )];
  if (naicsCodes.length > 0) {
    sectionHeading("NAICS Codes");
    wrapped(naicsCodes.join("  •  "), 10, DARK);
  }

  const qualificationLines: string[] = [];
  if (bidSettings?.isSdvosb) qualificationLines.push("Service-Disabled Veteran-Owned Small Business (SDVOSB)");
  if (bidSettings?.isVosb) qualificationLines.push("Veteran-Owned Small Business (VOSB)");
  if (bidSettings?.isSmallBusiness) qualificationLines.push("Small Business");
  if (bidSettings?.isHubzone) qualificationLines.push("HUBZone");
  if (bidSettings?.is8a) qualificationLines.push("SBA 8(a) Business Development");
  if (cleanText(business.licenseNumber)) qualificationLines.push(`License / registration: ${business.licenseNumber}`);
  for (const certification of certifications) {
    const label = [cleanText(certification.certificationName), cleanText(certification.issuingBody)]
      .filter(Boolean)
      .join(" — ");
    if (label && !qualificationLines.some((line) => line.toLowerCase() === label.toLowerCase())) {
      qualificationLines.push(label);
    }
  }
  if (qualificationLines.length > 0) {
    sectionHeading("Certifications & Qualifications");
    for (const line of qualificationLines) bullet(line, { color: TEAL });
  }

  if (pastProjects.length > 0) {
    sectionHeading("Selected Past Performance");
    for (const project of pastProjects) {
      const location = formatLocation(project.city, project.state);
      const metadata = [cleanText(project.jobType), location].filter(Boolean).join("  •  ");
      const title = cleanText(project.title) || "Completed project";
      const summary = cleanText(project.description);
      const text = [title, metadata ? `(${metadata})` : "", summary ? `— ${summary}` : ""]
        .filter(Boolean)
        .join(" ");
      bullet(text, { color: NAVY });
    }
  }

  if (qualificationLines.length === 0 && pastProjects.length === 0) {
    sectionHeading("Company Profile");
    wrapped(
      "This statement is generated from the business profile and bid settings currently saved in Willard.",
      9,
      GRAY,
    );
  }

  drawFooter();
  doc.end();

  await new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  return {
    buffer: Buffer.concat(chunks),
    filename: `Capability-Statement-${safeFilename(business.name)}.pdf`,
  };
}
