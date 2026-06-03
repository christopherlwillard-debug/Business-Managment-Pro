import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable } from "@workspace/db/schema";

const router = Router();

function validateSecret(req: import("express").Request): boolean {
  const envSecret = process.env["WIX_WEBHOOK_SECRET"];
  if (!envSecret) return true;
  const headerSecret = req.headers["x-wix-secret"] as string | undefined;
  const queryToken = typeof req.query["token"] === "string" ? req.query["token"] : undefined;
  return headerSecret === envSecret || queryToken === envSecret;
}

function extractField(body: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const parts = key.split(".");
    let val: unknown = body;
    for (const part of parts) {
      if (val && typeof val === "object") {
        val = (val as Record<string, unknown>)[part];
      } else {
        val = undefined;
        break;
      }
    }
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return null;
}

router.post("/", async (req, res) => {
  if (!validateSecret(req)) {
    console.warn("[wix-integration] Unauthorized request — invalid or missing secret");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body as Record<string, unknown>;

    const contactName =
      (() => {
        const first = extractField(body, "contact.firstName", "submitter.firstName", "firstName", "first_name", "name");
        const last = extractField(body, "contact.lastName", "submitter.lastName", "lastName", "last_name");
        if (first && last) return `${first} ${last}`;
        return first ?? last ?? extractField(body, "contact.name", "submitter.name", "fullName", "full_name", "contactName");
      })();

    const contactPhone = extractField(
      body,
      "contact.phone", "submitter.phone", "phone", "phoneNumber",
      "phone_number", "contactPhone", "mobile", "cell"
    );

    const contactEmail = extractField(
      body,
      "contact.email", "submitter.email", "email", "emailAddress",
      "email_address", "contactEmail"
    );

    const address = extractField(
      body,
      "address.street", "address.addressLine1", "address", "streetAddress",
      "street_address", "propertyAddress", "property_address", "location"
    ) ?? "Address not provided";

    const city = extractField(
      body,
      "address.city", "city"
    );

    const state = extractField(
      body,
      "address.state", "address.subdivision", "state"
    );

    const zip = extractField(
      body,
      "address.zip", "address.postalCode", "address.zipCode", "zip", "postalCode", "zipCode"
    );

    const notes = (() => {
      const desc = extractField(
        body,
        "message", "description", "serviceDescription", "service_description",
        "projectDescription", "project_description", "notes", "details", "comments",
        "jobDescription", "job_description", "inquiry"
      );
      const parts: string[] = [];
      if (desc) parts.push(desc);
      const service = extractField(body, "service", "serviceType", "service_type", "jobType");
      if (service) parts.push(`Service: ${service}`);
      if (!contactName && !desc && !service) return "Submitted via website";
      return parts.join("\n") || null;
    })();

    const [prospect] = await db
      .insert(prospectsTable)
      .values({
        address,
        city: city?.slice(0, 100) ?? null,
        state: state?.slice(0, 2).toUpperCase() ?? null,
        zip: zip?.replace(/\D/g, "").slice(0, 5) ?? null,
        contactName: contactName?.slice(0, 200) ?? null,
        contactPhone: contactPhone?.slice(0, 50) ?? null,
        contactEmail: contactEmail?.slice(0, 200) ?? null,
        notes: notes?.slice(0, 2000) ?? null,
        status: "cold",
        propertyType: "Other",
        source: "wix_form",
      })
      .returning({ id: prospectsTable.id });

    console.log(`[wix-integration] Created prospect #${prospect.id} — ${contactName ?? "no name"} (${address})`);
    return res.status(200).json({ received: true, prospectId: prospect.id });
  } catch (err) {
    console.error("[wix-integration] Error creating prospect:", err);
    return res.status(500).json({ error: "Failed to create prospect" });
  }
});

export default router;
